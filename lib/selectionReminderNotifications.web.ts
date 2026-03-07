/**
 * Web stub: expo-notifications is not fully supported on web and can cause
 * "Cannot access 'Ce' before initialization" errors. Use no-op implementations.
 */
import type { AvailableRaceDay } from '@/lib/availableRacesForUser';

export function setNotificationHandler(): void {
  // No-op on web
}

export async function requestPermissionsAndSetup(): Promise<boolean> {
  return false;
}

export async function scheduleSelectionReminders(_availableRaces: AvailableRaceDay[]): Promise<void> {
  // No-op on web
}

export async function cancelAllSelectionReminders(): Promise<void> {
  // No-op on web
}

export async function cancelRemindersForCompetition(_competitionId: string): Promise<void> {
  // No-op on web
}

export async function scheduleRemindersForCompetition(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _supabase: any,
  _userId: string,
  _competitionId: string,
  _competitionName: string
): Promise<void> {
  // No-op on web
}
