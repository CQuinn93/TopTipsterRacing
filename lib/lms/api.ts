import { supabase } from '@/lib/supabase';

/** Untyped client for LMS tables/RPCs not yet in generated Database types. */
const db = supabase as any;

export type LmsCompetitionRow = {
  competition_id: string;
  name: string;
  season: string;
  competition_status: string;
  participant_status: string;
  joined_at: string;
  rollover_count: number;
  start_gameweek_id?: string | null;
  start_gameweek_number?: number | null;
};

export type LmsPendingJoin = {
  competition_id: string;
  name: string;
  season: string;
  requested_at: string;
};

export type LmsTeam = {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  /** @deprecated UI uses colour chips; kept for a possible future crest restore. */
  crest_url?: string | null;
};

export type LmsGameweek = {
  id: string;
  season: string;
  number: number;
  deadline_at: string;
  starts_at: string;
  status: string;
};

export type LmsFixture = {
  id: string;
  gameweek_id: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  home_goals: number | null;
  away_goals: number | null;
  status: string;
  home_team?: LmsTeam;
  away_team?: LmsTeam;
  gameweek_number?: number;
  excluded_from_lms?: boolean;
  excluded_reason?: string | null;
};

export type LmsParticipant = {
  id: string;
  competition_id: string;
  user_id: string;
  status: string;
  eliminated_gameweek_id: string | null;
  joined_at: string;
  rollover_count: number;
  username?: string | null;
};

export type LmsPick = {
  id: string;
  competition_id: string;
  user_id: string;
  gameweek_id: string;
  team_id: string;
  result: string;
  team?: LmsTeam;
};

export type LmsLeagueTableRow = {
  position: number;
  team_id: string;
  name: string;
  short_name: string;
  slug: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

export type LmsLeagueTable = {
  success: boolean;
  error?: string;
  season: string;
  computed_at: string;
  rows: LmsLeagueTableRow[];
};

function asArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  return [];
}

export async function lmsListMyCompetitions(): Promise<LmsCompetitionRow[]> {
  const { data, error } = await db.rpc('lms_list_my_competitions');
  if (error) throw error;
  return asArray<LmsCompetitionRow>(data);
}

export async function lmsListMyPendingJoins(): Promise<LmsPendingJoin[]> {
  const { data, error } = await db.rpc('lms_list_my_pending_joins');
  if (error) throw error;
  return asArray<LmsPendingJoin>(data);
}

