/**
 * Cached available races for home screen.
 * Refetch when: lastRaceTimeUtc is null, OR lastRaceTimeUtc <= now + 90 mins.
 * Cache is cleared only when event ended more than 1 day ago.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchAvailableRacesForUser, type AvailableRaceDay } from './availableRacesForUser';

export type ParticipationRow = {
  id: string;
  competition_id: string;
  display_name: string | null;
};

const CACHE_KEY_PREFIX = 'available_races_';
const BUFFER_MINS = 90;

function cacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

type CachedPayload = {
  participations: ParticipationRow[];
  availableRaces: AvailableRaceDay[];
  lastRaceTimeUtc: string | null;
  /** Latest race date (YYYY-MM-DD) - for cache purge when event over 1+ day. */
  eventEndDate: string | null;
};

function computeLastRaceTimeUtc(availableRaces: AvailableRaceDay[]): string | null {
  if (availableRaces.length === 0) return null;
  return availableRaces.reduce((max, day) =>
    day.lastRaceUtc > max ? day.lastRaceUtc : max
  , availableRaces[0].lastRaceUtc);
}

/** Should we refetch? null or lastRaceTimeUtc <= now + 90 mins means yes. */
function shouldRefetch(lastRaceTimeUtc: string | null): boolean {
  if (lastRaceTimeUtc === null) return true;
  const cutoff = Date.now() + BUFFER_MINS * 60 * 1000;
  return new Date(lastRaceTimeUtc).getTime() <= cutoff;
}

/**
 * Get available races: from cache if still valid, else fetch and cache.
 * Returns participations (for hasJoinedAny) and availableRaces.
 */
export async function getAvailableRacesForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any,
  userId: string,
  forceRefresh = false
): Promise<{ participations: ParticipationRow[]; availableRaces: AvailableRaceDay[] }> {
  if (forceRefresh) {
    return doFetch(supabaseClient, userId);
  }

  const raw = await AsyncStorage.getItem(cacheKey(userId));
  if (raw) {
    const cached = JSON.parse(raw) as CachedPayload;
    const eventEnd = cached.eventEndDate ?? (cached.lastRaceTimeUtc ? cached.lastRaceTimeUtc.slice(0, 10) : null);
    if (eventEnd) {
      const end = new Date(eventEnd + 'T23:59:59');
      if (Date.now() >= end.getTime() + 24 * 60 * 60 * 1000) {
        await AsyncStorage.removeItem(cacheKey(userId));
      } else if (!shouldRefetch(cached.lastRaceTimeUtc)) {
        return { participations: cached.participations, availableRaces: cached.availableRaces };
      }
    } else if (!shouldRefetch(cached.lastRaceTimeUtc)) {
      return { participations: cached.participations, availableRaces: cached.availableRaces };
    }
  }

  return doFetch(supabaseClient, userId);
}

async function doFetch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any,
  userId: string
): Promise<{ participations: ParticipationRow[]; availableRaces: AvailableRaceDay[] }> {
  const { data: partData } = await supabaseClient
    .from('competition_participants')
    .select('id, competition_id, display_name')
    .eq('user_id', userId);

  const participations = (partData ?? []) as ParticipationRow[];
  if (participations.length === 0) {
    const payload: CachedPayload = {
      participations: [],
      availableRaces: [],
      lastRaceTimeUtc: null,
      eventEndDate: null,
    };
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(payload));
    return { participations: [], availableRaces: [] };
  }

  const compIds = participations.map((p) => p.competition_id);
  const { data: comps } = await supabaseClient.from('competitions').select('id, name').in('id', compIds);
  const compByName = new Map((comps ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

  const availableRaces = await fetchAvailableRacesForUser(
    supabaseClient,
    userId,
    compIds,
    compByName
  );
  const lastRaceTimeUtc = computeLastRaceTimeUtc(availableRaces);
  const eventEndDate =
    availableRaces.length > 0
      ? availableRaces.reduce((max, d) => (d.lastRaceUtc.slice(0, 10) > max ? d.lastRaceUtc.slice(0, 10) : max), availableRaces[0].lastRaceUtc.slice(0, 10))
      : null;

  const payload: CachedPayload = {
    participations,
    availableRaces,
    lastRaceTimeUtc,
    eventEndDate,
  };
  await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(payload));
  return { participations, availableRaces };
}

/** Clear cache. Call on sign out. */
export async function clearAvailableRacesCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey(userId));
  } catch {}
}
