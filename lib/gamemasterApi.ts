import { supabase } from '@/lib/supabase';
import type { LeagueBillInput } from '@/lib/gamemasterCustomPricing';

export type GamemasterQuoteKind = 'onboarding' | 'request';
export type GamemasterQuoteStatus =
  | 'requested'
  | 'pending_payment'
  | 'paid_active'
  | 'paid_complete';

export type GamemasterQuote = {
  id: string;
  user_id: string;
  kind: GamemasterQuoteKind;
  status: GamemasterQuoteStatus;
  payload: LeagueBillInput;
  season_total: number | null;
  hub_deposit_total: number | null;
  hub_monthly_total: number | null;
  due_today: number | null;
  assumed_season_weeks: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  issued_at: string | null;
  paid_at: string | null;
  completed_at: string | null;
};

type GamemasterListMyQuotesRes = {
  success: boolean;
  quotes: GamemasterQuote[];
  error?: string;
};

const db = supabase as any;

export async function gamemasterRequestQuote(
  payload: LeagueBillInput
): Promise<{ success: boolean; error?: string; quote?: GamemasterQuote }> {
  const { data, error } = await db.rpc('gamemaster_request_quote', {
    p_payload: payload,
  });
  if (error) throw error;
  const res = (data ?? { success: false }) as {
    success: boolean;
    error?: string;
    quote?: GamemasterQuote;
  };
  return res;
}

export async function gamemasterListMyQuotes(): Promise<GamemasterQuote[]> {
  const { data, error } = await db.rpc('gamemaster_list_my_quotes');
  if (error) throw error;
  const res = (data ?? { success: false, quotes: [] }) as GamemasterListMyQuotesRes;
  return Array.isArray(res.quotes) ? res.quotes : [];
}

export async function gamemasterRespondToQuote(params: {
  quoteId: string;
  action: 'accept' | 'request_edit';
  notes?: string | null;
}): Promise<{ success: boolean; error?: string; quote?: GamemasterQuote }> {
  const { data, error } = await db.rpc('gamemaster_respond_to_quote', {
    p_quote_id: params.quoteId,
    p_action: params.action,
    p_notes: params.notes ?? null,
  });
  if (error) throw error;
  return (data ?? { success: false }) as {
    success: boolean;
    error?: string;
    quote?: GamemasterQuote;
  };
}

/** Re-run provisioning for the Gamemaster's own paid_active quote (owner/repair). */
export async function gamemasterProvisionMyQuote(quoteId: string): Promise<{
  success: boolean;
  error?: string;
  created?: unknown[];
  skipped?: boolean;
  existing_count?: number;
}> {
  const { data, error } = await db.rpc('gamemaster_provision_quote_competitions', {
    p_quote_id: quoteId,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
    created?: unknown[];
    skipped?: boolean;
    existing_count?: number;
  };
}

export type GamemasterCreateCreditsRes = {
  success: boolean;
  error?: string;
  total_remaining?: number;
  modes?: {
    mode: string;
    label: string;
    quoted: number;
    used: number;
    remaining: number;
    quote_id: string | null;
  }[];
};

/** Remaining create slots by competition type (from paid_active quotes). */
export async function gamemasterListCreateCredits(): Promise<GamemasterCreateCreditsRes> {
  const { data, error } = await db.rpc('gamemaster_list_create_credits');
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as GamemasterCreateCreditsRes;
}

