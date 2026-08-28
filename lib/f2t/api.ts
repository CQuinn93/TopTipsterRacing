import { supabase } from '@/lib/supabase';

const db = supabase as any;

export type F2tCompetitionHomeSummary = {
  competition_id: string;
  name: string;
  season: string;
  competition_status: string;
  participant_status: string;
  entry: string | null;
  joined_at: string;
  start_gameweek_id: string;
  start_gameweek_number: number;
  scored_count: number;
  selection_count: number;
  selections_locked: boolean;
  can_manage: boolean;
  is_manager: boolean;
};

export type F2tPendingJoin = {
  competition_id: string;
  name: string;
  season: string;
  requested_at: string;
};

export type F2tSelectablePlayer = {
  id: string;
  display_name: string;
  full_name: string;
  position: string | null;
  team_id: string;
  team_name: string;
  team_short_name: string;
  team_slug: string;
  picker_stats: Record<string, unknown>;
  owner_flagged: boolean;
  already_scored_for_comp: boolean;
};

export type F2tSelectionRow = {
  slot: number;
  player_id: string;
  display_name: string;
  team_id: string;
  team_name: string;
  team_short_name: string;
  team_slug: string;
  scored_at: string | null;
  scored_gameweek_id: string | null;
  owner_flagged: boolean;
};

export function f2tJoinErrorMessage(code?: string): string {
  switch (code) {
    case 'invalid_code':
      return 'Invalid join code.';
    case 'entries_closed':
      return 'Entries are closed for this competition.';
    case 'already_in':
      return 'You are already in this competition.';
    case 'account_banned':
      return 'Your account cannot join competitions.';
    case 'competition_completed':
      return 'This competition has finished.';
    default:
      return code ?? 'Could not join.';
  }
}

export async function f2tGetHome(season = '2026/27') {
  const { data, error } = await db.rpc('f2t_get_home', { p_season: season });
  if (error) throw error;
  return data as {
    competitions: F2tCompetitionHomeSummary[];
    pending: F2tPendingJoin[];
  };
}

export async function f2tRequestJoin(accessCode: string) {
  const { data, error } = await db.rpc('f2t_request_join', {
    p_access_code: accessCode,
  });
  if (error) throw error;
  return data as {
    success: boolean;
    error?: string;
    competition_name?: string;
    competition_id?: string;
    join_request_id?: string;
  };
}

export async function f2tGetCompetition(competitionId: string) {
  const { data, error } = await db.rpc('f2t_get_competition', {
    p_competition_id: competitionId,
  });
  if (error) throw error;
  return data as {
    success: boolean;
    error?: string;
    competition?: {
      id: string;
      name: string;
      season: string;
      status: string;
      entry: string | null;
      start_gameweek_id: string;
      start_gameweek_number: number;
      start_gameweek_deadline: string;
      join_open: boolean;
    };
    participant?: {
      status: string;
      regular_sub_used: boolean;
      completed_at: string | null;
      scored_count: number;
      unscored_count: number;
      selection_count: number;
      sub_eligible_regular: boolean;
    };
    selections?: F2tSelectionRow[];
    leaderboard?: Array<{
      user_id: string;
      username: string | null;
      status: string;
      scored_count: number;
      completed_at: string | null;
    }>;
    permissions?: {
      can_manage: boolean;
      can_handle_joins: boolean;
      is_creator: boolean;
      is_manager: boolean;
    };
  };
}

export async function f2tListSelectablePlayers(competitionId: string) {
  const { data, error } = await db.rpc('f2t_list_selectable_players', {
    p_competition_id: competitionId,
  });
  if (error) throw error;
  const row = data as { success: boolean; players?: F2tSelectablePlayer[]; error?: string };
  if (row && row.success === false) {
    throw new Error(row.error ?? 'Could not load players');
  }
  return row.players ?? [];
}

export async function f2tSubmitSelections(competitionId: string, playerIds: string[]) {
  const { data, error } = await db.rpc('f2t_submit_selections', {
    p_competition_id: competitionId,
    p_player_ids: playerIds,
  });
  if (error) throw error;
  return data as { success: boolean; error?: string };
}

export async function f2tUseSubstitution(
  competitionId: string,
  outPlayerId: string,
  inPlayerId: string,
  type: 'regular' | 'owner_flag' = 'regular'
) {
  const { data, error } = await db.rpc('f2t_use_substitution', {
    p_competition_id: competitionId,
    p_out_player_id: outPlayerId,
    p_in_player_id: inPlayerId,
    p_type: type,
  });
  if (error) throw error;
  return data as { success: boolean; error?: string };
}

export async function f2tCreateCompetition(
  name: string,
  startGameweekId: string,
  season = '2026/27',
  entry?: string
) {
  const { data, error } = await db.rpc('f2t_admin_create_competition', {
    p_code: '',
    p_name: name,
    p_start_gameweek_id: startGameweekId,
    p_season: season,
    p_entry: entry ?? null,
  });
  if (error) throw error;
  return data as {
    success: boolean;
    error?: string;
    competition_id?: string;
    access_code?: string;
  };
}

export async function f2tApproveJoin(requestId: string) {
  const { data, error } = await db.rpc('f2t_admin_approve_join', {
    p_code: '',
    p_request_id: requestId,
  });
  if (error) throw error;
  return data as { success: boolean; error?: string };
}

export async function f2tRejectJoin(requestId: string) {
  const { data, error } = await db.rpc('f2t_admin_reject_join', {
    p_code: '',
    p_request_id: requestId,
  });
  if (error) throw error;
  return data as { success: boolean; error?: string };
}

export async function f2tListPendingForCompetition(competitionId: string) {
  const { data, error } = await db.rpc('f2t_admin_list_pending_for_competition', {
    p_competition_id: competitionId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as Array<{
    id: string;
    user_id: string;
    username: string | null;
    created_at: string;
  }>;
}

export async function ownerListFootballPlayers(teamId?: string, search?: string) {
  const { data, error } = await db.rpc('owner_list_football_players', {
    p_team_id: teamId ?? null,
    p_search: search ?? null,
  });
  if (error) throw error;
  const row = data as { success: boolean; players?: Array<Record<string, unknown>>; error?: string };
  return row.players ?? [];
}

export async function ownerListFootballPlayersFplAlerts() {
  const { data, error } = await db.rpc('owner_list_football_players_fpl_alerts');
  if (error) throw error;
  const row = data as { success: boolean; players?: Array<Record<string, unknown>>; error?: string };
  if (!row.success) throw new Error(row.error ?? 'Could not load FPL alerts');
  return row.players ?? [];
}

export async function ownerSetFootballPlayerFlagged(playerId: string, flagged: boolean) {
  const { data, error } = await db.rpc('owner_set_football_player_flagged', {
    p_player_id: playerId,
    p_flagged: flagged,
  });
  if (error) throw error;
  return data as { success: boolean; error?: string };
}

export type OwnerSyncFootballPlayersResult = {
  success: boolean;
  upserted?: number;
  fetched?: number;
  skipped_no_team?: number;
  skipped_no_name?: number;
  teams_mapped?: number;
  bbs_teams_fetched?: number;
  error?: string;
  hint?: string;
};

export async function ownerSyncFootballPlayersBbs(): Promise<OwnerSyncFootballPlayersResult> {
  const { data, error } = await supabase.functions.invoke('sync-football-players-bbs', {
    body: {},
  });
  if (data && typeof data === 'object' && 'success' in (data as object)) {
    return data as OwnerSyncFootballPlayersResult;
  }
  if (error) throw error;
  return { success: false, error: 'empty_response' };
}
