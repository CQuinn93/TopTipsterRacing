import AsyncStorage from '@react-native-async-storage/async-storage';
import { wcSupabase } from '@/features/wc2026/lib/supabase';

/** Supabase / PostgREST errors are often plain objects, not `instanceof Error`. */
function formatLoadError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(
      (v) => typeof v === 'string' && (v as string).length > 0
    ) as string[];
    if (parts.length) return parts.join(' — ');
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export interface Team {
  id: string;
  country_code: string;
  country_name: string;
  confederation: string;
  fifa_ranking?: number | null;
}

export interface Venue {
  id: string;
  name: string;
  city: string;
  country: string;
  capacity: number | null;
}

export interface Group {
  id: string;
  group_name: string;
}

export interface TournamentStage {
  id: string;
  stage_name: string;
  stage_order: number;
  is_knockout: boolean;
}

export interface Match {
  id: string;
  match_number: number;
  tournament_stage_id: string;
  group_id: string | null;
  home_team_id: string;
  away_team_id: string;
  venue_id: string;
  match_date: string;
  home_score: number | null;
  away_score: number | null;
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  is_knockout: boolean;
  created_at: string;
  updated_at: string;
  home_team?: Team;
  away_team?: Team;
  venue?: Venue;
  group?: Group;
  tournament_stage?: TournamentStage;
}

const CACHE_KEY = 'wc2026_fixtures_cache';
const CACHE_TIMESTAMP_KEY = 'wc2026_fixtures_cache_timestamp';
const CACHE_VERSION_KEY = 'wc2026_fixtures_cache_version';
const CACHE_EXPIRY_MS = 1000 * 60 * 60;

const getCacheExpiry = () => Date.now() + CACHE_EXPIRY_MS;

const clearCache = async () => {
  await AsyncStorage.multiRemove([CACHE_KEY, CACHE_TIMESTAMP_KEY, CACHE_VERSION_KEY]);
};

const saveCache = async (fixtures: Match[], version?: string) => {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(fixtures));
  await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, getCacheExpiry().toString());
  if (version) await AsyncStorage.setItem(CACHE_VERSION_KEY, version);
};

/** Cache is optional; failures must not break loading fixtures from the DB. */
const saveCacheSafe = async (fixtures: Match[], version?: string) => {
  try {
    await saveCache(fixtures, version);
  } catch (e) {
    console.warn('[wc2026] Fixture cache write failed (continuing without cache):', formatLoadError(e));
  }
};

const loadCache = async (): Promise<Match[] | null> => {
  const [cachedData, cacheTimestamp] = await AsyncStorage.multiGet([CACHE_KEY, CACHE_TIMESTAMP_KEY]).then(
    (pairs) => [pairs[0]?.[1], pairs[1]?.[1]]
  );
  if (!cachedData || !cacheTimestamp) return null;
  if (Date.now() > parseInt(cacheTimestamp, 10)) {
    await clearCache();
    return null;
  }
  return JSON.parse(cachedData) as Match[];
};

const getDatabaseVersion = async (): Promise<string | null> => {
  const { data } = await wcSupabase
    .from('matches')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.updated_at ?? null;
};

const isCacheValid = async (): Promise<boolean> => {
  const [cachedVersion, dbVersion] = await Promise.all([
    AsyncStorage.getItem(CACHE_VERSION_KEY),
    getDatabaseVersion(),
  ]);
  return Boolean(cachedVersion && dbVersion && cachedVersion === dbVersion);
};

