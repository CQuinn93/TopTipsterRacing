import { supabase } from '@/lib/supabase';

export type HubGameModeKey = 'lms' | 'f2t' | 'f2t6' | 'racing';

export type HubGameModes = Record<HubGameModeKey, boolean>;

export const HUB_GAME_MODE_LABELS: Record<HubGameModeKey, string> = {
  lms: 'Last Man Standing',
  f2t: 'Tipster20',
  f2t6: 'First2 6',
  racing: 'Top Tipster Racing',
};

export const DEFAULT_HUB_GAME_MODES: HubGameModes = {
  lms: true,
  f2t: false,
  f2t6: false,
  racing: false,
};

const db = supabase as any;

function normalizeModes(raw: unknown): HubGameModes {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    lms: Boolean(row.lms ?? DEFAULT_HUB_GAME_MODES.lms),
    f2t: Boolean(row.f2t ?? DEFAULT_HUB_GAME_MODES.f2t),
    f2t6: Boolean(row.f2t6 ?? DEFAULT_HUB_GAME_MODES.f2t6),
    racing: Boolean(row.racing ?? DEFAULT_HUB_GAME_MODES.racing),
  };
}

export async function getHubGameModes(): Promise<HubGameModes> {
  const { data, error } = await db.rpc('get_hub_game_modes');
  if (error) throw error;
  return normalizeModes(data);
}

export async function ownerSetHubGameModes(modes: HubGameModes): Promise<{
  success: boolean;
  error?: string;
  modes?: HubGameModes;
}> {
  const { data, error } = await db.rpc('owner_set_hub_game_modes', {
    p_modes: modes,
  });
  if (error) throw error;
  const row = data as { success: boolean; error?: string; modes?: unknown };
  if (!row.success) return { success: false, error: row.error };
  return {
    success: true,
    modes: normalizeModes(row.modes),
  };
}

export function canAccessGameMode(
  mode: HubGameModeKey,
  modes: HubGameModes,
  isOwner: boolean
): boolean {
  return isOwner || modes[mode];
}
