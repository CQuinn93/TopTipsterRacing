/**
 * Bulk cache for selections: daily_selections + participants + race days.
 * Cached in AsyncStorage with timestamp; valid when cache_timestamp >= refresh_after_utc.
 * refresh_after_utc comes from app_config (set by pull-races = 50 min before first race).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Race } from '@/types/races';
import { fetchRaceDaysForCompetition } from './raceDaysForCompetition';

const CACHE_KEY_PREFIX = 'selections_bulk_';
const CONFIG_CACHE_KEY = 'selections_refresh_after_utc';

export type SelectionsBulkData = {
  timestamp: string;
  refreshAfterUtc: string | null;
  competitionIds: string[];
  selections: Array<{
    competition_id: string;
    user_id: string;
    race_date: string;
    selections: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }> | null;
  }>;
  participants: Array<{
    competition_id: string;
    user_id: string;
    display_name: string | null;
  }>;
  raceDaysByComp: Record<string, Array<{ id: string; race_date: string; course: string; first_race_utc?: string; races: Race[] }>>;
};

type CachedPayload = {
  timestamp: string;
  refreshAfterUtc: string | null;
  data: SelectionsBulkData;
};

function cacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

/** Fetch refresh_after_utc from app_config. Returns null if not set or fetch fails. */
export async function getRefreshAfterUtc(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string | null> {
  try {
    const cached = await AsyncStorage.getItem(CONFIG_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { utc: string | null; fetchedAt: string };
      const age = Date.now() - new Date(parsed.fetchedAt).getTime();
      if (age < 60 * 60 * 1000) return parsed.utc ?? null;
    }
    const { data } = await supabase.from('app_config').select('value').eq('key', 'selections_refresh_after_utc').maybeSingle();
    const utc = (data?.value?.utc ?? null) as string | null;
    await AsyncStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({ utc, fetchedAt: new Date().toISOString() }));
    return utc;
  } catch {
    return null;
  }
}

/** Check if cached data is valid (fetched at or after refresh cutoff). */
function isCacheValid(cache: CachedPayload, refreshAfterUtc: string | null): boolean {
  if (!refreshAfterUtc) return false;
  return new Date(cache.timestamp).getTime() >= new Date(refreshAfterUtc).getTime();
}

/** Check if we should use cache: we're past the cutoff and have valid cache. */
function shouldUseCache(cache: CachedPayload | null, refreshAfterUtc: string | null, nowUtc: string): boolean {
  if (!cache || !refreshAfterUtc) return false;
  const cutoff = new Date(refreshAfterUtc).getTime();
  const now = new Date(nowUtc).getTime();
  if (now < cutoff) return false;
  return isCacheValid(cache, refreshAfterUtc);
}

/**
 * Get bulk selections data: from cache if valid, else fetch and cache.
 * @param forceRefresh - when true, bypass cache and always fetch (e.g. pull-to-refresh)
 */
export async function getSelectionsBulk(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  competitionIds: string[],
  forceRefresh = false
): Promise<SelectionsBulkData> {
  if (!competitionIds.length) {
    return {
      timestamp: new Date().toISOString(),
      refreshAfterUtc: null,
      competitionIds: [],
      selections: [],
      participants: [],
      raceDaysByComp: {},
    };
  }

  const refreshAfterUtc = await getRefreshAfterUtc(supabase);
  const key = cacheKey(userId);
  let cached: CachedPayload | null = null;
  if (!forceRefresh) {
    const raw = await AsyncStorage.getItem(key);
    cached = raw ? (JSON.parse(raw) as CachedPayload) : null;
    if (shouldUseCache(cached, refreshAfterUtc, new Date().toISOString())) {
      return cached!.data;
    }
  }

  const { data: selRows } = await supabase
    .from('daily_selections')
    .select('competition_id, user_id, race_date, selections')
    .in('competition_id', competitionIds);

  const { data: partRows } = await supabase
    .from('competition_participants')
    .select('competition_id, user_id, display_name')
    .in('competition_id', competitionIds);

  const selections = (selRows ?? []) as SelectionsBulkData['selections'];
  const participants = (partRows ?? []) as SelectionsBulkData['participants'];

  const raceDaysByComp: Record<string, SelectionsBulkData['raceDaysByComp'][string]> = {};
  for (const compId of competitionIds) {
    const days = await fetchRaceDaysForCompetition(supabase, compId, 'id, race_date, course, first_race_utc, races');
    raceDaysByComp[compId] = days as SelectionsBulkData['raceDaysByComp'][string];
  }

  const bulk: SelectionsBulkData = {
    timestamp: new Date().toISOString(),
    refreshAfterUtc,
    competitionIds,
    selections,
    participants,
    raceDaysByComp,
  };

  const toStore: CachedPayload = {
    timestamp: bulk.timestamp,
    refreshAfterUtc: bulk.refreshAfterUtc,
    data: bulk,
  };
  await AsyncStorage.setItem(key, JSON.stringify(toStore));

  return bulk;
}
