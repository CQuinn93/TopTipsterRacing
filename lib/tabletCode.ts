import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const TABLET_CODE_CACHE_KEY = 'tablet_code';
const TABLET_CODE_USER_KEY = 'tablet_code_user_id';

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
    await AsyncStorage.multiRemove([TABLET_CODE_CACHE_KEY, TABLET_CODE_USER_KEY]);
  } catch {}
}

async function getCachedTabletCodeForUser(userId: string): Promise<string | null> {
  try {
    const [[, code], [, cachedUserId]] = await AsyncStorage.multiGet([
      TABLET_CODE_CACHE_KEY,
      TABLET_CODE_USER_KEY,
    ]);
    if (code && cachedUserId === userId) return code;
    return null;
  } catch {
    return null;
  }
}

async function setCachedTabletCodeForUser(userId: string, code: string): Promise<void> {
  await AsyncStorage.multiSet([
    [TABLET_CODE_CACHE_KEY, code],
    [TABLET_CODE_USER_KEY, userId],
  ]);
}

/**
 * Get or create the 6-digit tablet code for the current user.
 * Uses a user-scoped cache first to reduce egress and avoid cross-user code reuse.
 */
export async function getOrCreateTabletCode(userId: string): Promise<string> {
  const cached = await getCachedTabletCodeForUser(userId);
  if (cached) return cached;

  const { data: existing } = await supabase
    .from('user_tablet_codes')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.code) {
    await setCachedTabletCodeForUser(userId, existing.code);
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
      await setCachedTabletCodeForUser(userId, code);
      return code;
    }
    if (error.code !== '23505') throw error; // not unique, retry
  }
  throw new Error('Could not generate unique tablet code');
}
