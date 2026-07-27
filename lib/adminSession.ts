import { Alert, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export type ProfileRole = 'User' | 'Admin' | 'Owner';

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

export function isStaffRole(role: string | null | undefined): boolean {
  return role === 'Admin' || role === 'Owner';
}

export function isOwnerRole(role: string | null | undefined): boolean {
  return role === 'Owner';
}

export async function getProfileRole(userId: string): Promise<ProfileRole> {
  const db = supabase as any;
  const { data, error } = await db
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const role = (data as { role?: string | null } | null)?.role;
  if (role === 'Owner' || role === 'Admin' || role === 'User') return role;
  return 'User';
}

/** True for Admin or Owner (can use admin tools). */
export async function isProfileAdmin(userId: string): Promise<boolean> {
  const role = await getProfileRole(userId);
  return isStaffRole(role);
}

export async function isProfileOwner(userId: string): Promise<boolean> {
  const role = await getProfileRole(userId);
  return isOwnerRole(role);
}
