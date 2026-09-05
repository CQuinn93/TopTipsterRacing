import { supabase } from '@/lib/supabase';

export type ParticipantTier = 'user' | 'user_plus' | 'user_premium';
export type CreatorTier = 'creator' | 'creator_plus' | 'creator_pro' | 'gamemaster';

export type SubscriptionSportKind = 'lms' | 'f2t' | 'racing';

export type SubscriptionUsageCompetition = {
  id: string;
  name: string;
  sport: SubscriptionSportKind;
  status: string;
  participantStatus?: string;
  countsTowardLimit: boolean;
};

export type SubscriptionEntitlements = {
  is_owner?: boolean;
  is_gamemaster?: boolean;
  club_setup_complete?: boolean;
  club_name?: string | null;
  club_logo_url?: string | null;
  club_payment_url?: string | null;
  participant_tier?: ParticipantTier;
  creator_tier?: CreatorTier | null;
  show_ads?: boolean;
  max_concurrent_joins?: number | null;
  max_concurrent_creates?: number | null;
  max_participants_per_competition?: number | null;
  max_aggregate_active_participants?: number | null;
  create_sport_scope?: 'single' | 'all' | null;
  fundraiser_settings_allowed?: boolean;
  kiosk_purchase_allowed?: boolean;
  kiosk_licenses_count?: number;
  lifetime_participant_tier?: ParticipantTier | null;
  lifetime_creator_tier?: CreatorTier | null;
  current_join_count?: number;
  current_eliminated_in_live_count?: number;
  current_create_count?: number;
  current_aggregate_participants?: number;
};

export const SUBSCRIPTION_ERROR_MESSAGES: Record<string, string> = {
  join_limit_reached:
    'You have reached your competition join limit. Upgrade to User Plus or User Premium in Account.',
  competition_full: 'This competition is full. Ask the organiser to upgrade their Creator plan.',
  aggregate_player_limit:
    'The organiser has reached their player limit across active competitions.',
  creator_subscription_required:
    'A Creator subscription is required to create competitions. See Account to upgrade.',
  create_limit_reached:
    'You have reached your active competition limit for your Creator plan.',
  single_sport_locked:
    'Your Creator plan is locked to one sport. Upgrade Creator Plus or Pro to run all sports.',
  gamemaster_cannot_join:
    'Gamemaster club accounts manage competitions and cannot join as a player.',
};

export function subscriptionErrorMessage(errorCode: string | undefined, fallback = 'Something went wrong.'): string {
  if (!errorCode) return fallback;
  return SUBSCRIPTION_ERROR_MESSAGES[errorCode] ?? fallback;
}

export async function fetchMyEntitlements(): Promise<SubscriptionEntitlements | null> {
  const { data, error } = await (supabase as any).rpc('get_my_entitlements');
  if (error) {
    console.warn('[subscription] get_my_entitlements failed', error.message);
    return null;
  }
  return (data as SubscriptionEntitlements) ?? null;
}

