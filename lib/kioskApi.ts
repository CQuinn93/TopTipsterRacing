import { supabase } from '@/lib/supabase';
import { lmsRequestJoin } from '@/lib/lms/api';
import { f2tRequestJoin } from '@/lib/f2t/api';
import { joinCompetitionWithAccessCode } from '@/lib/joinCompetitionWithAccessCode';
import type { KioskSport } from '@/lib/kioskSession';

const db = supabase as any;

export type KioskCompetitionOption = {
  id: string;
  name: string;
  sport: KioskSport;
  status: string;
  entry: string | null;
  fundraiser_payment_url: string | null;
  join_code: string | null;
};

export async function kioskCanSetup(): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  is_owner?: boolean;
  kiosk_licenses_count?: number;
  fundraiser_settings_allowed?: boolean;
}> {
  const { data, error } = await db.rpc('kiosk_can_setup');
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
    message?: string;
    is_owner?: boolean;
    kiosk_licenses_count?: number;
    fundraiser_settings_allowed?: boolean;
  };
}

export async function kioskListMyCompetitions(): Promise<KioskCompetitionOption[]> {
  const { data, error } = await db.rpc('kiosk_list_my_competitions');
  if (error) throw error;
  const row = (data ?? {}) as {
    success?: boolean;
    competitions?: KioskCompetitionOption[];
    error?: string;
  };
  if (!row.success) {
    throw new Error(row.error ?? 'Could not load competitions');
  }
  return Array.isArray(row.competitions) ? row.competitions : [];
}

export async function kioskSetFundraiserPaymentUrl(
  competitionId: string,
  sport: KioskSport,
  url: string
): Promise<{ success: boolean; error?: string; fundraiser_payment_url?: string | null }> {
  const { data, error } = await db.rpc('kiosk_set_fundraiser_payment_url', {
    p_competition_id: competitionId,
    p_sport: sport,
    p_url: url,
  });
  if (error) throw error;
  return (data ?? { success: false }) as {
    success: boolean;
    error?: string;
    fundraiser_payment_url?: string | null;
  };
}

export async function kioskSetJoinPaymentMethod(
  requestId: string,
  sport: KioskSport,
  paymentMethod: 'cash' | 'online',
  paymentNote?: string | null
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await db.rpc('kiosk_set_join_payment_method', {
    p_request_id: requestId,
    p_sport: sport,
    p_payment_method: paymentMethod,
    p_payment_note: paymentNote ?? null,
  });
  if (error) throw error;
  return (data ?? { success: false }) as { success: boolean; error?: string };
}

export async function kioskRequestJoin(params: {
  sport: KioskSport;
  joinCode: string;
  userId: string;
  displayName?: string;
}): Promise<{
  success: boolean;
  error?: string;
  join_request_id?: string;
  competition_id?: string;
  competition_name?: string;
  status?: string;
  already_in?: boolean;
}> {
  const code = params.joinCode.trim().toUpperCase();
  if (params.sport === 'lms') {
    const res = await lmsRequestJoin(code);
    return {
      success: !!res.success,
      error: res.error,
      join_request_id: res.join_request_id,
      competition_id: res.competition_id,
      competition_name: res.competition_name,
      status: res.status,
      already_in: res.error === 'already_in' || res.status === 'already_in',
    };
  }
  if (params.sport === 'f2t') {
    const res = await f2tRequestJoin(code);
    return {
      success: !!res.success,
      error: res.error,
      join_request_id: res.join_request_id,
      competition_id: res.competition_id,
      competition_name: res.competition_name,
      status: undefined,
      already_in: res.error === 'already_in',
    };
  }

  const displayName = (params.displayName ?? '').trim();
  if (!displayName) {
    return { success: false, error: 'display_name_required' };
  }

  const outcome = await joinCompetitionWithAccessCode({
    userId: params.userId,
    code,
    displayNameToUse: displayName,
  });

  if (outcome.kind === 'invalid_code') {
    return { success: false, error: 'invalid_code' };
  }
  if (outcome.kind === 'already_in') {
    return {
      success: false,
      error: 'already_in',
      competition_name: outcome.competitionName,
      already_in: true,
    };
  }
  if (outcome.kind === 'error') {
    return { success: false, error: outcome.message };
  }

  // Fetch pending request id so we can attach payment method.
  const { data: jr } = await db
    .from('competition_join_requests')
    .select('id, competition_id')
    .eq('user_id', params.userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    success: true,
    join_request_id: (jr as { id?: string } | null)?.id,
    competition_id: (jr as { competition_id?: string } | null)?.competition_id,
    competition_name: outcome.competitionName,
    status: 'pending',
  };
}
