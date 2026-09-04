-- Fix CASE type mismatch in effective_entitlements:
-- branch "when v_creator = 'gamemaster' then 0" returned integer while
-- else returned jsonb (v_plimits->'max_concurrent_joins'), causing:
--   42804 CASE types jsonb and integer cannot be matched
-- on get_my_entitlements().

create or replace function public.effective_entitlements(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_participant public.participant_tier;
  v_creator public.creator_tier;
  v_plimits jsonb;
  v_climits jsonb;
  v_is_owner boolean;
  v_kiosk_count int;
  v_club_setup boolean := false;
  v_club_name text;
  v_club_logo text;
  v_club_pay text;
begin
  if p_user_id is null then
    return jsonb_build_object('error', 'no_user');
  end if;

  v_is_owner := exists (select 1 from public.profiles where id = p_user_id and role = 'Owner');
  v_participant := public.subscription_effective_participant_tier(p_user_id);
  v_creator := public.subscription_effective_creator_tier(p_user_id);
  v_plimits := public.subscription_participant_limits(v_participant);
  v_climits := public.subscription_creator_limits(v_creator);

  select count(*)::int into v_kiosk_count
  from public.kiosk_licenses
  where user_id = p_user_id and revoked_at is null;

  select
    coalesce(club_setup_complete, false),
    club_name,
    club_logo_url,
    club_payment_url
  into v_club_setup, v_club_name, v_club_logo, v_club_pay
  from public.profiles
  where id = p_user_id;

  return jsonb_build_object(
    'is_owner', v_is_owner,
    'is_gamemaster', v_creator = 'gamemaster' and not v_is_owner,
    'club_setup_complete', case
      when v_is_owner then true
      when v_creator = 'gamemaster' then v_club_setup
      else true
    end,
    'club_name', v_club_name,
    'club_logo_url', v_club_logo,
    'club_payment_url', v_club_pay,
    'participant_tier', v_participant::text,
    'creator_tier', coalesce(v_creator::text, null),
    'show_ads', case when v_is_owner then false else (v_plimits->>'show_ads')::boolean end,
    'max_concurrent_joins', case
      when v_is_owner then null
      when v_creator = 'gamemaster' then '0'::jsonb
      else v_plimits->'max_concurrent_joins'
    end,
    'max_concurrent_creates', case
      when v_is_owner then null
      when v_climits is null then null
      else v_climits->'max_concurrent_creates'
    end,
    'max_participants_per_competition', case
      when v_is_owner then null
      when v_climits is null then null
      else v_climits->'max_participants_per_competition'
    end,
    'max_aggregate_active_participants', case
      when v_is_owner then null
      when v_climits is null then null
      else v_climits->'max_aggregate_active_participants'
    end,
    'create_sport_scope', case
      when v_is_owner then 'all'
      when v_climits is null then null
      else v_climits->>'create_sport_scope'
    end,
    'fundraiser_settings_allowed', v_creator = 'gamemaster' or v_is_owner,
    'kiosk_purchase_allowed', v_creator = 'gamemaster' or v_is_owner,
    'kiosk_licenses_count', v_kiosk_count,
    'lifetime_participant_tier', (select lifetime_participant_tier::text from public.profiles where id = p_user_id),
    'lifetime_creator_tier', (select lifetime_creator_tier::text from public.profiles where id = p_user_id),
    'current_join_count', public.subscription_count_user_joins(p_user_id),
    'current_eliminated_in_live_count', public.subscription_count_user_eliminated_in_live(p_user_id),
    'current_create_count', public.subscription_creator_active_competition_count(p_user_id, null),
    'current_aggregate_participants', public.subscription_creator_aggregate_participants(p_user_id)
  );
end;
$$;

-- Also patch the source in 113 so fresh installs don't reintroduce the bug.
-- (113 already applied on this project; this migration is the live fix.)
