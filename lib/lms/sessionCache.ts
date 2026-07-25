import { Image } from 'expo-image';
import type { LmsFixture, LmsTeam } from '@/lib/lms/api';

/** In-memory session caches — live until the web/app tab is closed. */

let teamsCache: LmsTeam[] | null = null;
const fixturesByGameweekId = new Map<string, LmsFixture[]>();
let formFixturesCache: { season: string; fixtures: LmsFixture[] } | null = null;
const crestPrefetched = new Set<string>();

export function lmsSessionGetTeams(): LmsTeam[] | null {
  return teamsCache;
}

export function lmsSessionSetTeams(teams: LmsTeam[]): void {
  teamsCache = teams;
  void lmsSessionPrefetchCrests(teams);
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

/** All fixtures loaded so far this session (for Gameweeks “All” view). */
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

/** Prefetch crest URLs once per session so later tiles hit memory/disk cache. */
export async function lmsSessionPrefetchCrests(
  teams: { crest_url?: string | null }[]
): Promise<void> {
  const urls = [
    ...new Set(
      teams
        .map((t) => t.crest_url?.trim())
        .filter((u): u is string => !!u && !crestPrefetched.has(u))
    ),
  ];
  if (!urls.length) return;
  for (const u of urls) crestPrefetched.add(u);
  try {
    await Image.prefetch(urls, 'memory-disk');
  } catch {
    // Prefetch is best-effort; TeamCrest still loads with cachePolicy.
  }
}
