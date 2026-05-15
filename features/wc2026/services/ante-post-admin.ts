import { supabase } from '@/lib/supabase';

import { parseRpcArray } from '@/features/wc2026/services/football-competitions';
import type { WcLeaderboardPredictionRow } from '@/features/wc2026/services/football-leaderboard';
import { wcFootballUserCompetitionPredictions } from '@/features/wc2026/services/football-leaderboard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (supabase as any).rpc.bind(supabase);

export type AntePostLockStatus = {
  locked: boolean;
  submitted: boolean;
  adminReopened: boolean;
  submittedAt: string | null;
};

export type WcAntePostEntrantRow = {
  user_id: string;
  username: string;
  ante_prediction_count: number;
  submitted: boolean;
  submitted_at: string | null;
  admin_reopened: boolean;
  locked: boolean;
  reopen_note: string | null;
};

export async function fetchAntePostLockStatusFromServer(userId?: string | null): Promise<AntePostLockStatus> {
  const fallback: AntePostLockStatus = {
    locked: false,
    submitted: false,
    adminReopened: false,
    submittedAt: null,
  };
  try {
    const { data, error } = await rpc('wc_ante_post_lock_status', {
      p_user_id: userId ?? null,
    });
    if (error) return fallback;
    const row = data as {
      success?: boolean;
      locked?: boolean;
      submitted?: boolean;
      admin_reopened?: boolean;
      submitted_at?: string | null;
    };
    if (row?.success === false) return fallback;
    return {
      locked: Boolean(row?.locked),
      submitted: Boolean(row?.submitted),
      adminReopened: Boolean(row?.admin_reopened),
      submittedAt: row?.submitted_at != null ? String(row.submitted_at) : null,
    };
  } catch {
    return fallback;
  }
}

export async function markAntePostSubmittedOnServer(): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await rpc('wc_ante_post_mark_submitted');
  if (error) return { success: false, error: error.message };
  const row = data as { success?: boolean; error?: string };
  if (!row?.success) return { success: false, error: row?.error ?? 'mark_failed' };
  return { success: true };
}

export async function wcAdminListAntePostEntrants(
  competitionId: string,
  search = ''
): Promise<WcAntePostEntrantRow[]> {
  const { data, error } = await rpc('wc_admin_list_ante_post_entrants', {
    p_competition_id: competitionId,
    p_search: search.trim(),
  });
  if (error) throw new Error(error.message);
  return parseRpcArray(data).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      user_id: String(row.user_id ?? ''),
      username: String(row.username ?? 'Unknown'),
      ante_prediction_count: Number(row.ante_prediction_count ?? 0),
      submitted: Boolean(row.submitted),
      submitted_at: row.submitted_at != null ? String(row.submitted_at) : null,
      admin_reopened: Boolean(row.admin_reopened),
      locked: Boolean(row.locked),
      reopen_note: row.reopen_note != null ? String(row.reopen_note) : null,
    };
  });
}

export async function wcAdminSetAntePostReopen(
  targetUserId: string,
  reopen: boolean,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await rpc('wc_admin_set_ante_post_reopen', {
    p_target_user_id: targetUserId,
    p_reopen: reopen,
    p_note: note ?? null,
  });
  if (error) return { success: false, error: error.message };
  const row = data as { success?: boolean; error?: string };
  if (!row?.success) return { success: false, error: row?.error ?? 'reopen_failed' };
  return { success: true };
}

export async function wcAdminUpsertAntePostPrediction(
  targetUserId: string,
  matchNumber: number,
  homeScore: number,
  awayScore: number,
  predictedWinnerId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await rpc('wc_admin_upsert_ante_post_prediction', {
    p_target_user_id: targetUserId,
    p_match_number: matchNumber,
    p_home_score: homeScore,
    p_away_score: awayScore,
    p_predicted_winner_id: predictedWinnerId ?? null,
  });
  if (error) return { success: false, error: error.message };
  const row = data as { success?: boolean; error?: string };
  if (!row?.success) return { success: false, error: row?.error ?? 'upsert_failed' };
  return { success: true };
}

export async function wcAdminFetchUserAntePostPredictions(
  competitionId: string,
  userId: string
): Promise<WcLeaderboardPredictionRow[]> {
  const all = await wcFootballUserCompetitionPredictions(competitionId, userId);
  return all.filter((p) => p.prediction_type === 'ante_post');
}
