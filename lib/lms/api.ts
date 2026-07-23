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

export async function lmsGetCompetition(competitionId: string) {
  const { data, error } = await db
    .from('lms_competitions')
    .select('id, name, season, status, created_at, start_gameweek_id')
    .eq('id', competitionId)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    name: string;
    season: string;
    status: string;
    created_at: string;
    start_gameweek_id: string | null;
  } | null;
}

/** First incomplete gameweek at or after the competition start week. */
export async function lmsGetCompetitionCurrentGameweek(
  competitionId: string
): Promise<{ gameweek: LmsGameweek | null; startGameweekNumber: number | null; startsAt: string | null }> {
  const comp = await lmsGetCompetition(competitionId);
  if (!comp) return { gameweek: null, startGameweekNumber: null, startsAt: null };

  let minNumber = 1;
  let startsAt: string | null = null;
  if (comp.start_gameweek_id) {
    const { data: startGw, error: startErr } = await supabase
      .from('lms_gameweeks')
      .select('number, starts_at')
      .eq('id', comp.start_gameweek_id)
      .maybeSingle();
    if (startErr) throw startErr;
    if (startGw) {
      minNumber = (startGw as { number: number }).number;
      startsAt = (startGw as { starts_at: string }).starts_at;
    }
  }

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

export async function lmsListCompetitionGameweeks(competitionId: string): Promise<LmsGameweek[]> {
  const comp = await lmsGetCompetition(competitionId);
  if (!comp) return [];

  let minNumber = 1;
  if (comp.start_gameweek_id) {
    const { data: startGw, error: startErr } = await supabase
      .from('lms_gameweeks')
      .select('number')
      .eq('id', comp.start_gameweek_id)
      .maybeSingle();
    if (startErr) throw startErr;
    if (startGw) minNumber = (startGw as { number: number }).number;
  }

  const { data, error } = await supabase
    .from('lms_gameweeks')
    .select('*')
    .eq('season', comp.season)
    .gte('number', minNumber)
    .order('number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as LmsGameweek[];
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
  const nameById = new Map((profiles ?? []).map((p: { id: string; username: string | null }) => [p.id, p.username]));
  return rows.map((r) => ({ ...r, username: nameById.get(r.user_id) ?? null }));
}

export async function lmsListTeams(): Promise<LmsTeam[]> {
  const { data, error } = await db.from('lms_teams').select('*').order('name');
  if (error) throw error;
  return (data ?? []) as LmsTeam[];
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

/** Picks from completed gameweeks for the whole competition (for leaderboard history drawers). */
export async function lmsListCompletedPicks(competitionId: string): Promise<
  {
    user_id: string;
    gameweek_id: string;
    gameweek_number: number;
    team_id: string;
    result: string;
    team?: LmsTeam;
  }[]
> {
  const comp = await lmsGetCompetition(competitionId);
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
    .select('user_id, gameweek_id, team_id, result')
    .eq('competition_id', competitionId)
    .in('gameweek_id', gwIds);
  if (error) throw error;
  const rows = (data ?? []) as {
    user_id: string;
    gameweek_id: string;
    team_id: string;
    result: string;
  }[];
  if (!rows.length) return [];

  const teamIds = [...new Set(rows.map((r) => r.team_id))];
  const { data: teams } = await db.from('lms_teams').select('*').in('id', teamIds);
  const byId = new Map(((teams ?? []) as LmsTeam[]).map((t) => [t.id, t]));

  return rows
    .map((r) => ({
      user_id: r.user_id,
      gameweek_id: r.gameweek_id,
      gameweek_number: numberById.get(r.gameweek_id) ?? 0,
      team_id: r.team_id,
      result: r.result,
      team: byId.get(r.team_id),
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
  return fixtures.map((f) => ({
    ...f,
    home_team: byId.get(f.home_team_id),
    away_team: byId.get(f.away_team_id),
  }));
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

  const lastFive = finished.slice(-5).map((f) => {
    const home = f.home_team_id === teamId;
    const hg = f.home_goals as number;
    const ag = f.away_goals as number;
    if (hg === ag) return 'D' as const;
    const won = home ? hg > ag : ag > hg;
    return won ? ('W' as const) : ('L' as const);
  });

  while (lastFive.length < 5) lastFive.unshift(null);
  return lastFive;
}

export async function lmsGetMyPick(
  competitionId: string,
  userId: string,
  gameweekId: string
): Promise<LmsPick | null> {
  const { data, error } = await supabase
    .from('lms_picks')
    .select('*')
    .eq('competition_id', competitionId)
    .eq('user_id', userId)
    .eq('gameweek_id', gameweekId)
    .maybeSingle();
  if (error) throw error;
  return data as LmsPick | null;
}

/** All picks for a competition gameweek (same-comp members can read via RLS). */
export async function lmsListPicksForGameweek(
  competitionId: string,
  gameweekId: string
): Promise<LmsPick[]> {
  const { data, error } = await db
    .from('lms_picks')
    .select('id, competition_id, user_id, gameweek_id, team_id, result')
    .eq('competition_id', competitionId)
    .eq('gameweek_id', gameweekId);
  if (error) throw error;
  const rows = (data ?? []) as LmsPick[];
  if (!rows.length) return [];

  const teamIds = [...new Set(rows.map((r) => r.team_id))];
  const { data: teams } = await db.from('lms_teams').select('*').in('id', teamIds);
  const byId = new Map(((teams ?? []) as LmsTeam[]).map((t) => [t.id, t]));
  return rows.map((r) => ({ ...r, team: byId.get(r.team_id) }));
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
      return 'That team is not playing in this gameweek.';
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
    default:
      return 'Could not send join request.';
  }
}
