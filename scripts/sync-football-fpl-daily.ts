import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_SEASON,
  fplGet,
  loadLmsTeams,
  matchLmsTeam,
  normalizeFootballPosition,
} from './football-sync/helpers';

/**
 * Daily FPL bootstrap sync: picker_stats + news hints on football_players.
 * Never updates owner_flagged.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

type FplBootstrap = {
  elements: Array<{
    id: number;
    web_name: string;
    first_name: string;
    second_name: string;
    team: number;
    team_code: number;
    element_type: number;
    status: string;
    news: string;
    chance_of_playing_this_round?: number | null;
    chance_of_playing_next_round?: number | null;
    news_added?: string | null;
    minutes: number;
    starts: number;
    goals_scored: number;
    assists: number;
    form: string;
    selected_by_percent: string;
    ict_index: string;
    expected_goals?: string;
    expected_assists?: string;
    points_per_game: string;
    removed: boolean;
  }>;
  teams: Array<{
    id: number;
    name: string;
    short_name: string;
    code: number;
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

  const lmsTeams = await loadLmsTeams(supabase);
  console.log('[fpl-daily] Fetching bootstrap-static…');
  const boot = await fplGet<FplBootstrap>('/bootstrap-static/');

  const fplTeamToLms = new Map<number, string>();
  for (const ft of boot.teams ?? []) {
    const m = matchLmsTeam(lmsTeams, ft.name, ft.short_name);
    if (m) fplTeamToLms.set(ft.id, m.id);
  }

  let updated = 0;
  let inserted = 0;

  for (const el of boot.elements ?? []) {
    const teamId = fplTeamToLms.get(el.team);
    if (!teamId) continue;

    const pickerStats = {
      season_goals: el.goals_scored,
      season_assists: el.assists,
      form: el.form,
      minutes: el.minutes,
      starts: el.starts,
      selected_by_percent: el.selected_by_percent,
      ict_index: el.ict_index,
      expected_goals: el.expected_goals ?? null,
      expected_assists: el.expected_assists ?? null,
      points_per_game: el.points_per_game,
      news: el.news ?? '',
      fpl_status: el.status,
      chance_of_playing_this_round: el.chance_of_playing_this_round ?? null,
      chance_of_playing_next_round: el.chance_of_playing_next_round ?? null,
      news_added: el.news_added ?? null,
    };

    const display = el.web_name?.trim() || `${el.first_name} ${el.second_name}`.trim();
    const fullName = `${el.first_name} ${el.second_name}`.trim();
    const position = normalizeFootballPosition(null, el.element_type);

    const { data: existing } = await supabase
      .from('football_players')
      .select('id, owner_flagged')
      .eq('fpl_element_id', el.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('football_players')
        .update({
          team_id: teamId,
          display_name: display,
          full_name: fullName,
          position,
          is_active: !el.removed,
          picker_stats: pickerStats,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) throw error;
      updated += 1;
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
            fpl_element_id: el.id,
            full_name: fullName,
            position,
            is_active: !el.removed,
            picker_stats: pickerStats,
            updated_at: new Date().toISOString(),
          })
          .eq('id', byName.id);
        if (error) throw error;
        updated += 1;
      } else {
        const { error } = await supabase.from('football_players').insert({
          team_id: teamId,
          display_name: display,
          full_name: fullName,
          fpl_element_id: el.id,
          position,
          is_active: !el.removed,
          picker_stats: pickerStats,
        });
        if (error) throw error;
        inserted += 1;
      }
    }
  }

  console.log(`[fpl-daily] Updated: ${updated}; inserted: ${inserted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
