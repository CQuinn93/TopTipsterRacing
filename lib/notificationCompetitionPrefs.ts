/**
 * Persist which competitions the user has enabled notifications for.
 * Key: notification_competitions_${userId}, value: JSON array of competition IDs.
 * In-memory cache avoids AsyncStorage read on every home load.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'notification_competitions_';

const memoryCache: Record<string, string[]> = {};

export async function getNotificationCompetitionIds(userId: string): Promise<string[]> {
  if (memoryCache[userId]) return memoryCache[userId];
  const raw = await AsyncStorage.getItem(KEY_PREFIX + userId);
  if (!raw) {
    memoryCache[userId] = [];
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    memoryCache[userId] = ids;
    return ids;
  } catch {
    memoryCache[userId] = [];
    return [];
  }
}

export async function setNotificationCompetitionIds(userId: string, ids: string[]): Promise<void> {
  memoryCache[userId] = ids;
  await AsyncStorage.setItem(KEY_PREFIX + userId, JSON.stringify(ids));
}

export async function addNotificationCompetition(userId: string, competitionId: string): Promise<void> {
  const ids = await getNotificationCompetitionIds(userId);
  if (ids.includes(competitionId)) return;
  const next = [...ids, competitionId];
  memoryCache[userId] = next;
  await AsyncStorage.setItem(KEY_PREFIX + userId, JSON.stringify(next));
}

export async function removeNotificationCompetition(userId: string, competitionId: string): Promise<void> {
  const ids = await getNotificationCompetitionIds(userId);
  const next = ids.filter((id) => id !== competitionId);
  if (next.length === ids.length) return;
  memoryCache[userId] = next;
  await AsyncStorage.setItem(KEY_PREFIX + userId, JSON.stringify(next));
}
