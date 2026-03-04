import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Race } from '@/types/races';

const CACHE_PREFIX = 'leaderboard_bulk_';

export type SelectionEntry = {
  runnerId: string;
  runnerName: string;
  oddsDecimal: number;
  /** From API later: 'won' | 'place' | 'lost' */
  position?: 'won' | 'place' | 'lost';
  positionPoints?: number;
  oddsPoints?: number;
};

export type LeaderboardBulkCache = {
  fetchedAt: string; // ISO
  raceDays: Array<{ id: string; race_date: string; races: Race[] }>;
  /** userId -> race_date -> raceId -> selection */
  selectionsByUser: Record<string, Record<string, Record<string, SelectionEntry>>>;
  /** When set, leaderboard can skip competitions + competition_participants fetches on cache hit */
  competitionName?: string;
  festivalStart?: string | null;
  festivalEnd?: string | null;
  participants?: Array<{ user_id: string; display_name: string }>;
};

function cacheKey(competitionId: string): string {
  return `${CACHE_PREFIX}${competitionId}`;
}

export async function getLeaderboardBulkCache(
  competitionId: string
): Promise<LeaderboardBulkCache | null> {
  const key = cacheKey(competitionId);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LeaderboardBulkCache;
    if (!parsed.fetchedAt || !parsed.raceDays) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setLeaderboardBulkCache(
  competitionId: string,
  data: Omit<LeaderboardBulkCache, 'fetchedAt'>
): Promise<void> {
  const key = cacheKey(competitionId);
  const value: LeaderboardBulkCache = {
    ...data,
    fetchedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(key, JSON.stringify(value));
}
