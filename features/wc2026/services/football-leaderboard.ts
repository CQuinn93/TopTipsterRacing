import { supabase } from '@/lib/supabase';
import { parseRpcArray } from '@/features/wc2026/services/football-competitions';

/** Root `Database` types omit many RPCs; cast for WC football RPCs added in migration 046. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase);

export type WcFootballLeaderboardRow = {
  user_id: string;
  total_points: number;
};

/** Prediction row returned by `wc_football_competition_predictions` (no joined winner). */
export type WcLeaderboardPredictionRow = {
  id: string;
  user_id: string;
  match_id: string | null;
  match_number: number | null;
  prediction_type: 'ante_post' | 'live';
  home_score: number | null;
  away_score: number | null;
  predicted_winner_id: string | null;
  live_outcome?: 'H' | 'D' | 'A' | null;
  live_total_goals?: number | null;
  live_btts?: boolean | null;
  points_awarded: number | null;
  is_correct: boolean | null;
  created_at: string;
  updated_at: string;
};

export async function wcFootballLeaderboard(competitionId: string): Promise<WcFootballLeaderboardRow[]> {
  const { data, error } = await rpc('wc_football_leaderboard', {
    p_competition_id: competitionId,
  });
  if (error) throw new Error(error.message);
  const arr = parseRpcArray(data);
  return arr
    .map((r) => {
      const row = r as { user_id: string; total_points: number | string };
      return {
        user_id: row.user_id,
        total_points: typeof row.total_points === 'string' ? parseInt(row.total_points, 10) : Number(row.total_points ?? 0),
      };
    })
    .sort((a, b) => b.total_points - a.total_points || a.user_id.localeCompare(b.user_id));
}

export async function wcFootballCompetitionPredictions(competitionId: string): Promise<WcLeaderboardPredictionRow[]> {
  const { data, error } = await rpc('wc_football_competition_predictions', {
    p_competition_id: competitionId,
  });
  if (error) throw new Error(error.message);
  const arr = parseRpcArray(data);
  return arr.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id ?? ''),
      user_id: String(r.user_id ?? ''),
      match_id: r.match_id != null ? String(r.match_id) : null,
      match_number: r.match_number != null ? Number(r.match_number) : null,
      prediction_type: r.prediction_type === 'live' ? 'live' : 'ante_post',
      home_score: r.home_score != null ? Number(r.home_score) : null,
      away_score: r.away_score != null ? Number(r.away_score) : null,
      predicted_winner_id: r.predicted_winner_id != null ? String(r.predicted_winner_id) : null,
      live_outcome: (r.live_outcome === 'H' || r.live_outcome === 'D' || r.live_outcome === 'A' ? r.live_outcome : null) as
        | 'H'
        | 'D'
        | 'A'
        | null,
      live_total_goals: r.live_total_goals != null ? Number(r.live_total_goals) : null,
      live_btts: typeof r.live_btts === 'boolean' ? r.live_btts : r.live_btts === true ? true : r.live_btts === false ? false : null,
      points_awarded: r.points_awarded != null ? Number(r.points_awarded) : null,
      is_correct: typeof r.is_correct === 'boolean' ? r.is_correct : null,
      created_at: String(r.created_at ?? ''),
      updated_at: String(r.updated_at ?? ''),
    };
  });
}

export async function wcFootballListParticipants(competitionId: string): Promise<{ user_id: string; joined_at: string }[]> {
  const { data, error } = await rpc('wc_football_list_participants', {
    p_competition_id: competitionId,
  });
  if (error) return [];
  return parseRpcArray(data) as { user_id: string; joined_at: string }[];
}