const fetchFixturesFromDatabase = async (): Promise<Match[]> => {
  const { data: matches, error: matchesError } = await wcSupabase
    .from('matches')
    .select('*')
    .order('match_date', { ascending: true })
    .order('match_number', { ascending: true });

  if (matchesError) throw new Error(formatLoadError(matchesError));
  if (!matches || matches.length === 0) return [];

  const teamIds = new Set<string>();
  const venueIds = new Set<string>();
  const groupIds = new Set<string>();
  const stageIds = new Set<string>();

  matches.forEach((match: Match) => {
    if (match.home_team_id) teamIds.add(match.home_team_id);
    if (match.away_team_id) teamIds.add(match.away_team_id);
    if (match.venue_id) venueIds.add(match.venue_id);
    if (match.group_id) groupIds.add(match.group_id);
    if (match.tournament_stage_id) stageIds.add(match.tournament_stage_id);
  });

  const teamIdList = Array.from(teamIds);
  const venueIdList = Array.from(venueIds);
  const groupIdList = Array.from(groupIds);
  const stageIdList = Array.from(stageIds);

  const [teamsResult, venuesResult, groupsResult, stagesResult] = await Promise.all([
    teamIdList.length
      ? wcSupabase.from('teams').select('id, country_code, country_name, confederation, fifa_ranking').in('id', teamIdList)
      : Promise.resolve({ data: [] as Team[], error: null }),
    venueIdList.length
      ? wcSupabase.from('venues').select('id, name, city, country, capacity').in('id', venueIdList)
      : Promise.resolve({ data: [] as Venue[], error: null }),
    groupIdList.length
      ? wcSupabase.from('groups').select('id, group_name').in('id', groupIdList)
      : Promise.resolve({ data: [] as Group[], error: null }),
    stageIdList.length
      ? wcSupabase.from('tournament_stages').select('id, stage_name, stage_order, is_knockout').in('id', stageIdList)
      : Promise.resolve({ data: [] as TournamentStage[], error: null }),
  ]);

  const joinErr =
    teamsResult.error || venuesResult.error || groupsResult.error || stagesResult.error;
  if (joinErr) throw new Error(formatLoadError(joinErr));

  const teamsMap = new Map((teamsResult.data || []).map((t: Team) => [t.id, t]));
  const venuesMap = new Map((venuesResult.data || []).map((v: Venue) => [v.id, v]));
  const groupsMap = new Map((groupsResult.data || []).map((g: Group) => [g.id, g]));
  const stagesMap = new Map((stagesResult.data || []).map((s: TournamentStage) => [s.id, s]));

  return matches.map((match: Match) => ({
    ...match,
    home_team: match.home_team_id ? teamsMap.get(match.home_team_id) : undefined,
    away_team: match.away_team_id ? teamsMap.get(match.away_team_id) : undefined,
    venue: match.venue_id ? venuesMap.get(match.venue_id) : undefined,
    group: match.group_id ? groupsMap.get(match.group_id) : undefined,
    tournament_stage: match.tournament_stage_id ? stagesMap.get(match.tournament_stage_id) : undefined,
  }));
};

export const getFixtures = async (forceRefresh = false): Promise<Match[]> => {
  try {
    if (!forceRefresh) {
      const cacheValid = await isCacheValid();
      if (cacheValid) {
        const cachedFixtures = await loadCache();
        if (cachedFixtures?.length) return cachedFixtures;
      } else {
        await clearCache();
      }
    } else {
      await clearCache();
    }

    const fixtures = await fetchFixturesFromDatabase();
    const dbVersion = await getDatabaseVersion();
    await saveCacheSafe(fixtures, dbVersion || undefined);
    return fixtures;
  } catch (error) {
    let cachedFixtures: Match[] | null = null;
    try {
      cachedFixtures = await loadCache();
    } catch {
      cachedFixtures = null;
    }
    if (cachedFixtures?.length) return cachedFixtures;
    throw new Error(formatLoadError(error));
  }
};

export const getUpcomingFixtures = async (limit = 10): Promise<Match[]> => {
  const fixtures = await getFixtures();
  const now = new Date();
  return fixtures
    .filter((match) => new Date(match.match_date) > now && match.status === 'scheduled')
    .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
    .slice(0, limit);
};

export const refreshFixtures = (): Promise<Match[]> => getFixtures(true);
