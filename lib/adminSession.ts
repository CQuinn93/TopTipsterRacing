import { Alert, Platform } from 'react-native';
import { getOrCreateTabletCode } from '@/lib/tabletCode';
import { supabase } from '@/lib/supabase';

/** RN Web's Alert.alert is unreliable; prefer window.alert/confirm on web. */
export function adminAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(message != null && message !== '' ? `${title}\n\n${message}` : title);
    }
    return;
  }
  if (message != null && message !== '') {
    Alert.alert(title, message);
  } else {
    Alert.alert(title);
  }
}

export async function isProfileAdmin(userId: string): Promise<boolean> {
  const db = supabase as any;
  const { data, error } = await db
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as { role?: string | null } | null)?.role === 'Admin';
}

/**
 * Resolve the admin tablet code for the signed-in user.
 * Prefer a provided code (e.g. route param), otherwise load/create from DB.
 */
export async function resolveAdminTabletCode(
  userId: string | null | undefined,
  preferredCode?: string | null
): Promise<string | null> {
  const trimmed = String(preferredCode ?? '').trim();
  if (trimmed) return trimmed;
  if (!userId) return null;
  try {
    const admin = await isProfileAdmin(userId);
    if (!admin) return null;
    return await getOrCreateTabletCode(userId);
  } catch {
    return null;
  }
}
