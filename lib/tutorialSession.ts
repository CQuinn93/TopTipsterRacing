import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TutorialGetDataPayload } from '@/lib/tutorialTypes';

const keyFor = (userId: string, meetingSlug: string) =>
  `tutorial_practice_${meetingSlug}_${userId}`;

export type TutorialSessionPick = {
  runnerId: string;
  runnerName: string;
  oddsDecimal: number;
};

export type TutorialSessionState = {
  selections: Record<string, TutorialSessionPick>;
  locked: boolean;
};

export async function loadTutorialSession(
  userId: string,
  meetingSlug: string
): Promise<TutorialSessionState | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId, meetingSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TutorialSessionState;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      selections: typeof parsed.selections === 'object' && parsed.selections ? parsed.selections : {},
      locked: !!parsed.locked,
    };
  } catch {
    return null;
  }
}

export async function saveTutorialSession(
  userId: string,
  meetingSlug: string,
  state: TutorialSessionState
): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(userId, meetingSlug), JSON.stringify(state));
  } catch {
    // ignore
  }
}

/** Meeting slug from payload, or default starter tour. */
export function tutorialMeetingSlug(data: TutorialGetDataPayload | null): string {
  return data?.meeting?.slug?.trim() || 'starter-tour';
}
