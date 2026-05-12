import { wcSupabase } from '@/features/wc2026/lib/supabase';

const FLAG_KNOCKOUT_ANTE = 'knockout_ante_enabled';
const FLAG_MATCH_DAY = 'match_day_tips_unlocked';

async function fetchFlag(key: string): Promise<boolean> {
  try {
    const { data, error } = await wcSupabase.from('tournament_flags').select('flag_value').eq('flag_key', key).maybeSingle();
    if (error) return false;
    return Boolean((data as { flag_value?: boolean } | null)?.flag_value);
  } catch {
    return false;
  }
}

/** When true, admin has opened knockout ante-post stages (R32+) after group stage is ready. */
export async function getKnockoutAnteEnabled(): Promise<boolean> {
  return fetchFlag(FLAG_KNOCKOUT_ANTE);
}

/** When true, Match Day Tips (live picks from R32) are available. */
export async function getMatchDayTipsUnlocked(): Promise<boolean> {
  return fetchFlag(FLAG_MATCH_DAY);
}
