import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'tt_last_route_v1';

export async function setLastRoute(route: string): Promise<void> {
  try {
    // Expo's AsyncStorage works on web too, but guard just in case.
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(KEY, route);
      return;
    }
    await AsyncStorage.setItem(KEY, route);
  } catch {
    // Ignore storage failures.
  }
}

export async function getLastRoute(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

