import { supabase } from '@/lib/supabase';

export type OwnerUserRow = {
  id: string;
  username: string | null;
  role: 'User' | 'Admin' | 'Owner';
  created_at: string;
  updated_at?: string;
  banned_at?: string | null;
  banned_by?: string | null;
};

export type OwnerCompetitionRow = {
  sport: 'racing' | 'lms';
  id: string;
  name: string;
  status: string;
  join_code: string | null;
  rejoin_code?: string | null;
  festival_start_date?: string | null;
  festival_end_date?: string | null;
  season?: string | null;
  created_at?: string | null;
  creator_username?: string | null;
  participant_count?: number;
  active_count?: number;
};

const db = supabase as any;

export async function ownerListUsers(): Promise<OwnerUserRow[]> {
  const { data, error } = await db.rpc('owner_list_users');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as OwnerUserRow[];
}

export async function ownerListCompetitions(): Promise<OwnerCompetitionRow[]> {
  const { data, error } = await db.rpc('owner_list_competitions');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as OwnerCompetitionRow[];
}

export async function ownerSetUserRole(
  userId: string,
  role: 'User' | 'Admin'
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await db.rpc('owner_set_user_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
  };
}

export async function ownerSetUserBanned(
  userId: string,
  banned: boolean
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await db.rpc('owner_set_user_banned', {
    p_user_id: userId,
    p_banned: banned,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
  };
}

export async function isCurrentUserBanned(): Promise<boolean> {
  const { data, error } = await db.rpc('is_profile_banned');
  if (error) throw error;
  return Boolean(data);
}
