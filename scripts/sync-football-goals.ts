import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_SEASON, fplGet } from './football-sync/helpers';

/**
 * Sync gameweek goalscorers from FPL event live → football_player_gameweek_goals
 * then call f2t_apply_gameweek_goals for active/recent gameweeks.
 *
 * Chain after sync-lms-football.ts on the same cron.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 * Optional: F2T_SEASON=2026/27, F2T_GOAL_GW_NUMBER (force specific GW)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SEASON = process.env.F2T_SEASON ?? process.env.LMS_SEASON ?? DEFAULT_SEASON;
const FORCE_GW = process.env.F2T_GOAL_GW_NUMBER
  ? Number(process.env.F2T_GOAL_GW_NUMBER)
  : null;

type FplLive = {
  elements: Array<{
    id: number;
    stats: {
      goals_scored: number;
    };
  }>;
};

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: gameweeks, error: gwErr } = await supabase
    .from('lms_gameweeks')
    .select('id, number, status')
    .eq('season', SEASON)
    .order('number', { ascending: true });
  if (gwErr) throw gwErr;

  const gws = (gameweeks ?? []) as { id: string; number: number; status: string }[];

  let targetGws: { id: string; number: number }[] = [];

  if (FORCE_GW != null && !Number.isNaN(FORCE_GW)) {
    const g = gws.find((x) => x.number === FORCE_GW);
    if (g) targetGws = [{ id: g.id, number: g.number }];
  } else {
    // Live or upcoming first GW; also process recently completed
    const live = gws.find((g) => g.status === 'live');
    const upcoming = gws.find((g) => g.status === 'upcoming');
    const complete = gws.filter((g) => g.status === 'complete').slice(-2);
    if (live) targetGws.push({ id: live.id, number: live.number });
    if (upcoming && !targetGws.some((t) => t.id === upcoming.id)) {
      targetGws.push({ id: upcoming.id, number: upcoming.number });
    }
    for (const c of complete) {
      if (!targetGws.some((t) => t.id === c.id)) {
        targetGws.push({ id: c.id, number: c.number });
      }
    }
  }

  if (targetGws.length === 0) {
    console.log('[fpl-goals] No target gameweeks — exit');
    return;
  }

  const { data: players, error: pErr } = await supabase
    .from('football_players')
    .select('id, fpl_element_id')
    .not('fpl_element_id', 'is', null);
  if (pErr) throw pErr;

  const fplToPlayer = new Map<number, string>();
  for (const p of players ?? []) {
    if (p.fpl_element_id != null) fplToPlayer.set(p.fpl_element_id, p.id);
  }

  let totalUpserts = 0;

  for (const gw of targetGws) {
    console.log(`[fpl-goals] GW ${gw.number}…`);
    const live = await fplGet<FplLive>(`/event/${gw.number}/live/`);
    let gwUpserts = 0;

    for (const el of live.elements ?? []) {
      const goals = el.stats?.goals_scored ?? 0;
      if (goals <= 0) continue;

      const playerId = fplToPlayer.get(el.id);
      if (!playerId) continue;

      const { data: existing } = await supabase
        .from('football_player_gameweek_goals')
        .select('id, goals')
        .eq('player_id', playerId)
        .eq('gameweek_id', gw.id)
        .maybeSingle();

      if (existing && existing.goals === goals) continue;

      const { error } = await supabase.from('football_player_gameweek_goals').upsert(
        {
          player_id: playerId,
          gameweek_id: gw.id,
          goals,
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'player_id,gameweek_id' }
      );
      if (error) throw error;
      gwUpserts += 1;
    }

    console.log(`[fpl-goals] GW ${gw.number}: ${gwUpserts} goal rows written`);

    const { data: applyRes, error: applyErr } = await supabase.rpc('f2t_apply_gameweek_goals', {
      p_gameweek_id: gw.id,
    });
    if (applyErr) throw applyErr;
    console.log(`[fpl-goals] apply RPC:`, applyRes);

    totalUpserts += gwUpserts;
  }

  console.log(`[fpl-goals] Done. Total goal row writes: ${totalUpserts}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
