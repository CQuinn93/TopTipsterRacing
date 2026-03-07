/**
 * Native implementation: uses expo-notifications for local reminders.
 * Do not import this on web – it causes "Cannot access 'Ce' before initialization".
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { AvailableRaceDay } from '@/lib/availableRacesForUser';
import { fetchAvailableRacesForUser } from '@/lib/availableRacesForUser';

const CHANNEL_ID = 'selection-reminders';
const ID_PREFIX = 'selection-close-';
const ONE_HOUR_MS = 60 * 60 * 1000;

function getDeadlineMs(day: AvailableRaceDay): number {
  return new Date(day.firstRaceUtc).getTime() - ONE_HOUR_MS;
}

function notificationId(day: AvailableRaceDay): string {
  return `${ID_PREFIX}${day.competitionId}-${day.raceDate}`;
}

export function setNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestPermissionsAndSetup(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Selection reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleSelectionReminders(availableRaces: AvailableRaceDay[]): Promise<void> {
  const now = Date.now();
  const deadlineMinFutureMs = 2 * 60 * 1000;
  const maxFutureMs = 14 * 24 * 60 * 60 * 1000;

  for (const day of availableRaces) {
    if (day.isLocked) continue;
    const deadlineMs = getDeadlineMs(day);
    if (deadlineMs <= now + deadlineMinFutureMs) continue;
    if (deadlineMs > now + maxFutureMs) continue;

    const triggerDate = new Date(deadlineMs);
    const id = notificationId(day);
    const title = 'Selections closing soon';
    const body = `${day.competitionName} – make your picks in the next hour (${day.course}).`;

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title,
          body,
          data: { competitionId: day.competitionId, raceDate: day.raceDate },
          channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: triggerDate,
          channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
        },
      });
    } catch (e) {
      console.warn('Failed to schedule selection reminder', id, e);
    }
  }
}

export async function cancelAllSelectionReminders(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier.startsWith(ID_PREFIX)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (e) {
    console.warn('Failed to cancel selection reminders', e);
  }
}

export async function cancelRemindersForCompetition(competitionId: string): Promise<void> {
  const prefix = `${ID_PREFIX}${competitionId}-`;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier.startsWith(prefix)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (e) {
    console.warn('Failed to cancel selection reminders for competition', competitionId, e);
  }
}

export async function scheduleRemindersForCompetition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  competitionId: string,
  competitionName: string
): Promise<void> {
  const competitionsByName = new Map<string, string>([[competitionId, competitionName]]);
  const days = await fetchAvailableRacesForUser(supabase, userId, [competitionId], competitionsByName);
  await scheduleSelectionReminders(days);
}
