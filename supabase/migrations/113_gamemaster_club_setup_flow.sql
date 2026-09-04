-- Gamemaster self-serve club setup after Owner promotion.

alter table public.profiles
  add column if not exists club_setup_complete boolean not null default false,
  add column if not exists club_payment_url text;

comment on column public.profiles.club_setup_complete is
  'True after Gamemaster finishes first-login club branding setup.';
comment on column public.profiles.club_payment_url is
  'External club payment / charity link (not processed in-app).';

-- Anyone already branded as gamemaster is treated as setup-complete.
update public.profiles
set club_setup_complete = true
where lifetime_creator_tier = 'gamemaster'
  and nullif(trim(club_name), '') is not null
  and club_setup_complete = false;

-- Owner promotes a free user → pending setup (no club details required).
drop function if exists public.owner_register_gamemaster(uuid, text, text, int);

create or replace function public.owner_register_gamemaster(
  p_user_id uuid,
  p_club_name text default null,
  p_club_logo_url text default null,
  p_kiosk_licenses int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_licenses int := greatest(coalesce(p_kiosk_licenses, 1), 1);
  v_i int;
  v_have int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_required');
  end if;

  select role into v_role from public.profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  if v_role = 'Owner' then
    return jsonb_build_object('success', false, 'error', 'cannot_convert_owner');
  end if;

  update public.profiles
  set
    lifetime_creator_tier = 'gamemaster',
    club_setup_complete = false,
    club_name = nullif(trim(coalesce(p_club_name, '')), ''),
    club_logo_url = nullif(trim(coalesce(p_club_logo_url, '')), ''),
    club_payment_url = null,
    kiosk_licenses_count = greatest(coalesce(kiosk_licenses_count, 0), v_licenses),
    updated_at = now()
  where id = p_user_id;

  select count(*)::int into v_have
  from public.kiosk_licenses
  where user_id = p_user_id and revoked_at is null;

  for v_i in 1..(v_licenses - coalesce(v_have, 0)) loop
    insert into public.kiosk_licenses (user_id) values (p_user_id);
  end loop;

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'creator_tier', 'gamemaster',
    'club_setup_complete', false,
    'kiosk_licenses', v_licenses
  );
end;
$$;

revoke all on function public.owner_register_gamemaster(uuid, text, text, int) from public;
grant execute on function public.owner_register_gamemaster(uuid, text, text, int) to authenticated;

-- Gamemaster completes club branding (any device).
create or replace function public.gamemaster_complete_setup(
  p_club_name text,
  p_club_logo_url text default null,
  p_club_payment_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator public.creator_tier;
  v_club text := nullif(trim(p_club_name), '');
  v_logo text := nullif(trim(p_club_logo_url), '');
  v_pay text := nullif(trim(p_club_payment_url), '');
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  v_creator := public.subscription_effective_creator_tier(v_uid);
  if v_creator is distinct from 'gamemaster' and not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'not_gamemaster');
  end if;

  if v_club is null then
    return jsonb_build_object('success', false, 'error', 'club_name_required');
  end if;

  if v_logo is null then
    return jsonb_build_object('success', false, 'error', 'club_logo_required');
  end if;

  if v_logo !~* '^https?://' then
    return jsonb_build_object('success', false, 'error', 'invalid_logo_url');
  end if;

  if v_pay is not null and v_pay !~* '^https?://' then
    return jsonb_build_object('success', false, 'error', 'invalid_payment_url');
  end if;

  update public.profiles
  set
    club_name = v_club,
    club_logo_url = v_logo,
    club_payment_url = v_pay,
    club_setup_complete = true,
    updated_at = now()
  where id = v_uid;

  return jsonb_build_object(
    'success', true,
    'club_name', v_club,
    'club_logo_url', v_logo,
    'club_payment_url', v_pay,
    'club_setup_complete', true
  );
end;
$$;

revoke all on function public.gamemaster_complete_setup(text, text, text) from public;
grant execute on function public.gamemaster_complete_setup(text, text, text) to authenticated;

-- Block Gamemasters from joining player competitions.
create or replace function public.subscription_check_user_join_limit(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ent jsonb;
  v_max int;
  v_count int;
  v_creator public.creator_tier;
begin
  if exists (select 1 from public.profiles where id = p_user_id and role = 'Owner') then
    return jsonb_build_object('ok', true);
  end if;

  v_creator := public.subscription_effective_creator_tier(p_user_id);
  if v_creator = 'gamemaster' then
    return jsonb_build_object(
      'ok', false,
      'error', 'gamemaster_cannot_join',
      'message', 'Gamemaster club accounts manage competitions and cannot join as a player.'
    );
  end if;

  v_ent := public.effective_entitlements(p_user_id);
  v_max := (v_ent->>'max_concurrent_joins')::int;
  if v_max is null then
    return jsonb_build_object('ok', true);
  end if;

  v_count := public.subscription_count_user_joins(p_user_id);
  if v_count >= v_max then
    return jsonb_build_object(
      'ok', false,
      'error', 'join_limit_reached',
      'max_joins', v_max,
      'current_joins', v_count,
      'participant_tier', v_ent->>'participant_tier'
    );
  end if;

  return jsonb_build_object('ok', true, 'current_joins', v_count, 'max_joins', v_max);
end;
$$;

-- Entitlements expose setup flag for client routing.
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
