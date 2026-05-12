import { supabase } from '@/lib/supabase';
import { parseRpcArray } from '@/features/wc2026/services/football-competitions';

/** Root `Database` types omit many RPCs; cast for WC football RPCs added in migration 046. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase);

export type WcFootballLeaderboardRow = {
  user_id: string;
  total_points: number;
};

export async function wcFootballLeaderboard(competitionId: string): Promise<WcFootballLeaderboardRow[]> {
  const { data, error } = await rpc('wc_football_leaderboard', {
    p_competition_id: competitionId,
  });
  if (error) return [];
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

export async function wcFootballListParticipants(competitionId: string): Promise<{ user_id: string; joined_at: string }[]> {
  const { data, error } = await rpc('wc_football_list_participants', {
    p_competition_id: competitionId,
  });
  if (error) return [];
  return parseRpcArray(data) as { user_id: string; joined_at: string }[];
}
