import { supabase } from '@/lib/supabase';

export type ParticipantTier = 'user' | 'user_plus' | 'user_premium';
export type CreatorTier = 'creator' | 'creator_plus' | 'creator_pro' | 'gamemaster';

export type SubscriptionEntitlements = {
  is_owner?: boolean;
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
    'Your Creator plan only allows competitions in one sport at a time. Finish or remove other sport competitions first.',
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

export function hasCreatorEntitlement(ent: SubscriptionEntitlements | null | undefined): boolean {
  if (!ent) return false;
  if (ent.is_owner) return true;
  return !!ent.creator_tier || !!ent.lifetime_creator_tier;
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
