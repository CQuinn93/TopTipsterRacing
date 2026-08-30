import {
  lmsFixturesNeedRefresh,
  lmsGetCurrentGameweek,
  lmsGetHome,
  lmsListFixturesForGameweek,
  type LmsFixture,
  type LmsGameweek,
} from '@/lib/lms/api';
import {
  lmsSessionGetFixtures,
  lmsSessionSetFixtures,
} from '@/lib/lms/sessionCache';

/**
 * Next-up gameweek + fixtures for football home screens.
 * Uses in-session fixture cache only when scores are still current.
 */
export async function loadFootballNextUp(season = '2026/27'): Promise<{
  gameweek: LmsGameweek | null;
  fixtures: LmsFixture[];
}> {
  try {
    const current = await lmsGetCurrentGameweek(season);
    if (current?.id) {
      const cached = lmsSessionGetFixtures(current.id);
      if (cached?.length && !lmsFixturesNeedRefresh(cached)) {
        return { gameweek: current, fixtures: cached };
      }
      const fresh = await lmsListFixturesForGameweek(current.id);
      if (fresh.length) {
        lmsSessionSetFixtures(current.id, fresh);
        return { gameweek: current, fixtures: fresh };
      }
    }
  } catch {
    // Fall through to home RPC.
  }

  const home = await lmsGetHome(season);
  const gameweek = home.nextUp.gameweek;
  let fixtures = home.nextUp.fixtures ?? [];
  if (gameweek?.id) {
    try {
      const fresh = await lmsListFixturesForGameweek(gameweek.id);
      if (fresh.length) fixtures = fresh;
    } catch {
      /* keep home RPC fixtures */
    }
  }
  if (gameweek?.id && fixtures.length > 0) {
    lmsSessionSetFixtures(gameweek.id, fixtures);
  }
  return { gameweek, fixtures };
}
