import { supabase } from '@/lib/supabase';

/** Root `Database` types omit many RPCs; cast for WC football RPCs added in migration 046. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase);

export type WcFootballCompetition = {
  id: string;
  name: string;
  access_code: string;
  joined_at?: string;
  created_at?: string;
  created_by?: string;
};

export function parseRpcArray(data: unknown): unknown[] {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    try {
      const p = JSON.parse(data);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function wcFootballCreateCompetition(name: string): Promise<
  | { success: true; id: string; access_code: string; name: string }
  | { success: false; error: string }
> {
  const { data, error } = await rpc('wc_football_create_competition', { p_name: name });
  if (error) return { success: false, error: error.message };
  const row = data as { success?: boolean; error?: string; id?: string; access_code?: string; name?: string };
  if (!row?.success) return { success: false, error: row?.error ?? 'create_failed' };
  return {
    success: true,
    id: row.id as string,
    access_code: row.access_code as string,
    name: row.name as string,
  };
}

export async function wcFootballJoinCompetition(accessCode: string): Promise<
  { success: true; competition_id: string; name: string } | { success: false; error: string }
> {
  const { data, error } = await rpc('wc_football_join_competition', {
    p_access_code: accessCode.trim().toUpperCase(),
  });
  if (error) return { success: false, error: error.message };
  const row = data as { success?: boolean; error?: string; competition_id?: string; name?: string };
  if (!row?.success) return { success: false, error: row?.error ?? 'join_failed' };
  return {
    success: true,
    competition_id: row.competition_id as string,
    name: row.name as string,
  };
}

export async function wcFootballListMyCompetitions(): Promise<WcFootballCompetition[]> {
  const { data, error } = await rpc('wc_football_list_my_competitions');
  if (error) return [];
  return parseRpcArray(data) as WcFootballCompetition[];
}

export async function wcFootballListAdminCompetitions(): Promise<WcFootballCompetition[]> {
  const { data, error } = await rpc('wc_football_list_admin_competitions');
  if (error) return [];
  return parseRpcArray(data) as WcFootballCompetition[];
}

export async function wcAdminSetTournamentFlag(
  flagKey: 'knockout_ante_enabled' | 'match_day_tips_unlocked',
  value: boolean
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await rpc('wc_admin_set_tournament_flag', {
    p_flag_key: flagKey,
    p_value: value,
  });
  if (error) return { success: false, error: error.message };
  const row = data as { success?: boolean; error?: string };
  return row?.success ? { success: true } : { success: false, error: row?.error };
}
