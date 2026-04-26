import { wcSupabase } from '@/features/wc2026/lib/supabase';

export interface TeamData {
  id: string;
  country_code: string;
  country_name: string;
  fifa_ranking: number | null;
}

export const getAllTeams = async (): Promise<TeamData[]> => {
  const { data, error } = await wcSupabase
    .from('teams')
    .select('id, country_code, country_name, fifa_ranking')
    .order('fifa_ranking', { ascending: true, nullsLast: true });

  if (error) throw error;
  return data || [];
};

export const getTeamsByIds = async (teamIds: string[]): Promise<TeamData[]> => {
  if (teamIds.length === 0) return [];
  const { data, error } = await wcSupabase
    .from('teams')
    .select('id, country_code, country_name, fifa_ranking')
    .in('id', teamIds);

  if (error) throw error;
  return data || [];
};
