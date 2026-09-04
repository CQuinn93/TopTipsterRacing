import { getSupabaseUrl, supabase } from '@/lib/supabase';
import type { LeagueBillInput } from '@/lib/gamemasterCustomPricing';
import type { GamemasterQuote, GamemasterQuoteStatus } from '@/lib/gamemasterApi';

export type OwnerUserRow = {
  id: string;
  username: string | null;
  email?: string | null;
  role: 'User' | 'Admin' | 'Owner';
  created_at: string;
  updated_at?: string;
  banned_at?: string | null;
  banned_by?: string | null;
};

export type OwnerCompetitionRow = {
  sport: 'racing' | 'lms' | 'f2t';
  id: string;
  name: string;
  status: string;
  join_code: string | null;
  rejoin_code?: string | null;
  festival_start_date?: string | null;
  festival_end_date?: string | null;
  season?: string | null;
  created_at?: string | null;
  creator_username?: string | null;
  participant_count?: number;
  active_count?: number;
};

const db = supabase as any;

export async function ownerListUsers(): Promise<OwnerUserRow[]> {
  const { data, error } = await db.rpc('owner_list_users');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as OwnerUserRow[];
}

export async function ownerListCompetitions(): Promise<OwnerCompetitionRow[]> {
  const { data, error } = await db.rpc('owner_list_competitions');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as OwnerCompetitionRow[];
}

export async function ownerSetUserRole(
  userId: string,
  role: 'User' | 'Admin'
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await db.rpc('owner_set_user_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
  };
}

export async function ownerSetUserBanned(
  userId: string,
  banned: boolean
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await db.rpc('owner_set_user_banned', {
    p_user_id: userId,
    p_banned: banned,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
  };
}

/** Permanently delete a user (Owner only). Uses the owner-delete-user edge function. */
export async function ownerDeleteUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { success: false, error: 'not_signed_in' };

  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
  const url = `${getSupabaseUrl()}/functions/v1/owner-delete-user`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ user_id: userId }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; success?: boolean };
  if (!res.ok) {
    return { success: false, error: body.error ?? 'delete_failed' };
  }
  return { success: true };
}

export async function ownerRegisterGamemaster(params: {
  userId: string;
  clubName?: string;
  clubLogoUrl?: string | null;
  kioskLicenses?: number;
  quote?: {
    payload: LeagueBillInput;
    season_total: number;
    hub_deposit_total: number;
    hub_monthly_total: number;
    due_today: number;
    assumed_season_weeks: number;
  };
}): Promise<{
  success: boolean;
  error?: string;
  club_name?: string;
  club_logo_url?: string | null;
}> {
  const { data, error } = await db.rpc('owner_register_gamemaster', {
    p_user_id: params.userId,
    p_club_name: params.clubName ?? null,
    p_club_logo_url: params.clubLogoUrl ?? null,
    p_kiosk_licenses: params.kioskLicenses ?? 1,
    p_quote: params.quote ?? null,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
    club_name?: string;
    club_logo_url?: string | null;
  };
}

export async function isCurrentUserBanned(): Promise<boolean> {
  const { data, error } = await db.rpc('is_profile_banned');
  if (error) throw error;
  return Boolean(data);
}

export type OwnerGamemasterListRow = {
  id: string;
  username: string | null;
  email: string | null;
  club_name: string | null;
  club_logo_url: string | null;
  club_payment_url: string | null;
  club_setup_complete: boolean;
  kiosk_licenses_count: number;
  created_at: string;
  banned_at: string | null;
  request_count: number;
  current_count: number;
};

export type OwnerGamemasterProfile = {
  id: string;
  username: string | null;
  email: string | null;
  club_name: string | null;
  club_logo_url: string | null;
  club_payment_url: string | null;
  club_setup_complete: boolean;
  kiosk_licenses_count: number;
  created_at: string;
  banned_at: string | null;
  lifetime_creator_tier: string | null;
};

export type OwnerGamemasterCompetitionRow = {
  sport: 'lms' | 'f2t' | 'racing';
  id: string;
  name: string;
  status: string;
  join_code: string | null;
  participant_count: number;
  active_count: number;
};

export type OwnerGamemasterAccount = {
  success: boolean;
  error?: string;
  profile?: OwnerGamemasterProfile;
  quotes?: GamemasterQuote[];
  competitions?: OwnerGamemasterCompetitionRow[];
};

export async function ownerListGamemasters(): Promise<OwnerGamemasterListRow[]> {
  const { data, error } = await db.rpc('owner_list_gamemasters');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as OwnerGamemasterListRow[];
}

export async function ownerGetGamemasterAccount(
  userId: string
): Promise<OwnerGamemasterAccount> {
  const { data, error } = await db.rpc('owner_get_gamemaster_account', {
    p_user_id: userId,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as OwnerGamemasterAccount;
}

export async function ownerIssueGamemasterQuote(
  quoteId: string,
  totals?: Partial<{
    season_total: number;
    hub_deposit_total: number;
    hub_monthly_total: number;
    due_today: number;
    assumed_season_weeks: number;
  }>
): Promise<{ success: boolean; error?: string; quote?: GamemasterQuote }> {
  const { data, error } = await db.rpc('owner_issue_gamemaster_quote', {
    p_quote_id: quoteId,
    p_totals: totals ?? null,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
    quote?: GamemasterQuote;
  };
}

export async function ownerSetGamemasterQuoteStatus(
  quoteId: string,
  status: Exclude<GamemasterQuoteStatus, 'requested'>
): Promise<{ success: boolean; error?: string; quote?: GamemasterQuote }> {
  const { data, error } = await db.rpc('owner_set_gamemaster_quote_status', {
    p_quote_id: quoteId,
    p_status: status,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
    quote?: GamemasterQuote;
  };
}
