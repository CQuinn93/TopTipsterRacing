import type { LmsFixture, LmsTeam } from '@/lib/lms/api';

/** In-memory session caches — live until the web/app tab is closed. */

let teamsCache: LmsTeam[] | null = null;
const fixturesByGameweekId = new Map<string, LmsFixture[]>();
let formFixturesCache: { season: string; fixtures: LmsFixture[] } | null = null;

export function lmsSessionGetTeams(): LmsTeam[] | null {
  return teamsCache;
}

export function lmsSessionSetTeams(teams: LmsTeam[]): void {
  teamsCache = teams;
  // Crest prefetch disabled — see lmsSessionPrefetchCrests no-op below.
  // void lmsSessionPrefetchCrests(teams);
}

export function lmsSessionGetFixtures(gameweekId: string): LmsFixture[] | undefined {
  return fixturesByGameweekId.get(gameweekId);
}

export function lmsSessionHasFixtures(gameweekId: string): boolean {
  return fixturesByGameweekId.has(gameweekId);
}

export function lmsSessionSetFixtures(gameweekId: string, fixtures: LmsFixture[]): void {
  fixturesByGameweekId.set(gameweekId, fixtures);
}

/** All fixtures loaded so far this session (for Gameweeks “Opened” view). */
export function lmsSessionListCachedFixtures(): LmsFixture[] {
  const out: LmsFixture[] = [];
  for (const list of fixturesByGameweekId.values()) out.push(...list);
  return out;
}

export function lmsSessionInvalidateFixtures(gameweekId?: string): void {
  if (gameweekId) fixturesByGameweekId.delete(gameweekId);
  else fixturesByGameweekId.clear();
}

export function lmsSessionGetFormFixtures(season: string): LmsFixture[] | null {
  if (!formFixturesCache || formFixturesCache.season !== season) return null;
  return formFixturesCache.fixtures;
}

export function lmsSessionSetFormFixtures(season: string, fixtures: LmsFixture[]): void {
  formFixturesCache = { season, fixtures };
}

export function lmsSessionInvalidateFormFixtures(): void {
  formFixturesCache = null;
}

/*
 * Crest prefetch (restore with TeamCrest + expo-image if logo rights obtained):
 *
 * import { Image } from 'expo-image';
 * const crestPrefetched = new Set<string>();
 * export async function lmsSessionPrefetchCrests(teams: { crest_url?: string | null }[]) {
 *   const urls = [...new Set(teams.map((t) => t.crest_url?.trim()).filter(Boolean))] as string[];
 *   ...
 *   await Image.prefetch(urls, 'memory-disk');
 * }
 */
export async function lmsSessionPrefetchCrests(
  _teams: { crest_url?: string | null }[]
): Promise<void> {
  // no-op while crests are disabled
}
