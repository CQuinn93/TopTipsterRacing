/**
 * Bulk cache for selections: daily_selections + participants + race days.
 * Cache is retained until 1 day after the event (last race day) has finished.
 * Only cleared when meeting is over for more than 1 day.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Race } from '@/types/races';
import { fetchRaceDaysForCompetition } from './raceDaysForCompetition';

const CACHE_KEY_PREFIX = 'selections_bulk_';

export type SelectionsBulkData = {
  timestamp: string;
  /** Latest race_date (YYYY-MM-DD) across all competitions - event end date. */
  eventEndDate: string | null;
  competitionIds: string[];
  selections: Array<{
    competition_id: string;
    user_id: string;
    race_date: string;
    selections: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }> | null;
    locked_at: string | null;
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
  eventEndDate: string | null;
  data: SelectionsBulkData;
};

function cacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

/** Clear cache only when event ended more than 1 day ago. Returns true if cache was cleared. */
function shouldClearCache(eventEndDate: string | null): boolean {
  if (!eventEndDate) return false;
  const end = new Date(eventEndDate + 'T23:59:59');
  const clearAfter = end.getTime() + 24 * 60 * 60 * 1000;
  return Date.now() >= clearAfter;
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
      eventEndDate: null,
      competitionIds: [],
      selections: [],
      participants: [],
      raceDaysByComp: {},
    };
  }

  const key = cacheKey(userId);
  if (!forceRefresh) {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const cached = JSON.parse(raw) as CachedPayload;
      if (shouldClearCache(cached.data.eventEndDate ?? cached.eventEndDate ?? null)) {
        await AsyncStorage.removeItem(key);
      } else {
        return cached.data;
      }
    }
  }

  const { data: selRows } = await supabase
    .from('daily_selections')
    .select('competition_id, user_id, race_date, selections, locked_at')
    .in('competition_id', competitionIds);

  const { data: partRows } = await supabase
    .from('competition_participants')
    .select('competition_id, user_id, display_name')
    .in('competition_id', competitionIds);

  const selections = (selRows ?? []) as SelectionsBulkData['selections'];
  const participants = (partRows ?? []) as SelectionsBulkData['participants'];

  const raceDaysByComp: Record<string, SelectionsBulkData['raceDaysByComp'][string]> = {};
  let eventEndDate: string | null = null;
  const allDays = await Promise.all(
    competitionIds.map((compId) =>
      fetchRaceDaysForCompetition(supabase, compId, 'id, race_date, course, first_race_utc, races')
    )
  );
  competitionIds.forEach((compId, i) => {
    const days = allDays[i] as SelectionsBulkData['raceDaysByComp'][string];
    raceDaysByComp[compId] = days;
    for (const d of days as { race_date: string }[]) {
      if (!eventEndDate || d.race_date > eventEndDate) eventEndDate = d.race_date;
    }
  });

  const bulk: SelectionsBulkData = {
    timestamp: new Date().toISOString(),
    eventEndDate,
    competitionIds,
    selections,
    participants,
    raceDaysByComp,
  };

  const toStore: CachedPayload = {
    timestamp: bulk.timestamp,
    eventEndDate: bulk.eventEndDate,
    data: bulk,
  };
  await AsyncStorage.setItem(key, JSON.stringify(toStore));

  return bulk;
}

/** Clear selections bulk cache. Call after user saves or locks selections. */
export async function clearSelectionsBulkCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey(userId));
  } catch {}
}
