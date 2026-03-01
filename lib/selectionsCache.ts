import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'participant_selections_';
const LOCK_HOUR_UK = 13;
const LOCK_MINUTE = 0;

export type CachedSelections = {
  race_date: string;
  selections: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>;
  fetchedAt: string; // ISO
};

function cacheKey(competitionId: string, participantUserId: string, raceDate: string): string {
  return `${CACHE_PREFIX}${competitionId}_${participantUserId}_${raceDate}`;
}

/**
 * Selections become visible (locked) at 13:00 UK on the race day.
 * After that they cannot change, so we can cache indefinitely.
 */
function isLocked(raceDate: string): boolean {
  const dateOnly = raceDate.split('T')[0];
  const now = new Date();
  const ukNow = new Date(now.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
  const today = ukNow.toISOString().slice(0, 10);
  if (dateOnly < today) return true;
  if (dateOnly > today) return false;
  return ukNow.getHours() > LOCK_HOUR_UK || (ukNow.getHours() === LOCK_HOUR_UK && ukNow.getMinutes() >= LOCK_MINUTE);
}

/**
 * Use cache if we have it and either:
 * - data is locked for that race date, or
 * - we're before 13:00 today and cache was filled after 13:00 the day before (so we have stale-but-acceptable data and skip fetch).
 * For simplicity: use cache if we have it and the race date is locked. Otherwise fetch.
 */
function shouldUseCache(raceDate: string, fetchedAt: string): boolean {
  if (isLocked(raceDate)) return true;
  const fetched = new Date(fetchedAt);
  const ukFetched = new Date(fetched.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
  const dateOnly = raceDate.split('T')[0];
  const fetchedDate = ukFetched.toISOString().slice(0, 10);
  if (fetchedDate < dateOnly) return false;
  if (fetchedDate > dateOnly) return true;
  return ukFetched.getHours() >= LOCK_HOUR_UK;
}

export async function getCached(
  competitionId: string,
  participantUserId: string,
  raceDate: string
): Promise<CachedSelections | null> {
  const key = cacheKey(competitionId, participantUserId, raceDate);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedSelections;
    if (!parsed.fetchedAt || !parsed.race_date) return null;
    if (shouldUseCache(parsed.race_date, parsed.fetchedAt)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function setCached(
  competitionId: string,
  participantUserId: string,
  raceDate: string,
  selections: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>
): Promise<void> {
  const key = cacheKey(competitionId, participantUserId, raceDate);
  const value: CachedSelections = {
    race_date: raceDate,
    selections: selections ?? {},
    fetchedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
