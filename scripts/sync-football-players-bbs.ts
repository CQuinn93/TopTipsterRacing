import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  bbsListAll,
  loadLmsTeams,
  matchLmsTeam,
  normalizeFootballPosition,
} from './football-sync/helpers';

/**
 * Sync Premier League player roster from Big Balls into football_players.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, BIG_BALLS_API
 * Optional: BBS_LEAGUE=epl
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BBS_KEY =
  process.env.BIG_BALLS_API ??
  process.env.BBS_API_KEY ??
  process.env.BIG_BALLS_API_KEY;
const BBS_LEAGUE = process.env.BBS_LEAGUE ?? 'epl';

type BbsTeam = {
  id: string;
  name: string;
  short_name?: string;
  abbreviation?: string;
};

type BbsPlayer = {
  id: string;
  name?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: { id?: string; name?: string };
  team_id?: string;
  team_name?: string;
};

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  if (!BBS_KEY) {
    console.error('Set BIG_BALLS_API');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const lmsTeams = await loadLmsTeams(supabase);

  console.log('[bbs-players] Fetching teams…');
  const bbsTeams = await bbsListAll<BbsTeam>(
    `/teams?sport=football&league=${BBS_LEAGUE}`,
    BBS_KEY
  );
  const bbsTeamToLms = new Map<string, string>();
  for (const bt of bbsTeams) {
    const matched = matchLmsTeam(lmsTeams, bt.name, bt.short_name ?? bt.abbreviation);
    if (matched) bbsTeamToLms.set(bt.id, matched.id);
  }
  console.log(`[bbs-players] Mapped ${bbsTeamToLms.size}/${bbsTeams.length} BBS teams to lms_teams`);

  console.log('[bbs-players] Fetching players…');
  const players = await bbsListAll<BbsPlayer>(
    `/players?sport=football&league=${BBS_LEAGUE}`,
    BBS_KEY
  );
  console.log(`[bbs-players] Fetched ${players.length} players from Big Balls`);

  let upserted = 0;
  let skipped = 0;

  for (const p of players) {
    const bbsId = p.id;
    const display =
      (p.display_name ?? p.name ?? '').trim() ||
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    if (!display || !bbsId) {
      skipped += 1;
      continue;
    }

    const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || display;
    const position = normalizeFootballPosition(p.position);
    const bbsTeamId = p.team?.id ?? p.team_id;
    let teamId = bbsTeamId ? bbsTeamToLms.get(bbsTeamId) : undefined;
    if (!teamId && p.team?.name) {
      const m = matchLmsTeam(lmsTeams, p.team.name);
      if (m) teamId = m.id;
    }
    if (!teamId && p.team_name) {
      const m = matchLmsTeam(lmsTeams, p.team_name);
      if (m) teamId = m.id;
    }
    if (!teamId) {
      skipped += 1;
      continue;
    }

    const { data: existing } = await supabase
      .from('football_players')
      .select('id, owner_flagged')
      .eq('bbs_player_id', bbsId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('football_players')
        .update({
          team_id: teamId,
          display_name: display,
          full_name: fullName,
          position: position || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { data: byName } = await supabase
        .from('football_players')
        .select('id')
        .eq('team_id', teamId)
        .ilike('display_name', display)
        .maybeSingle();

      if (byName) {
        const { error } = await supabase
          .from('football_players')
          .update({
            bbs_player_id: bbsId,
            full_name: fullName,
            position: position || null,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', byName.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('football_players').insert({
          team_id: teamId,
          display_name: display,
          full_name: fullName,
          bbs_player_id: bbsId,
          position: position || null,
          is_active: true,
        });
        if (error) throw error;
      }
    }
    upserted += 1;
  }

  console.log(`[bbs-players] Upserted: ${upserted}; skipped: ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
