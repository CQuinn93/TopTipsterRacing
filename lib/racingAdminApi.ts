import { supabase } from '@/lib/supabase';

const db = supabase as any;

export type RacingJoinRequestRow = {
  id: string;
  competition_id: string;
  competition_name?: string;
  user_id: string;
  display_name: string | null;
  created_at: string;
};

export type RacingCompetitionListRow = {
  id: string;
  name: string;
  access_code: string | null;
  festival_start_date: string;
  festival_end_date: string;
  created_by_user_id: string | null;
  creator_username: string | null;
  display_status: 'upcoming' | 'live' | 'complete' | string;
};

export async function racingAdminListCompetitions(): Promise<RacingCompetitionListRow[]> {
  const { data, error } = await db.rpc('admin_list_competitions', { p_code: '' });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as RacingCompetitionListRow[];
}

export async function racingCreateCompetition(params: {
  name: string;
  festivalStartDate: string;
  festivalEndDate: string;
  accessCode?: string | null;
  courses?: string[];
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const { data, error } = await db.rpc('admin_create_competition', {
    p_code: '',
    p_name: params.name,
    p_festival_start_date: params.festivalStartDate,
    p_festival_end_date: params.festivalEndDate,
    p_selection_open_utc: '10:00',
    p_selection_close_minutes_before_first_race: 60,
    p_access_code: params.accessCode ?? null,
    p_courses: params.courses?.length ? params.courses : ['Newcastle'],
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
    id?: string;
  };
}

export async function racingAdminListPendingForCompetition(
  competitionId: string
): Promise<RacingJoinRequestRow[]> {
  const { data, error } = await db.rpc('admin_list_pending_for_competition', {
    p_code: '',
    p_competition_id: competitionId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as RacingJoinRequestRow[];
}

export async function racingApproveJoinRequest(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await db.rpc('admin_approve_request', {
    p_code: '',
    p_request_id: requestId,
  });
  if (error) throw error;
  return (data ?? { success: false }) as { success: boolean; error?: string };
}

export async function racingRejectJoinRequest(
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await db.rpc('admin_reject_request', {
    p_code: '',
    p_request_id: requestId,
  });
  if (error) throw error;
  return (data ?? { success: false }) as { success: boolean; error?: string };
}

export async function racingDeleteCompetition(
  competitionId: string
): Promise<{ success: boolean; error?: string; name?: string }> {
  const { data, error } = await db.rpc('admin_delete_competition', {
    p_code: '',
    p_competition_id: competitionId,
  });
  if (error) throw error;
  return (data ?? { success: false }) as { success: boolean; error?: string; name?: string };
}

export async function racingCanManageCompetition(competitionId: string): Promise<boolean> {
  const { data, error } = await db.rpc('racing_can_manage_competition', {
    p_competition_id: competitionId,
  });
  if (error) throw error;
  return !!data;
}