/** Signed-up count and competition quota (max_participants). */
export async function fetchCompetitionCapacity(
  mode: 'lms' | 'f2t' | 'racing',
  competitionId: string
): Promise<{ currentParticipants: number; maxParticipants: number | null }> {
  const { data, error } = await (supabase as any).rpc('subscription_check_competition_capacity', {
    p_mode: mode,
    p_competition_id: competitionId,
  });
  if (error) {
    console.warn('[subscription] competition capacity failed', error.message);
    return { currentParticipants: 0, maxParticipants: null };
  }
  const row = (data ?? {}) as {
    current_participants?: number | null;
    max_participants?: number | null;
  };
  return {
    currentParticipants: Number(row.current_participants ?? 0),
    maxParticipants:
      row.max_participants == null || Number.isNaN(Number(row.max_participants))
        ? null
        : Number(row.max_participants),
  };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatSubscriptionSportLabel(sport: SubscriptionSportKind): string {
  switch (sport) {
    case 'lms':
      return 'Football LMS';
    case 'f2t':
      return 'Football F2T';
    case 'racing':
      return 'Racing';
    default:
      return sport;
  }
}

function lmsCountsTowardLimit(participantStatus: string, competitionStatus: string): boolean {
  return participantStatus === 'active' && ['open', 'active'].includes(competitionStatus.toLowerCase());
}

function f2tCountsTowardLimit(participantStatus: string, competitionStatus: string): boolean {
  return participantStatus === 'active' && ['open', 'active'].includes(competitionStatus.toLowerCase());
}

function racingCountsTowardLimit(festivalEndDate: string): boolean {
  return festivalEndDate >= todayIsoDate();
}

export async function fetchMySubscriptionJoins(userId: string): Promise<SubscriptionUsageCompetition[]> {
  const [lmsRes, f2tRes, racingRes] = await Promise.all([
    supabase
      .from('lms_participants')
      .select('competition_id, status')
      .eq('user_id', userId)
      .in('status', ['active', 'eliminated', 'winner']),
    supabase
      .from('f2t_participants')
      .select('competition_id, status')
      .eq('user_id', userId)
      .in('status', ['active', 'winner']),
    supabase.from('competition_participants').select('competition_id').eq('user_id', userId),
  ]);

  const lmsByComp = new Map(
    (lmsRes.data ?? []).map((r) => [r.competition_id as string, r.status as string])
  );
  const f2tByComp = new Map(
    (f2tRes.data ?? []).map((r) => [r.competition_id as string, r.status as string])
  );
  const racingIds = (racingRes.data ?? []).map((r) => r.competition_id as string);

  const lmsIds = [...lmsByComp.keys()];
  const f2tIds = [...f2tByComp.keys()];

  const [lmsComps, f2tComps, racingComps] = await Promise.all([
    lmsIds.length
      ? supabase.from('lms_competitions').select('id, name, status').in('id', lmsIds)
      : Promise.resolve({ data: [] as { id: string; name: string; status: string }[] }),
    f2tIds.length
      ? supabase.from('f2t_competitions').select('id, name, status').in('id', f2tIds)
      : Promise.resolve({ data: [] as { id: string; name: string; status: string }[] }),
    racingIds.length
      ? supabase.from('competitions').select('id, name, festival_end_date').in('id', racingIds)
      : Promise.resolve({ data: [] as { id: string; name: string; festival_end_date: string }[] }),
  ]);

  const out: SubscriptionUsageCompetition[] = [];
  for (const c of lmsComps.data ?? []) {
    const participantStatus = lmsByComp.get(c.id) ?? 'active';
    out.push({
      id: c.id,
      name: c.name,
      sport: 'lms',
      status: c.status,
      participantStatus,
      countsTowardLimit: lmsCountsTowardLimit(participantStatus, c.status),
    });
  }
  for (const c of f2tComps.data ?? []) {
    const participantStatus = f2tByComp.get(c.id) ?? 'active';
    out.push({
      id: c.id,
      name: c.name,
      sport: 'f2t',
      status: c.status,
      participantStatus,
      countsTowardLimit: f2tCountsTowardLimit(participantStatus, c.status),
    });
  }
  for (const c of racingComps.data ?? []) {
    out.push({
      id: c.id,
      name: c.name,
      sport: 'racing',
      status: c.festival_end_date >= todayIsoDate() ? 'live' : 'complete',
      countsTowardLimit: racingCountsTowardLimit(c.festival_end_date),
    });
  }

  out.sort((a, b) => {
    if (a.countsTowardLimit !== b.countsTowardLimit) return a.countsTowardLimit ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return out;
}

export async function fetchMySubscriptionCreatedCompetitions(
  userId: string
): Promise<SubscriptionUsageCompetition[]> {
  const today = todayIsoDate();
  const [lmsRes, f2tRes, racingRes] = await Promise.all([
    supabase
      .from('lms_competitions')
      .select('id, name, status')
      .eq('created_by_user_id', userId)
      .in('status', ['open', 'active']),
    supabase
      .from('f2t_competitions')
      .select('id, name, status')
      .eq('created_by_user_id', userId)
      .in('status', ['open', 'active']),
    supabase
      .from('competitions')
      .select('id, name, festival_end_date')
      .eq('created_by_user_id', userId)
      .gte('festival_end_date', today),
  ]);

  const out: SubscriptionUsageCompetition[] = [];
  for (const c of lmsRes.data ?? []) {
    out.push({ id: c.id, name: c.name, sport: 'lms', status: c.status });
  }
  for (const c of f2tRes.data ?? []) {
    out.push({ id: c.id, name: c.name, sport: 'f2t', status: c.status });
  }
  for (const c of racingRes.data ?? []) {
    out.push({
      id: c.id,
      name: c.name,
      sport: 'racing',
      status: c.festival_end_date >= today ? 'live' : 'complete',
    });
  }

  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

export function hasCreatorEntitlement(ent: SubscriptionEntitlements | null | undefined): boolean {
  if (!ent) return false;
  if (ent.is_owner) return true;
  return !!ent.creator_tier || !!ent.lifetime_creator_tier;
}

export function isGamemasterAccount(ent: SubscriptionEntitlements | null | undefined): boolean {
  if (!ent || ent.is_owner) return false;
  return ent.is_gamemaster === true || ent.creator_tier === 'gamemaster' || ent.lifetime_creator_tier === 'gamemaster';
}

export function needsGamemasterClubSetup(ent: SubscriptionEntitlements | null | undefined): boolean {
  return isGamemasterAccount(ent) && ent?.club_setup_complete === false;
}

export async function gamemasterCompleteSetup(params: {
  clubName: string;
  clubLogoUrl?: string | null;
  clubPaymentUrl?: string | null;
}): Promise<{
  success: boolean;
  error?: string;
  club_name?: string;
  club_logo_url?: string | null;
  club_payment_url?: string | null;
}> {
  const { data, error } = await (supabase as any).rpc('gamemaster_complete_setup', {
    p_club_name: params.clubName,
    p_club_logo_url: params.clubLogoUrl ?? null,
    p_club_payment_url: params.clubPaymentUrl ?? null,
  });
  if (error) throw error;
  return (data ?? { success: false, error: 'unknown' }) as {
    success: boolean;
    error?: string;
    club_name?: string;
    club_logo_url?: string | null;
    club_payment_url?: string | null;
  };
}

export function participantTierLabel(ent: SubscriptionEntitlements | null | undefined): string {
  if (!ent) return 'User';
  if (ent.lifetime_participant_tier === 'user_premium') return 'Lifetime User Premium';
  if (ent.lifetime_creator_tier) return `Lifetime ${formatCreatorTier(ent.lifetime_creator_tier)}`;
  if (ent.participant_tier === 'user_premium') return 'User Premium';
  if (ent.participant_tier === 'user_plus') return 'User Plus';
  return 'User';
}

export function formatCreatorTier(tier: CreatorTier): string {
  switch (tier) {
    case 'creator':
      return 'Creator';
    case 'creator_plus':
      return 'Creator Plus';
    case 'creator_pro':
      return 'Creator Pro';
    case 'gamemaster':
      return 'Gamemaster';
    default:
      return tier;
  }
}
