import {
  lmsGetCurrentGameweek,
  lmsGetHome,
  type LmsFixture,
  type LmsGameweek,
} from '@/lib/lms/api';
import {
  lmsSessionGetFixtures,
  lmsSessionSetFixtures,
} from '@/lib/lms/sessionCache';

/**
 * Next-up gameweek + fixtures for football home screens.
 * Uses in-session fixture cache when LMS (or a prior visit) already loaded the GW.
 */
export async function loadFootballNextUp(season = '2026/27'): Promise<{
  gameweek: LmsGameweek | null;
  fixtures: LmsFixture[];
}> {
  try {
    const current = await lmsGetCurrentGameweek(season);
    if (current?.id) {
      const cached = lmsSessionGetFixtures(current.id);
      if (cached?.length) {
        return { gameweek: current, fixtures: cached };
      }
    }
  } catch {
    // Fall through to home RPC.
  }

  const home = await lmsGetHome(season);
  const gameweek = home.nextUp.gameweek;
  const fixtures = home.nextUp.fixtures ?? [];
  if (gameweek?.id && fixtures.length > 0) {
    lmsSessionSetFixtures(gameweek.id, fixtures);
  }
  return { gameweek, fixtures };
}
