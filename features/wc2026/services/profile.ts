import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { validateUsername } from '@/features/wc2026/utils/usernameValidation';

type ProfilesInsert = Database['public']['Tables']['profiles']['Insert'];

export interface SharedProfile {
  id: string;
  username: string | null;
  updated_at?: string | null;
}

/**
 * World Cup uses shared app profile identity.
 * This keeps one user account usable across Racing + WC.
 */
export const upsertSharedProfileUsername = async (
  userId: string,
  username: string
): Promise<SharedProfile> => {
  const validation = validateUsername(username.trim());
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid username');
  }

  const normalizedUsername = username.trim().toLowerCase();

  const { data: existingProfile, error: checkError } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', normalizedUsername)
    .maybeSingle<{ id: string; username: string | null }>();

  if (checkError) throw checkError;
  if (existingProfile && existingProfile.id !== userId) {
    throw new Error('Username already taken. Please choose another.');
  }

  const payload: ProfilesInsert = {
    id: userId,
    username: normalizedUsername,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('profiles')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches login.tsx: Supabase infers insert/upsert as never for profiles with current Database generic
    .upsert(payload as any, {
      onConflict: 'id',
    })
    .select('id, username, updated_at')
    .single();

  if (error) throw error;
  if (!data) throw new Error('No data returned from profile upsert');
  return data;
};

export const getSharedProfile = async (userId: string): Promise<SharedProfile | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
};
