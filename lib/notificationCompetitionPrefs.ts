/**
 * Persist which competitions the user has enabled notifications for.
 * Key: notification_competitions_${userId}, value: JSON array of competition IDs.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'notification_competitions_';

export async function getNotificationCompetitionIds(userId: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY_PREFIX + userId);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export async function setNotificationCompetitionIds(userId: string, ids: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY_PREFIX + userId, JSON.stringify(ids));
}

export async function addNotificationCompetition(userId: string, competitionId: string): Promise<void> {
  const ids = await getNotificationCompetitionIds(userId);
  if (ids.includes(competitionId)) return;
  await setNotificationCompetitionIds(userId, [...ids, competitionId]);
}

export async function removeNotificationCompetition(userId: string, competitionId: string): Promise<void> {
  const ids = await getNotificationCompetitionIds(userId);
  const next = ids.filter((id) => id !== competitionId);
  if (next.length === ids.length) return;
  await setNotificationCompetitionIds(userId, next);
}
