/**
 * Cached latest results for home screen.
 * On focus: if nextAwaitingResultRaceTimeUtc + 20 mins < now, refetch.
 * Cache is cleared only when event ended more than 1 day ago.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchResultsTemplateForUser } from './resultsTemplateForUser';
import type { MeetingResults } from './resultsTemplateForUser';

const CACHE_KEY_PREFIX = 'latest_results_';
const RACE_OVER_BUFFER_MINS = 20;

function cacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

type CachedPayload = {
  meetingResults: MeetingResults[];
  nextAwaitingResultRaceTimeUtc: string | null;
  /** Latest race date (YYYY-MM-DD) - for cache purge when event over 1+ day. */
  eventEndDate: string | null;
};

function computeNextAwaiting(meetingResults: MeetingResults[]): string | null {
  let earliest: string | null = null;
  for (const m of meetingResults) {
    for (const r of m.races) {
      const hasResults = r.fullResult && r.fullResult.length > 0;
      if (!hasResults) {
        if (!earliest || r.raceTimeUtc < earliest) earliest = r.raceTimeUtc;
      }
    }
  }
  return earliest;
}

/** Should we refetch? Next race + 20 min < now means result might be in. */
function shouldRefetch(nextAwaitingResultRaceTimeUtc: string | null): boolean {
  if (nextAwaitingResultRaceTimeUtc === null) return false;
  const raceOverBy = new Date(nextAwaitingResultRaceTimeUtc).getTime() + RACE_OVER_BUFFER_MINS * 60 * 1000;
  return Date.now() >= raceOverBy;
}

/**
 * Get latest results: from cache unless a race might have finished (next + 20 min < now).
 */
export async function getLatestResultsForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any,
  userId: string,
  competitionIds: string[],
  forceRefresh = false
): Promise<MeetingResults[]> {
  if (!competitionIds.length) return [];
  if (forceRefresh) return doFetch(supabaseClient, userId, competitionIds);

  const raw = await AsyncStorage.getItem(cacheKey(userId));
  if (raw) {
    const cached = JSON.parse(raw) as CachedPayload;
    if (cached.eventEndDate) {
      const end = new Date(cached.eventEndDate + 'T23:59:59');
      if (Date.now() >= end.getTime() + 24 * 60 * 60 * 1000) {
        await AsyncStorage.removeItem(cacheKey(userId));
      } else if (!shouldRefetch(cached.nextAwaitingResultRaceTimeUtc)) {
        return cached.meetingResults;
      }
    } else if (!shouldRefetch(cached.nextAwaitingResultRaceTimeUtc)) {
      return cached.meetingResults;
    }
  }

  return doFetch(supabaseClient, userId, competitionIds);
}

function computeEventEndDate(meetingResults: MeetingResults[]): string | null {
  let latest = '';
  for (const m of meetingResults) {
    for (const r of m.races) {
      const d = r.raceTimeUtc.slice(0, 10);
      if (d > latest) latest = d;
    }
  }
  return latest || null;
}

async function doFetch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any,
  userId: string,
  competitionIds: string[]
): Promise<MeetingResults[]> {
  const meetingResults = await fetchResultsTemplateForUser(supabaseClient, userId, competitionIds);
  const nextAwaitingResultRaceTimeUtc = computeNextAwaiting(meetingResults);
  const eventEndDate = computeEventEndDate(meetingResults);

  const payload: CachedPayload = {
    meetingResults,
    nextAwaitingResultRaceTimeUtc,
    eventEndDate,
  };
  await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(payload));
  return meetingResults;
}

/** Clear cache. Call on sign out. */
export async function clearLatestResultsCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey(userId));
  } catch {}
}