export async function lmsRequestJoin(accessCode: string): Promise<{
  success: boolean;
  error?: string;
  competition_name?: string;
  competition_id?: string;
  status?: string;
}> {
  const { data, error } = await db.rpc('lms_request_join', {
    p_access_code: accessCode.trim().toUpperCase(),
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
    competition_name?: string;
    competition_id?: string;
    status?: string;
  };
}

export async function lmsSubmitPick(params: {
  competitionId: string;
  gameweekId: string;
  teamId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await db.rpc('lms_submit_pick', {
    p_competition_id: params.competitionId,
    p_gameweek_id: params.gameweekId,
    p_team_id: params.teamId,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as { success: boolean; error?: string };
}

export type LmsCompetition = {
  id: string;
  name: string;
  season: string;
  status: string;
  created_at: string;
  start_gameweek_id: string | null;
};

export type LmsCompletedPick = {
  user_id: string;
  gameweek_id: string;
  gameweek_number: number;
  team_id: string;
  result: string;
  team?: LmsTeam;
};

export async function lmsGetCompetition(competitionId: string): Promise<LmsCompetition | null> {
  const { data, error } = await db
    .from('lms_competitions')
    .select('id, name, season, status, created_at, start_gameweek_id')
    .eq('id', competitionId)
    .maybeSingle();
  if (error) throw error;
  return data as LmsCompetition | null;
}

async function resolveStartGameweekMeta(
  startGameweekId: string | null | undefined
): Promise<{ minNumber: number; startsAt: string | null }> {
  if (!startGameweekId) return { minNumber: 1, startsAt: null };
  const { data: startGw, error: startErr } = await supabase
    .from('lms_gameweeks')
    .select('number, starts_at')
    .eq('id', startGameweekId)
    .maybeSingle();
  if (startErr) throw startErr;
  if (!startGw) return { minNumber: 1, startsAt: null };
  return {
    minNumber: (startGw as { number: number }).number,
    startsAt: (startGw as { starts_at: string }).starts_at,
  };
}

/** First incomplete gameweek at or after the competition start week. */
export async function lmsGetCompetitionCurrentGameweek(
  competitionId: string,
  /** Pass a preloaded competition to avoid a duplicate REST fetch. */
  preloadedCompetition?: LmsCompetition | null
): Promise<{ gameweek: LmsGameweek | null; startGameweekNumber: number | null; startsAt: string | null }> {
  const comp = preloadedCompetition ?? (await lmsGetCompetition(competitionId));
  if (!comp) return { gameweek: null, startGameweekNumber: null, startsAt: null };

  const { minNumber, startsAt } = await resolveStartGameweekMeta(comp.start_gameweek_id);

  const { data, error } = await supabase
    .from('lms_gameweeks')
    .select('*')
    .eq('season', comp.season)
    .gte('number', minNumber)
    .neq('status', 'complete')
    .order('number', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return {
    gameweek: (data as LmsGameweek | null) ?? null,
    startGameweekNumber: comp.start_gameweek_id ? minNumber : null,
    startsAt,
  };
}

export async function lmsListCompetitionGameweeks(
  competitionId: string,
  preloadedCompetition?: LmsCompetition | null
): Promise<LmsGameweek[]> {
  const comp = preloadedCompetition ?? (await lmsGetCompetition(competitionId));
  if (!comp) return [];

  const { minNumber } = await resolveStartGameweekMeta(comp.start_gameweek_id);

  const { data, error } = await supabase
    .from('lms_gameweeks')
    .select('*')
    .eq('season', comp.season)
    .gte('number', minNumber)
    .order('number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as LmsGameweek[];
}

function mapEmbeddedTeam(row: unknown): LmsTeam | undefined {
  if (!row || typeof row !== 'object') return undefined;
  return row as LmsTeam;
}

function mapFixtureWithTeams(row: Record<string, unknown>): LmsFixture {
  const home = mapEmbeddedTeam(row.home_team);
  const away = mapEmbeddedTeam(row.away_team);
  const gw = row.gameweek as { number?: number } | null | undefined;
  const { home_team: _h, away_team: _a, gameweek: _g, ...rest } = row;
  return {
    ...(rest as unknown as LmsFixture),
    home_team: home,
    away_team: away,
    gameweek_number: gw?.number ?? (rest as { gameweek_number?: number }).gameweek_number,
  };
}

export async function lmsGetMyParticipant(competitionId: string, userId: string) {
  const { data, error } = await supabase
    .from('lms_participants')
    .select('*')
    .eq('competition_id', competitionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as LmsParticipant | null;
}

export async function lmsListParticipants(competitionId: string): Promise<LmsParticipant[]> {
  const { data, error } = await supabase
    .from('lms_participants')
    .select('id, competition_id, user_id, status, eliminated_gameweek_id, joined_at, rollover_count')
    .eq('competition_id', competitionId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as LmsParticipant[];
  if (!rows.length) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: profiles } = await db.from('profiles').select('id, username').in('id', userIds);
  const nameById = new Map<string, string | null>(
    ((profiles ?? []) as { id: string; username: string | null }[]).map((p) => [p.id, p.username])
  );
  return rows.map((r) => ({ ...r, username: nameById.get(r.user_id) ?? null }));
}

export async function lmsListTeams(): Promise<LmsTeam[]> {
  const { data, error } = await db.from('lms_teams').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as LmsTeam[];
}

/** Finished fixtures from recent gameweeks — enough for form dots.
 * Includes in-progress weeks (finished matches count as soon as they FT). */
export async function lmsListRecentFinishedFixtures(
  season = '2026/27',
  gameweekLimit = 6
): Promise<LmsFixture[]> {
  const { data: recentGws, error: gwErr } = await supabase
    .from('lms_gameweeks')
    .select('id, number')
    .eq('season', season)
    .order('number', { ascending: false })
    .limit(gameweekLimit);
  if (gwErr) throw gwErr;
  const gws = (recentGws ?? []) as { id: string; number: number }[];
  if (!gws.length) return [];

  const gwIds = gws.map((g) => g.id);
  const numberById = new Map(gws.map((g) => [g.id, g.number]));
  const fixtures = await lmsListFixturesForGameweekIds(gwIds);
  return fixtures.map((f) => ({
    ...f,
    gameweek_number: numberById.get(f.gameweek_id) ?? f.gameweek_number,
  }));
}

async function lmsListFixturesForGameweekIds(gwIds: string[]): Promise<LmsFixture[]> {
  if (!gwIds.length) return [];
  const embedded = await db
    .from('lms_fixtures')
    .select(
      '*, home_team:lms_teams!home_team_id(*), away_team:lms_teams!away_team_id(*)'
    )
    .in('gameweek_id', gwIds)
    .order('kickoff_at', { ascending: true });

  if (!embedded.error) {
    return ((embedded.data ?? []) as Record<string, unknown>[]).map(mapFixtureWithTeams);
  }

  const { data, error } = await supabase
    .from('lms_fixtures')
    .select('*')
    .in('gameweek_id', gwIds)
    .order('kickoff_at', { ascending: true });
  if (error) throw error;
  const fixtures = (data ?? []) as LmsFixture[];
  if (!fixtures.length) return [];
  const teamIds = Array.from(
    new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]))
  );
  const { data: teams } = await db.from('lms_teams').select('*').in('id', teamIds);
  const byId = new Map(((teams ?? []) as LmsTeam[]).map((t) => [t.id, t]));
  return fixtures.map((f) => ({
    ...f,
    home_team: byId.get(f.home_team_id),
    away_team: byId.get(f.away_team_id),
  }));
}

export async function lmsListUsedTeamIds(competitionId: string, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('lms_used_teams')
    .select('team_id')
    .eq('competition_id', competitionId)
    .eq('user_id', userId);
  if (error) throw error;
  return ((data ?? []) as { team_id: string }[]).map((r) => r.team_id);
}

export async function lmsListCompetitionTeamIds(competitionId: string): Promise<string[]> {
  const { data, error } = await db
    .from('lms_competition_teams')
    .select('team_id')
    .eq('competition_id', competitionId);
  if (error) throw error;
  return ((data ?? []) as { team_id: string }[]).map((r) => r.team_id);
}

export async function lmsIsProfileAdmin(userId: string): Promise<boolean> {
  const { data, error } = await db
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const role = (data as { role?: string | null } | null)?.role;
  return role === 'Admin' || role === 'Owner';
}

export async function lmsAdminSetCompetitionTeam(
  competitionId: string,
  teamId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await db.rpc('lms_admin_set_competition_team', {
    p_competition_id: competitionId,
    p_team_id: teamId,
    p_enabled: enabled,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as { success: boolean; error?: string };
}

export async function lmsAdminSetFixtureExcluded(
  fixtureId: string,
  excluded: boolean,
  reason?: string | null
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await db.rpc('lms_admin_set_fixture_excluded', {
    p_fixture_id: fixtureId,
    p_excluded: excluded,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as { success: boolean; error?: string };
}

export async function lmsAdminDeleteCompetition(
  competitionId: string
): Promise<{ success: boolean; error?: string; name?: string }> {
  const { data, error } = await db.rpc('lms_admin_delete_competition', {
    p_competition_id: competitionId,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
    name?: string;
  };
}

/** Picks from completed gameweeks for the whole competition (for leaderboard history drawers). */
export async function lmsListCompletedPicks(
  competitionId: string,
  preloadedCompetition?: LmsCompetition | null
): Promise<LmsCompletedPick[]> {
  const comp = preloadedCompetition ?? (await lmsGetCompetition(competitionId));
  if (!comp) return [];

  const { data: completeGws, error: gwErr } = await supabase
    .from('lms_gameweeks')
    .select('id, number')
    .eq('season', comp.season)
    .eq('status', 'complete')
    .order('number', { ascending: true });
  if (gwErr) throw gwErr;
  const gws = (completeGws ?? []) as { id: string; number: number }[];
  if (!gws.length) return [];

  const gwIds = gws.map((g) => g.id);
  const numberById = new Map(gws.map((g) => [g.id, g.number]));

  const { data, error } = await db
    .from('lms_picks')
    .select('user_id, gameweek_id, team_id, result, team:lms_teams(*)')
    .eq('competition_id', competitionId)
    .in('gameweek_id', gwIds);
  if (error) throw error;
  const rows = (data ?? []) as {
    user_id: string;
    gameweek_id: string;
    team_id: string;
    result: string;
    team?: LmsTeam | null;
  }[];
  if (!rows.length) return [];

  return rows
    .map((r) => ({
      user_id: r.user_id,
      gameweek_id: r.gameweek_id,
      gameweek_number: numberById.get(r.gameweek_id) ?? 0,
      team_id: r.team_id,
      result: r.result,
      team: r.team ?? undefined,
    }))
    .sort((a, b) => a.gameweek_number - b.gameweek_number);
}

/** Completed-gameweek picks for one player (Selection previous chips / lazy leaderboard drawer). */
export async function lmsListCompletedPicksForUser(
  competitionId: string,
  userId: string,
  preloadedCompetition?: LmsCompetition | null
): Promise<LmsCompletedPick[]> {
  const comp = preloadedCompetition ?? (await lmsGetCompetition(competitionId));
  if (!comp) return [];

  const { data: completeGws, error: gwErr } = await supabase
    .from('lms_gameweeks')
    .select('id, number')
    .eq('season', comp.season)
    .eq('status', 'complete')
    .order('number', { ascending: true });
  if (gwErr) throw gwErr;
  const gws = (completeGws ?? []) as { id: string; number: number }[];
  if (!gws.length) return [];

  const gwIds = gws.map((g) => g.id);
  const numberById = new Map(gws.map((g) => [g.id, g.number]));

  const { data, error } = await db
    .from('lms_picks')
    .select('user_id, gameweek_id, team_id, result, team:lms_teams(*)')
    .eq('competition_id', competitionId)
    .eq('user_id', userId)
    .in('gameweek_id', gwIds);
  if (error) throw error;

  const rows = (data ?? []) as {
    user_id: string;
    gameweek_id: string;
    team_id: string;
    result: string;
    team?: LmsTeam | null;
  }[];

  return rows
    .map((r) => ({
      user_id: r.user_id,
      gameweek_id: r.gameweek_id,
      gameweek_number: numberById.get(r.gameweek_id) ?? 0,
      team_id: r.team_id,
      result: r.result,
      team: r.team ?? undefined,
    }))
    .sort((a, b) => a.gameweek_number - b.gameweek_number);
}


export async function lmsGetCurrentGameweek(season = '2026/27'): Promise<LmsGameweek | null> {
  const { data, error } = await supabase
    .from('lms_gameweeks')
    .select('*')
    .eq('season', season)
    .neq('status', 'complete')
    .order('number', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as LmsGameweek | null;
}

export async function lmsListGameweeks(season = '2026/27'): Promise<LmsGameweek[]> {
  const { data, error } = await supabase
    .from('lms_gameweeks')
    .select('*')
    .eq('season', season)
    .order('number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as LmsGameweek[];
}

export async function lmsListFixturesForGameweek(gameweekId: string): Promise<LmsFixture[]> {
  const { data: gwMeta, error: gwMetaErr } = await supabase
    .from('lms_gameweeks')
    .select('number')
    .eq('id', gameweekId)
    .maybeSingle();
  if (gwMetaErr) throw gwMetaErr;
  const gameweekNumber = (gwMeta as { number?: number } | null)?.number;

  const stamp = (fixtures: LmsFixture[]): LmsFixture[] =>
    fixtures.map((f) => ({
      ...f,
      gameweek_number: f.gameweek_number ?? gameweekNumber,
    }));

  const embedded = await db
    .from('lms_fixtures')
    .select(
      '*, home_team:lms_teams!home_team_id(*), away_team:lms_teams!away_team_id(*), gameweek:lms_gameweeks(number)'
    )
    .eq('gameweek_id', gameweekId)
    .order('kickoff_at', { ascending: true });

  if (!embedded.error) {
    return stamp(
      ((embedded.data ?? []) as Record<string, unknown>[]).map(mapFixtureWithTeams)
    );
  }

  // Fallback if relationship hints are unavailable in this schema cache.
  const { data, error } = await supabase
    .from('lms_fixtures')
    .select('*')
    .eq('gameweek_id', gameweekId)
    .order('kickoff_at', { ascending: true });
  if (error) throw error;
  const fixtures = (data ?? []) as LmsFixture[];
  if (!fixtures.length) return [];

  const teamIds = Array.from(
    new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]))
  );
  const { data: teams } = await db.from('lms_teams').select('*').in('id', teamIds);
  const byId = new Map(((teams ?? []) as LmsTeam[]).map((t) => [t.id, t]));
  return stamp(
    fixtures.map((f) => ({
      ...f,
      home_team: byId.get(f.home_team_id),
      away_team: byId.get(f.away_team_id),
    }))
  );
}

/** All fixtures for a season, with team + gameweek number attached. */
export async function lmsListSeasonFixtures(season = '2026/27'): Promise<LmsFixture[]> {
  const { data: gws, error: gwErr } = await supabase
    .from('lms_gameweeks')
    .select('id, number')
    .eq('season', season)
    .order('number', { ascending: true });
  if (gwErr) throw gwErr;
  const gameweeks = (gws ?? []) as { id: string; number: number }[];
  if (!gameweeks.length) return [];

  const gwIds = gameweeks.map((g) => g.id);
  const numberById = new Map(gameweeks.map((g) => [g.id, g.number]));

  const { data, error } = await db
    .from('lms_fixtures')
    .select(
      '*, home_team:lms_teams!home_team_id(*), away_team:lms_teams!away_team_id(*)'
    )
    .in('gameweek_id', gwIds)
    .order('kickoff_at', { ascending: true });

  if (!error) {
    return ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const mapped = mapFixtureWithTeams(row);
      return {
        ...mapped,
        gameweek_number: numberById.get(mapped.gameweek_id) ?? mapped.gameweek_number,
      };
    });
  }

  const { data: plain, error: plainErr } = await supabase
    .from('lms_fixtures')
    .select('*')
    .in('gameweek_id', gwIds)
    .order('kickoff_at', { ascending: true });
  if (plainErr) throw plainErr;
  const fixtures = (plain ?? []) as LmsFixture[];
  if (!fixtures.length) return [];

  const teamIds = Array.from(
    new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]))
  );
  const { data: teams } = await db.from('lms_teams').select('*').in('id', teamIds);
  const byId = new Map(((teams ?? []) as LmsTeam[]).map((t) => [t.id, t]));

  return fixtures.map((f) => ({
    ...f,
    home_team: byId.get(f.home_team_id),
    away_team: byId.get(f.away_team_id),
    gameweek_number: numberById.get(f.gameweek_id),
  }));
}

export type FormResult = 'W' | 'D' | 'L' | null;

/** Last five finished results for a team (oldest → newest), padded with nulls. */
export function lmsTeamFormFromFixtures(
  fixtures: LmsFixture[],
  teamId: string
): FormResult[] {
  const finished = fixtures
    .filter(
      (f) =>
        f.status === 'finished' &&
        f.home_goals != null &&
        f.away_goals != null &&
        (f.home_team_id === teamId || f.away_team_id === teamId)
    )
    .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());

  const lastFive: FormResult[] = finished.slice(-5).map((f) => {
    const home = f.home_team_id === teamId;
    const hg = f.home_goals as number;
    const ag = f.away_goals as number;
    if (hg === ag) return 'D';
    const won = home ? hg > ag : ag > hg;
    return won ? 'W' : 'L';
  });

  while (lastFive.length < 5) lastFive.unshift(null);
  return lastFive;
}

/**
 * Premier League table derived from finished `lms_fixtures` (no football-data call).
 * Prefer caching via `lmsSessionGet/SetLeagueTable` in the UI so revisits skip the DB.
 */
export async function lmsGetLeagueTable(season = '2026/27'): Promise<LmsLeagueTable> {
  const { data, error } = await db.rpc('lms_get_league_table', { p_season: season });
  if (error) throw error;

  const raw = (data ?? {}) as LmsLeagueTable;
  return {
    success: !!raw.success,
    error: raw.error,
    season: raw.season ?? season,
    computed_at: raw.computed_at ?? new Date().toISOString(),
    rows: Array.isArray(raw.rows) ? raw.rows : [],
  };
}

export async function lmsGetMyPick(
  competitionId: string,
  userId: string,
  gameweekId: string
): Promise<LmsPick | null> {
  const { data, error } = await db
    .from('lms_picks')
    .select('*, team:lms_teams(*)')
    .eq('competition_id', competitionId)
    .eq('user_id', userId)
    .eq('gameweek_id', gameweekId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as LmsPick & { team?: LmsTeam | null };
  return { ...row, team: row.team ?? undefined };
}

export type LmsCompetitionHomeSummary = LmsCompetitionRow & {
  aliveCount: number;
  totalCount: number;
  currentGameweekNumber: number | null;
  pickTeam: LmsTeam | null;
  pickAvailable: boolean;
};

export type LmsHomePayload = {
  competitions: LmsCompetitionHomeSummary[];
  pending: LmsPendingJoin[];
  nextUp: {
    gameweek: LmsGameweek | null;
    fixtures: LmsFixture[];
  };
};

/** Single RPC for LMS home: leagues + pending + next-up fixtures. */
export async function lmsGetHome(season = '2026/27'): Promise<LmsHomePayload> {
  const { data, error } = await db.rpc('lms_get_home', { p_season: season });
  if (error) throw error;

  const raw = (data ?? {}) as {
    competitions?: Array<
      LmsCompetitionRow & {
        alive_count?: number;
        total_count?: number;
        current_gameweek_number?: number | null;
        pick_team?: LmsTeam | null;
        pick_available?: boolean;
      }
    >;
    pending?: LmsPendingJoin[];
    next_up?: {
      gameweek?: LmsGameweek | null;
      fixtures?: LmsFixture[];
    };
  };

  const competitions: LmsCompetitionHomeSummary[] = (raw.competitions ?? []).map((c) => ({
    competition_id: c.competition_id,
    name: c.name,
    season: c.season,
    competition_status: c.competition_status,
    participant_status: c.participant_status,
    joined_at: c.joined_at,
    rollover_count: c.rollover_count,
    start_gameweek_id: c.start_gameweek_id,
    start_gameweek_number: c.start_gameweek_number,
    aliveCount: Number(c.alive_count ?? 0),
    totalCount: Number(c.total_count ?? 0),
    currentGameweekNumber: c.current_gameweek_number ?? null,
    pickTeam: c.pick_team ?? null,
    pickAvailable: !!c.pick_available,
  }));

  return {
    competitions,
    pending: raw.pending ?? [],
    nextUp: {
      gameweek: raw.next_up?.gameweek ?? null,
      fixtures: raw.next_up?.fixtures ?? [],
    },
  };
}

/** @deprecated Prefer lmsGetHome — kept for callers that only need competition cards. */
export async function lmsListMyCompetitionSummaries(
  _userId: string
): Promise<LmsCompetitionHomeSummary[]> {
  const home = await lmsGetHome();
  return home.competitions;
}

export type LmsPickStatOutcome =
  | 'won'
  | 'lost'
  | 'draw'
  | 'pending'
  | 'excluded'
  | 'no_fixture';

export type LmsGameweekPickStatTeam = {
  team_id: string;
  name: string;
  short_name: string;
  slug: string;
  pick_count: number;
  pick_pct: number;
  outcome: LmsPickStatOutcome;
};

export type LmsGameweekPickStats = {
  success: boolean;
  revealed: boolean;
  gameweek_id?: string;
  gameweek_number?: number;
  total_picks: number;
  teams: LmsGameweekPickStatTeam[];
  error?: string;
};

/** Aggregated pick share + fixture outcome for a gameweek (all competitions). */
export async function lmsGetGameweekPickStats(
  gameweekId: string
): Promise<LmsGameweekPickStats> {
  const { data, error } = await db.rpc('lms_get_gameweek_pick_stats', {
    p_gameweek_id: gameweekId,
  });
  if (error) throw error;
  const raw = (data ?? {}) as LmsGameweekPickStats;
  return {
    success: !!raw.success,
    revealed: !!raw.revealed,
    gameweek_id: raw.gameweek_id,
    gameweek_number: raw.gameweek_number,
    total_picks: Number(raw.total_picks ?? 0),
    teams: (raw.teams ?? []).map((t) => ({
      ...t,
      pick_count: Number(t.pick_count ?? 0),
      pick_pct: Number(t.pick_pct ?? 0),
    })),
    error: raw.error,
  };
}

/** All picks for a competition gameweek (same-comp members can read via RLS). */
export async function lmsListPicksForGameweek(
  competitionId: string,
  gameweekId: string
): Promise<LmsPick[]> {
  const { data, error } = await db
    .from('lms_picks')
    .select('id, competition_id, user_id, gameweek_id, team_id, result, team:lms_teams(*)')
    .eq('competition_id', competitionId)
    .eq('gameweek_id', gameweekId);
  if (error) throw error;
  const rows = (data ?? []) as (LmsPick & { team?: LmsTeam | null })[];
  return rows.map((r) => ({ ...r, team: r.team ?? undefined }));
}

export async function lmsAdminCreateCompetition(
  adminCode: string,
  name: string,
  startGameweekId: string,
  season = '2026/27'
) {
  const { data, error } = await db.rpc('lms_admin_create_competition', {
    p_code: adminCode,
    p_name: name,
    p_start_gameweek_id: startGameweekId,
    p_season: season,
  });
  if (error) throw error;
  return data as {
    success: boolean;
    error?: string;
    competition_id?: string;
    access_code?: string;
    start_gameweek_id?: string;
    start_gameweek_number?: number;
  };
}

export async function lmsAdminListCompetitions(adminCode: string) {
  const { data, error } = await db.rpc('lms_admin_list_competitions', { p_code: adminCode });
  if (error) throw error;
  return asArray<{
    id: string;
    name: string;
    season: string;
    status: string;
    created_at: string;
    start_gameweek_id: string | null;
    start_gameweek_number: number | null;
    join_code: string | null;
    active_rejoin_code: string | null;
    participant_count: number;
    active_count: number;
  }>(data);
}

export async function lmsAdminListPending(adminCode: string) {
  const { data, error } = await db.rpc('lms_admin_list_pending', { p_code: adminCode });
  if (error) throw error;
  return asArray<{
    id: string;
    competition_id: string;
    competition_name: string;
    user_id: string;
    username: string | null;
    code_type: string;
    created_at: string;
  }>(data);
}

export async function lmsAdminApproveJoin(adminCode: string, requestId: string) {
  const { data, error } = await db.rpc('lms_admin_approve_join', {
    p_code: adminCode,
    p_request_id: requestId,
  });
  if (error) throw error;
  return data as { success: boolean; error?: string };
}

export async function lmsAdminRejectJoin(adminCode: string, requestId: string) {
  const { data, error } = await db.rpc('lms_admin_reject_join', {
    p_code: adminCode,
    p_request_id: requestId,
  });
  if (error) throw error;
  return data as { success: boolean; error?: string };
}

export async function lmsAdminSetFixtureResult(
  adminCode: string,
  fixtureId: string,
  homeGoals: number,
  awayGoals: number
) {
  const { data, error } = await db.rpc('lms_admin_set_fixture_result', {
    p_code: adminCode,
    p_fixture_id: fixtureId,
    p_home_goals: homeGoals,
    p_away_goals: awayGoals,
  });
  if (error) throw error;
  return data as { success: boolean; error?: string };
}

export async function lmsSettleGameweek(adminCode: string, gameweekId: string) {
  const { data, error } = await db.rpc('lms_settle_gameweek', {
    p_code: adminCode,
    p_gameweek_id: gameweekId,
  });
  if (error) throw error;
  return data as { success: boolean; error?: string; results?: unknown; remaining?: number };
}

export async function lmsAdminCreateRejoinCode(
  adminCode: string,
  competitionId: string,
  gameweekId: string
) {
  const { data, error } = await db.rpc('lms_admin_create_rejoin_code', {
    p_code: adminCode,
    p_competition_id: competitionId,
    p_gameweek_id: gameweekId,
  });
  if (error) throw error;
  return data as { success: boolean; error?: string; access_code?: string };
}

export function lmsPickErrorMessage(code?: string): string {
  switch (code) {
    case 'before_competition_start':
      return 'This competition has not started yet for that gameweek.';
    case 'deadline_passed':
      return 'The gameweek deadline has passed.';
    case 'team_already_used':
      return 'You have already used that team in this competition.';
    case 'team_not_playing':
      return 'That team is not available to pick this gameweek.';
    case 'team_not_in_pool':
      return 'That team is not in this competition’s team pool.';
    case 'not_active':
      return 'You are not an active participant.';
    case 'pick_locked':
      return 'This pick can no longer be changed.';
    case 'competition_unavailable':
      return 'This competition is not available.';
    default:
      return 'Could not save your pick.';
  }
}

export function lmsJoinErrorMessage(code?: string): string {
  switch (code) {
    case 'invalid_code':
      return 'That access code is not valid.';
    case 'code_void':
      return 'This rejoin code is no longer valid for the gameweek.';
    case 'already_in':
      return 'You are already in this competition.';
    case 'competition_completed':
      return 'This competition has finished.';
    case 'entries_closed':
      return "Entries are closed — the pick deadline for this competition's starting gameweek has passed.";
    case 'account_banned':
      return 'This account has been banned and cannot join competitions.';
    default:
      return 'Could not send join request.';
  }
}
