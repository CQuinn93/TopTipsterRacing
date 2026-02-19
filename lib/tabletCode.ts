import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const TABLET_CODE_CACHE_KEY = 'tablet_code';

function generateSixDigitCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

/** Get cached tablet code (for display). Clear on logout. */
export async function getCachedTabletCode(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TABLET_CODE_CACHE_KEY);
  } catch {
    return null;
  }
}

/** Clear cached tablet code. Call on sign out. */
export async function clearTabletCodeCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(TABLET_CODE_CACHE_KEY);
  } catch {}
}

/**
 * Get or create the 6-digit tablet code for the current user.
 * Uses cache first to reduce egress; if missing, fetches or creates in DB then caches.
 */
export async function getOrCreateTabletCode(userId: string): Promise<string> {
  const cached = await getCachedTabletCode();
  if (cached) return cached;

  const { data: existing } = await supabase
    .from('user_tablet_codes')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.code) {
    await AsyncStorage.setItem(TABLET_CODE_CACHE_KEY, existing.code);
    return existing.code;
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateSixDigitCode();
    const { error } = await supabase.from('user_tablet_codes').insert({
      user_id: userId,
      code,
      updated_at: new Date().toISOString(),
    });
    if (!error) {
      await AsyncStorage.setItem(TABLET_CODE_CACHE_KEY, code);
      return code;
    }
    if (error.code !== '23505') throw error; // not unique, retry
  }
  throw new Error('Could not generate unique tablet code');
}
