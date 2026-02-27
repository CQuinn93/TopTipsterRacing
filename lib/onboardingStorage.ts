import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'onboarding_guided_tour_';

export async function getGuidedTourCompleted(userId: string): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(KEY_PREFIX + userId);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function setGuidedTourCompleted(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + userId, 'true');
  } catch {
    // ignore
  }
}
