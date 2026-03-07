/**
 * Local notifications: remind users 1 hour before selections close for their competitions.
 * On web, expo-notifications causes "Cannot access 'Ce' before initialization" – use stub.
 * On native, uses expo-notifications.
 */
import { Platform } from 'react-native';

const impl =
  Platform.OS === 'web'
    ? require('./selectionReminderNotifications.web')
    : require('./selectionReminderNotifications.native');

export const setNotificationHandler = impl.setNotificationHandler;
export const requestPermissionsAndSetup = impl.requestPermissionsAndSetup;
export const scheduleSelectionReminders = impl.scheduleSelectionReminders;
export const cancelAllSelectionReminders = impl.cancelAllSelectionReminders;
export const cancelRemindersForCompetition = impl.cancelRemindersForCompetition;
export const scheduleRemindersForCompetition = impl.scheduleRemindersForCompetition;
