-- Subscription tiers, entitlements, caps (Phase A).
-- Participant: User (2 joins, ads) | User Plus €0.99 (5, no ads) | User Premium €1.99 (unlimited).
-- Creator: €3.99 / €4.99 / €9.99 / €19.99 with sport-scoped create limits + per-comp + aggregate caps.

-- ---------------------------------------------------------------------------
-- 1) Enums + profile columns
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.participant_tier as enum ('user', 'user_plus', 'user_premium');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.creator_tier as enum (
    'creator', 'creator_plus', 'creator_pro', 'gamemaster'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.sport_category as enum ('football', 'racing', 'other');
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists participant_tier public.participant_tier not null default 'user',
  add column if not exists creator_tier public.creator_tier,
  add column if not exists lifetime_participant_tier public.participant_tier,
  add column if not exists lifetime_creator_tier public.creator_tier,
  add column if not exists play_for_fun_disclaimer_accepted_at timestamptz,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists subscription_period_end timestamptz;

comment on column public.profiles.participant_tier is 'Paid participant subscription tier (Stripe).';
comment on column public.profiles.creator_tier is 'Paid creator subscription tier (Stripe).';
comment on column public.profiles.lifetime_participant_tier is 'Grandfathered participant tier (e.g. lifetime Premium).';
comment on column public.profiles.lifetime_creator_tier is 'Grandfathered creator tier (e.g. lifetime Creator).';

-- Grandfather existing accounts
update public.profiles
set lifetime_participant_tier = 'user_premium'
where role = 'User'
  and lifetime_participant_tier is null;

update public.profiles
set lifetime_creator_tier = 'creator'
where role = 'Admin'
  and lifetime_creator_tier is null;

-- ---------------------------------------------------------------------------
-- 2) Competition columns + kiosk licenses
-- ---------------------------------------------------------------------------

alter table public.lms_competitions
  add column if not exists sport_category public.sport_category not null default 'football',
  add column if not exists max_participants int not null default 30;

alter table public.f2t_competitions
  add column if not exists sport_category public.sport_category not null default 'football',
  add column if not exists max_participants int not null default 30;

alter table public.competitions
  add column if not exists sport_category public.sport_category not null default 'racing',
  add column if not exists max_participants int not null default 30;

create table if not exists public.kiosk_licenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Kiosk',
  stripe_payment_id text,
  activated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists kiosk_licenses_user_idx on public.kiosk_licenses (user_id);

alter table public.kiosk_licenses enable row level security;

drop policy if exists "kiosk_licenses_select_own" on public.kiosk_licenses;
create policy "kiosk_licenses_select_own"
  on public.kiosk_licenses for select to authenticated
  using (user_id = auth.uid() or public.is_owner());

-- ---------------------------------------------------------------------------
-- 3) Tier limit helpers
-- ---------------------------------------------------------------------------

create or replace function public.subscription_tier_rank(p_tier public.participant_tier)
returns int
language sql
immutable
as $$
  select case p_tier
    when 'user' then 0
    when 'user_plus' then 1
    when 'user_premium' then 2
    else 0
  end;
$$;

create or replace function public.subscription_effective_participant_tier(p_user_id uuid)
returns public.participant_tier
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lifetime public.participant_tier;
  v_lifetime_creator public.creator_tier;
  v_paid public.participant_tier;
  v_creator public.creator_tier;
  v_bundled public.participant_tier := 'user';
  v_best public.participant_tier := 'user';
begin
  if p_user_id is null then
    return 'user';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and role = 'Owner') then
    return 'user_premium';
  end if;

  select lifetime_participant_tier, lifetime_creator_tier, participant_tier, creator_tier
  into v_lifetime, v_lifetime_creator, v_paid, v_creator
  from public.profiles
  where id = p_user_id;

  if v_creator in ('creator_pro', 'gamemaster') then
    v_bundled := 'user_premium';
  elsif v_creator in ('creator', 'creator_plus') then
    v_bundled := 'user_plus';
  elsif v_lifetime_creator in ('creator_pro', 'gamemaster') then
    v_bundled := 'user_premium';
  elsif v_lifetime_creator in ('creator', 'creator_plus') then
    v_bundled := 'user_plus';
  end if;

  v_best := 'user';
  if public.subscription_tier_rank(coalesce(v_lifetime, 'user')) > public.subscription_tier_rank(v_best) then
    v_best := v_lifetime;
  end if;
  if public.subscription_tier_rank(coalesce(v_paid, 'user')) > public.subscription_tier_rank(v_best) then
    v_best := v_paid;
  end if;
  if public.subscription_tier_rank(v_bundled) > public.subscription_tier_rank(v_best) then
    v_best := v_bundled;
  end if;

  return v_best;
end;
$$;

create or replace function public.subscription_effective_creator_tier(p_user_id uuid)
returns public.creator_tier
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lifetime public.creator_tier;
  v_paid public.creator_tier;
begin
  if p_user_id is null then
    return null;
  end if;

  select lifetime_creator_tier, creator_tier
  into v_lifetime, v_paid
  from public.profiles
  where id = p_user_id;

  -- Higher tier wins if both set (should not happen often)
  if v_lifetime is not null and v_paid is not null then
    return case
      when v_lifetime = 'gamemaster' or v_paid = 'gamemaster' then 'gamemaster'
      when v_lifetime = 'creator_pro' or v_paid = 'creator_pro' then 'creator_pro'
      when v_lifetime = 'creator_plus' or v_paid = 'creator_plus' then 'creator_plus'
      else 'creator'
    end;
  end if;

  return coalesce(v_paid, v_lifetime);
end;
$$;

create or replace function public.subscription_has_creator_entitlement(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return false;
  end if;
  if exists (select 1 from public.profiles where id = p_user_id and role = 'Owner') then
    return true;
  end if;
  return public.subscription_effective_creator_tier(p_user_id) is not null;
end;
$$;

create or replace function public.subscription_creator_limits(p_tier public.creator_tier)
returns jsonb
language sql
immutable
as $$
  select case p_tier
    when 'creator' then jsonb_build_object(
      'max_concurrent_creates', 2,
      'max_participants_per_competition', 30,
      'max_aggregate_active_participants', 50,
      'create_sport_scope', 'single'
    )
    when 'creator_plus' then jsonb_build_object(
      'max_concurrent_creates', 5,
      'max_participants_per_competition', 50,
      'max_aggregate_active_participants', 150,
      'create_sport_scope', 'single'
    )
    when 'creator_pro' then jsonb_build_object(
      'max_concurrent_creates', 10,
      'max_participants_per_competition', 75,
      'max_aggregate_active_participants', 350,
      'create_sport_scope', 'all'
    )
    when 'gamemaster' then jsonb_build_object(
      'max_concurrent_creates', 12,
      'max_participants_per_competition', 100,
      'max_aggregate_active_participants', 600,
      'create_sport_scope', 'all'
    )
    else null
  end;
$$;

create or replace function public.subscription_participant_limits(p_tier public.participant_tier)
returns jsonb
language sql
immutable
as $$
  select case p_tier
    when 'user' then jsonb_build_object('max_concurrent_joins', 2, 'show_ads', true)
    when 'user_plus' then jsonb_build_object('max_concurrent_joins', 5, 'show_ads', false)
    when 'user_premium' then jsonb_build_object('max_concurrent_joins', null, 'show_ads', false)
    else jsonb_build_object('max_concurrent_joins', 2, 'show_ads', true)
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Usage counters
-- ---------------------------------------------------------------------------

create or replace function public.subscription_count_user_joins(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*)::int from public.lms_participants lp
      where lp.user_id = p_user_id and lp.status in ('active', 'winner'))
    + (select count(*)::int from public.f2t_participants fp
      where fp.user_id = p_user_id and fp.status in ('active', 'winner'))
    + (select count(*)::int from public.competition_participants cp
      where cp.user_id = p_user_id)
  );
$$;

create or replace function public.subscription_lms_competition_participant_count(p_competition_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.lms_participants
  where competition_id = p_competition_id
    and status in ('active', 'eliminated', 'winner');
$$;

create or replace function public.subscription_f2t_competition_participant_count(p_competition_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.f2t_participants
  where competition_id = p_competition_id
    and status in ('active', 'eliminated', 'winner');
$$;

create or replace function public.subscription_racing_competition_participant_count(p_competition_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.competition_participants
  where competition_id = p_competition_id;
$$;

create or replace function public.subscription_creator_active_competition_count(
  p_user_id uuid,
  p_sport public.sport_category default null
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*)::int from public.lms_competitions c
      where c.created_by_user_id = p_user_id
        and c.status in ('open', 'active')
        and (p_sport is null or c.sport_category = p_sport))
    + (select count(*)::int from public.f2t_competitions c
      where c.created_by_user_id = p_user_id
        and c.status in ('open', 'active')
        and (p_sport is null or c.sport_category = p_sport))
    + (select count(*)::int from public.competitions c
      where c.created_by_user_id = p_user_id
        and c.festival_end_date >= current_date
        and (p_sport is null or c.sport_category = p_sport))
  );
$$;

create or replace function public.subscription_creator_aggregate_participants(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select coalesce(sum(public.subscription_lms_competition_participant_count(c.id)), 0)::int
      from public.lms_competitions c
      where c.created_by_user_id = p_user_id and c.status in ('open', 'active'))
    + (select coalesce(sum(public.subscription_f2t_competition_participant_count(c.id)), 0)::int
      from public.f2t_competitions c
      where c.created_by_user_id = p_user_id and c.status in ('open', 'active'))
    + (select coalesce(sum(public.subscription_racing_competition_participant_count(c.id)), 0)::int
      from public.competitions c
      where c.created_by_user_id = p_user_id and c.festival_end_date >= current_date)
  );
$$;

create or replace function public.subscription_creator_has_other_sport_active(
  p_user_id uuid,
  p_sport public.sport_category
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lms_competitions c
    where c.created_by_user_id = p_user_id
      and c.status in ('open', 'active')
      and c.sport_category <> p_sport
  )
  or exists (
    select 1 from public.f2t_competitions c
    where c.created_by_user_id = p_user_id
      and c.status in ('open', 'active')
      and c.sport_category <> p_sport
  )
  or exists (
    select 1 from public.competitions c
    where c.created_by_user_id = p_user_id
      and c.festival_end_date >= current_date
      and c.sport_category <> p_sport
  );
$$;

-- ---------------------------------------------------------------------------
-- 5) effective_entitlements + get_my_entitlements
-- ---------------------------------------------------------------------------

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

  return jsonb_build_object(
    'is_owner', v_is_owner,
    'participant_tier', v_participant::text,
    'creator_tier', coalesce(v_creator::text, null),
    'show_ads', case when v_is_owner then false else (v_plimits->>'show_ads')::boolean end,
    'max_concurrent_joins', case when v_is_owner then null else v_plimits->'max_concurrent_joins' end,
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
    'current_create_count', public.subscription_creator_active_competition_count(p_user_id, null),
    'current_aggregate_participants', public.subscription_creator_aggregate_participants(p_user_id)
  );
end;
$$;

create or replace function public.get_my_entitlements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.effective_entitlements(auth.uid());
$$;

revoke all on function public.get_my_entitlements() from public;
grant execute on function public.get_my_entitlements() to authenticated;

revoke all on function public.effective_entitlements(uuid) from public;
grant execute on function public.effective_entitlements(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Gate checks (used by join/create RPCs)
-- ---------------------------------------------------------------------------

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
begin
  if exists (select 1 from public.profiles where id = p_user_id and role = 'Owner') then
    return jsonb_build_object('ok', true);
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

create or replace function public.subscription_check_competition_capacity(
  p_mode text,
  p_competition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_max int;
  v_count int;
begin
  if p_mode = 'lms' then
    select max_participants into v_max from public.lms_competitions where id = p_competition_id;
    v_count := public.subscription_lms_competition_participant_count(p_competition_id);
  elsif p_mode = 'f2t' then
    select max_participants into v_max from public.f2t_competitions where id = p_competition_id;
    v_count := public.subscription_f2t_competition_participant_count(p_competition_id);
  elsif p_mode = 'racing' then
    select max_participants into v_max from public.competitions where id = p_competition_id;
    v_count := public.subscription_racing_competition_participant_count(p_competition_id);
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_mode');
  end if;

  if v_max is null then
    return jsonb_build_object('ok', true);
  end if;

  if v_count >= v_max then
    return jsonb_build_object(
      'ok', false,
      'error', 'competition_full',
      'max_participants', v_max,
      'current_participants', v_count
    );
  end if;

  return jsonb_build_object('ok', true, 'current_participants', v_count, 'max_participants', v_max);
end;
$$;

create or replace function public.subscription_check_creator_aggregate(
  p_user_id uuid,
  p_add_participants int default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_creator public.creator_tier;
  v_limits jsonb;
  v_max int;
  v_current int;
begin
  if exists (select 1 from public.profiles where id = p_user_id and role = 'Owner') then
    return jsonb_build_object('ok', true);
  end if;

  v_creator := public.subscription_effective_creator_tier(p_user_id);
  v_limits := public.subscription_creator_limits(v_creator);
  if v_limits is null then
    return jsonb_build_object('ok', true);
  end if;

  v_max := (v_limits->>'max_aggregate_active_participants')::int;
  v_current := public.subscription_creator_aggregate_participants(p_user_id);

  if v_current + p_add_participants > v_max then
    return jsonb_build_object(
      'ok', false,
      'error', 'aggregate_player_limit',
      'max_aggregate', v_max,
      'current_aggregate', v_current
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.subscription_check_can_create(
  p_user_id uuid,
  p_sport public.sport_category
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_creator public.creator_tier;
  v_limits jsonb;
  v_max_creates int;
  v_sport_scope text;
  v_sport_count int;
  v_max_per_comp int;
begin
  if not public.subscription_has_creator_entitlement(p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'creator_subscription_required');
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and role = 'Owner') then
    return jsonb_build_object(
      'ok', true,
      'max_participants_per_competition', 1000,
      'sport_category', p_sport::text
    );
  end if;

  v_creator := public.subscription_effective_creator_tier(p_user_id);
  v_limits := public.subscription_creator_limits(v_creator);
  if v_limits is null then
    return jsonb_build_object('ok', false, 'error', 'creator_subscription_required');
  end if;

  v_max_creates := (v_limits->>'max_concurrent_creates')::int;
  v_sport_scope := v_limits->>'create_sport_scope';
  v_max_per_comp := (v_limits->>'max_participants_per_competition')::int;

  if v_sport_scope = 'single' then
    if public.subscription_creator_has_other_sport_active(p_user_id, p_sport) then
      return jsonb_build_object('ok', false, 'error', 'single_sport_locked');
    end if;
    v_sport_count := public.subscription_creator_active_competition_count(p_user_id, p_sport);
  else
    v_sport_count := public.subscription_creator_active_competition_count(p_user_id, null);
  end if;

  if v_sport_count >= v_max_creates then
    return jsonb_build_object(
      'ok', false,
      'error', 'create_limit_reached',
      'max_creates', v_max_creates,
      'current_creates', v_sport_count
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'max_participants_per_competition', v_max_per_comp,
    'sport_category', p_sport::text,
    'creator_tier', v_creator::text
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Creator session gate (replaces Admin-role-only tablet_code_admin_user_id)
-- ---------------------------------------------------------------------------

create or replace function public.tablet_code_admin_user_id(p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return null;
  end if;
  if public.subscription_has_creator_entitlement(v_uid) then
    return v_uid;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) LMS: create / join / approve with caps
-- ---------------------------------------------------------------------------

create or replace function public.lms_admin_create_competition(
  p_code text,
  p_name text,
  p_start_gameweek_id uuid,
  p_season text default '2026/27',
  p_extra_lives int default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_comp_id uuid;
  v_access char(6);
  v_attempts int := 0;
  v_gw public.lms_gameweeks%rowtype;
  v_season text := coalesce(nullif(trim(p_season), ''), '2026/27');
  v_extra int := coalesce(p_extra_lives, 0);
  v_check jsonb;
  v_max_participants int;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  v_check := public.subscription_check_can_create(v_admin, 'football');
  if not (v_check->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_check->>'error', 'details', v_check);
  end if;
  v_max_participants := (v_check->>'max_participants_per_competition')::int;

  if trim(coalesce(p_name, '')) = '' then
    return jsonb_build_object('success', false, 'error', 'name_required');
  end if;

  if p_start_gameweek_id is null then
    return jsonb_build_object('success', false, 'error', 'start_gameweek_required');
  end if;

  if v_extra < 0 or v_extra > 3 then
    return jsonb_build_object('success', false, 'error', 'invalid_extra_lives');
  end if;

  select * into v_gw from public.lms_gameweeks where id = p_start_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_start_gameweek');
  end if;

  if v_gw.season <> v_season then
    return jsonb_build_object('success', false, 'error', 'start_gameweek_season_mismatch');
  end if;

  insert into public.lms_competitions (
    name, season, status, created_by_user_id, start_gameweek_id, extra_lives,
    sport_category, max_participants
  )
  values (
    trim(p_name), v_season, 'open', v_admin, p_start_gameweek_id, v_extra,
    'football', v_max_participants
  )
  returning id into v_comp_id;

  insert into public.lms_competition_teams (competition_id, team_id)
  select v_comp_id, t.id from public.lms_teams t
  on conflict do nothing;

  insert into public.lms_participants (
    competition_id, user_id, status, joined_at, lives_remaining
  )
  values (v_comp_id, v_admin, 'active', now(), v_extra)
  on conflict (competition_id, user_id) do nothing;

  loop
    v_access := public.lms_generate_access_code();
    begin
      insert into public.lms_access_codes (competition_id, code, type, created_by_user_id)
      values (v_comp_id, v_access, 'join', v_admin);
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 20 then
        return jsonb_build_object('success', false, 'error', 'code_generation_failed');
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'success', true,
    'competition_id', v_comp_id,
    'access_code', v_access,
    'start_gameweek_id', p_start_gameweek_id,
    'start_gameweek_number', v_gw.number,
    'extra_lives', v_extra,
    'max_participants', v_max_participants
  );
end;
$$;

create or replace function public.lms_request_join(p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code public.lms_access_codes%rowtype;
  v_comp public.lms_competitions%rowtype;
  v_gw public.lms_gameweeks%rowtype;
  v_norm text := upper(trim(p_access_code));
  v_join_check jsonb;
  v_request_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if public.is_profile_banned(v_uid) then
    return jsonb_build_object('success', false, 'error', 'account_banned');
  end if;

  v_join_check := public.subscription_check_user_join_limit(v_uid);
  if not (v_join_check->>'ok')::boolean then
    return jsonb_build_object(
      'success', false,
      'error', v_join_check->>'error',
      'max_joins', v_join_check->'max_joins',
      'current_joins', v_join_check->'current_joins'
    );
  end if;

  if length(v_norm) <> 6 then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_code
  from public.lms_access_codes
  where code = v_norm and is_active = true and voided_at is null
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_comp from public.lms_competitions where id = v_code.competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if v_comp.status = 'completed' then
    return jsonb_build_object('success', false, 'error', 'competition_completed');
  end if;

  if v_code.type = 'rejoin' then
    if v_code.valid_for_gameweek_id is null then
      return jsonb_build_object('success', false, 'error', 'invalid_code');
    end if;
    select * into v_gw from public.lms_gameweeks where id = v_code.valid_for_gameweek_id;
    if not found or now() >= v_gw.starts_at then
      update public.lms_access_codes
        set is_active = false, voided_at = coalesce(voided_at, now())
      where id = v_code.id;
      return jsonb_build_object('success', false, 'error', 'code_void');
    end if;
  else
    if not public.lms_competition_join_open(v_comp.id) then
      return jsonb_build_object(
        'success', false,
        'error', 'entries_closed',
        'competition_name', v_comp.name
      );
    end if;
  end if;

  if exists (
    select 1 from public.lms_participants
    where competition_id = v_comp.id and user_id = v_uid and status in ('active', 'winner')
  ) then
    return jsonb_build_object('success', false, 'error', 'already_in', 'competition_name', v_comp.name);
  end if;

  insert into public.lms_join_requests (competition_id, user_id, access_code_id, status)
  values (v_comp.id, v_uid, v_code.id, 'pending')
  on conflict (competition_id, user_id) do update
    set access_code_id = excluded.access_code_id,
        status = 'pending',
        created_at = now(),
        reviewed_at = null,
        reviewed_by = null
  returning id into v_request_id;

  return jsonb_build_object(
    'success', true,
    'status', 'pending',
    'competition_name', v_comp.name,
    'competition_id', v_comp.id,
    'join_request_id', v_request_id
  );
end;
$$;

create or replace function public.lms_admin_approve_join(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_req public.lms_join_requests%rowtype;
  v_ac public.lms_access_codes%rowtype;
  v_gw public.lms_gameweeks%rowtype;
  v_rollover int := 0;
  v_extra int := 0;
  v_join_check jsonb;
  v_cap jsonb;
  v_agg jsonb;
  v_creator uuid;
begin
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select * into v_req from public.lms_join_requests where id = p_request_id and status = 'pending';
  if not found then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;

  if not public.lms_can_handle_joins(v_req.competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  v_join_check := public.subscription_check_user_join_limit(v_req.user_id);
  if not (v_join_check->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_join_check->>'error');
  end if;

  v_cap := public.subscription_check_competition_capacity('lms', v_req.competition_id);
  if not (v_cap->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_cap->>'error');
  end if;

  select created_by_user_id into v_creator from public.lms_competitions where id = v_req.competition_id;
  v_agg := public.subscription_check_creator_aggregate(v_creator, 1);
  if not (v_agg->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_agg->>'error');
  end if;

  select coalesce(extra_lives, 0) into v_extra
  from public.lms_competitions
  where id = v_req.competition_id;

  select * into v_ac from public.lms_access_codes where id = v_req.access_code_id;

  if v_ac.type = 'rejoin' then
    select * into v_gw from public.lms_gameweeks where id = v_ac.valid_for_gameweek_id;
    if not found or now() >= v_gw.starts_at or v_ac.is_active = false then
      update public.lms_access_codes
        set is_active = false, voided_at = coalesce(voided_at, now())
      where id = v_ac.id;
      update public.lms_join_requests
        set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin
      where id = v_req.id;
      return jsonb_build_object('success', false, 'error', 'code_void');
    end if;

    delete from public.lms_used_teams
    where competition_id = v_req.competition_id and user_id = v_req.user_id;
    delete from public.lms_picks
    where competition_id = v_req.competition_id and user_id = v_req.user_id;

    select coalesce(rollover_count, 0) + 1 into v_rollover
    from public.lms_participants
    where competition_id = v_req.competition_id and user_id = v_req.user_id;

    insert into public.lms_participants (
      competition_id, user_id, status, eliminated_gameweek_id, joined_at, rollover_count, lives_remaining
    )
    values (
      v_req.competition_id, v_req.user_id, 'active', null, now(), coalesce(v_rollover, 1), v_extra
    )
    on conflict (competition_id, user_id) do update
      set status = 'active',
          eliminated_gameweek_id = null,
          joined_at = now(),
          rollover_count = excluded.rollover_count,
          lives_remaining = excluded.lives_remaining;
  else
    if not public.lms_competition_join_open(v_req.competition_id) then
      update public.lms_join_requests
        set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin
      where id = v_req.id;
      return jsonb_build_object('success', false, 'error', 'entries_closed');
    end if;

    insert into public.lms_participants (
      competition_id, user_id, status, joined_at, lives_remaining
    )
    values (v_req.competition_id, v_req.user_id, 'active', now(), v_extra)
    on conflict (competition_id, user_id) do update
      set status = 'active',
          eliminated_gameweek_id = null,
          joined_at = now(),
          lives_remaining = excluded.lives_remaining;
  end if;

  update public.lms_join_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = v_admin
  where id = v_req.id;

  return jsonb_build_object('success', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) F2T: create / join / approve with caps
-- ---------------------------------------------------------------------------

create or replace function public.f2t_admin_create_competition(
  p_code text,
  p_name text,
  p_start_gameweek_id uuid,
  p_season text default '2026/27',
  p_entry text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_comp_id uuid;
  v_access char(6);
  v_attempts int := 0;
  v_gw public.lms_gameweeks%rowtype;
  v_season text := coalesce(nullif(trim(p_season), ''), '2026/27');
  v_check jsonb;
  v_max_participants int;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  v_check := public.subscription_check_can_create(v_admin, 'football');
  if not (v_check->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_check->>'error', 'details', v_check);
  end if;
  v_max_participants := (v_check->>'max_participants_per_competition')::int;

  if trim(coalesce(p_name, '')) = '' then
    return jsonb_build_object('success', false, 'error', 'name_required');
  end if;

  if p_start_gameweek_id is null then
    return jsonb_build_object('success', false, 'error', 'start_gameweek_required');
  end if;

  select * into v_gw from public.lms_gameweeks where id = p_start_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_start_gameweek');
  end if;

  if v_gw.season <> v_season then
    return jsonb_build_object('success', false, 'error', 'start_gameweek_season_mismatch');
  end if;

  insert into public.f2t_competitions (
    name, season, status, created_by_user_id, start_gameweek_id, entry,
    sport_category, max_participants
  )
  values (
    trim(p_name), v_season, 'open', v_admin, p_start_gameweek_id,
    nullif(trim(coalesce(p_entry, '')), ''),
    'football', v_max_participants
  )
  returning id into v_comp_id;

  insert into public.f2t_participants (competition_id, user_id, status, joined_at)
  values (v_comp_id, v_admin, 'active', now())
  on conflict (competition_id, user_id) do nothing;

  loop
    v_access := public.lms_generate_access_code();
    begin
      insert into public.f2t_access_codes (competition_id, code, type, created_by_user_id)
      values (v_comp_id, v_access, 'join', v_admin);
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 20 then
        return jsonb_build_object('success', false, 'error', 'code_generation_failed');
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'success', true,
    'competition_id', v_comp_id,
    'access_code', v_access,
    'start_gameweek_id', p_start_gameweek_id,
    'start_gameweek_number', v_gw.number,
    'max_participants', v_max_participants
  );
end;
$$;

create or replace function public.f2t_request_join(p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code public.f2t_access_codes%rowtype;
  v_comp public.f2t_competitions%rowtype;
  v_norm text := upper(trim(p_access_code));
  v_request_id uuid;
  v_join_check jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if public.is_profile_banned(v_uid) then
    return jsonb_build_object('success', false, 'error', 'account_banned');
  end if;

  v_join_check := public.subscription_check_user_join_limit(v_uid);
  if not (v_join_check->>'ok')::boolean then
    return jsonb_build_object(
      'success', false,
      'error', v_join_check->>'error',
      'max_joins', v_join_check->'max_joins',
      'current_joins', v_join_check->'current_joins'
    );
  end if;

  if length(v_norm) <> 6 then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_code
  from public.f2t_access_codes
  where code = v_norm and is_active = true and voided_at is null
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_comp from public.f2t_competitions where id = v_code.competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if v_comp.status = 'completed' then
    return jsonb_build_object('success', false, 'error', 'competition_completed');
  end if;

  if not public.f2t_competition_join_open(v_comp.id) then
    return jsonb_build_object(
      'success', false,
      'error', 'entries_closed',
      'competition_name', v_comp.name
    );
  end if;

  if exists (
    select 1 from public.f2t_participants
    where competition_id = v_comp.id and user_id = v_uid and status in ('active', 'winner')
  ) then
    return jsonb_build_object('success', false, 'error', 'already_in', 'competition_name', v_comp.name);
  end if;

  insert into public.f2t_join_requests (competition_id, user_id, access_code_id, status)
  values (v_comp.id, v_uid, v_code.id, 'pending')
  on conflict (competition_id, user_id) do update
    set access_code_id = excluded.access_code_id,
        status = 'pending',
        created_at = now(),
        reviewed_at = null,
        reviewed_by = null
  returning id into v_request_id;

  return jsonb_build_object(
    'success', true,
    'status', 'pending',
    'competition_name', v_comp.name,
    'competition_id', v_comp.id,
    'join_request_id', v_request_id
  );
end;
$$;

create or replace function public.f2t_admin_approve_join(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_req public.f2t_join_requests%rowtype;
  v_join_check jsonb;
  v_cap jsonb;
  v_agg jsonb;
  v_creator uuid;
begin
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_req from public.f2t_join_requests where id = p_request_id and status = 'pending';
  if not found then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;

  if not public.f2t_can_handle_joins(v_req.competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  v_join_check := public.subscription_check_user_join_limit(v_req.user_id);
  if not (v_join_check->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_join_check->>'error');
  end if;

  v_cap := public.subscription_check_competition_capacity('f2t', v_req.competition_id);
  if not (v_cap->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_cap->>'error');
  end if;

  select created_by_user_id into v_creator from public.f2t_competitions where id = v_req.competition_id;
  v_agg := public.subscription_check_creator_aggregate(v_creator, 1);
  if not (v_agg->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_agg->>'error');
  end if;

  if not public.f2t_competition_join_open(v_req.competition_id) then
    update public.f2t_join_requests
      set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin
    where id = v_req.id;
    return jsonb_build_object('success', false, 'error', 'entries_closed');
  end if;

  insert into public.f2t_participants (competition_id, user_id, status, joined_at)
  values (v_req.competition_id, v_req.user_id, 'active', now())
  on conflict (competition_id, user_id) do update
    set status = 'active', joined_at = now();

  update public.f2t_join_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = v_admin
  where id = v_req.id;

  return jsonb_build_object('success', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10) Racing: create / join / approve with caps
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_competition(
  p_code text,
  p_name text,
  p_festival_start_date date,
  p_festival_end_date date,
  p_selection_open_utc time default '10:00'::time,
  p_selection_close_minutes_before_first_race int default 60,
  p_access_code text default null,
  p_courses text[] default array['Newcastle']
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code char(6);
  v_course text;
  v_admin uuid;
  v_display text;
  v_check jsonb;
  v_max_participants int;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  v_check := public.subscription_check_can_create(v_admin, 'racing');
  if not (v_check->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_check->>'error', 'details', v_check);
  end if;
  v_max_participants := (v_check->>'max_participants_per_competition')::int;

  if trim(p_name) is null or trim(p_name) = '' then
    return jsonb_build_object('success', false, 'error', 'name_required');
  end if;
  if p_courses is null or array_length(p_courses, 1) is null or array_length(p_courses, 1) < 1 then
    p_courses := array['Newcastle'];
  end if;
  v_code := case when p_access_code is null or trim(p_access_code) = '' then null else trim(p_access_code)::char(6) end;
  insert into public.competitions (
    name,
    festival_start_date,
    festival_end_date,
    selection_open_utc,
    selection_close_minutes_before_first_race,
    access_code,
    created_by_user_id,
    sport_category,
    max_participants
  ) values (
    trim(p_name),
    p_festival_start_date,
    p_festival_end_date,
    coalesce(p_selection_open_utc, '10:00'::time),
    coalesce(p_selection_close_minutes_before_first_race, 60),
    v_code,
    v_admin,
    'racing',
    v_max_participants
  )
  returning id into v_id;

  foreach v_course in array p_courses loop
    insert into public.competition_courses (competition_id, course)
    values (v_id, trim(v_course))
    on conflict (competition_id) do update set course = excluded.course;
  end loop;

  select coalesce(nullif(trim(username), ''), 'Admin')
  into v_display
  from public.profiles
  where id = v_admin;

  insert into public.competition_participants (competition_id, user_id, display_name)
  values (v_id, v_admin, coalesce(v_display, 'Admin'))
  on conflict (competition_id, user_id) do nothing;

  return jsonb_build_object('success', true, 'id', v_id, 'max_participants', v_max_participants);
end;
$$;

create or replace function public.racing_request_join(
  p_access_code text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comp record;
  v_norm text := upper(trim(p_access_code));
  v_join_check jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if public.is_profile_banned(v_uid) then
    return jsonb_build_object('success', false, 'error', 'account_banned');
  end if;

  if trim(coalesce(p_display_name, '')) = '' then
    return jsonb_build_object('success', false, 'error', 'display_name_required');
  end if;

  v_join_check := public.subscription_check_user_join_limit(v_uid);
  if not (v_join_check->>'ok')::boolean then
    return jsonb_build_object(
      'success', false,
      'error', v_join_check->>'error',
      'max_joins', v_join_check->'max_joins',
      'current_joins', v_join_check->'current_joins'
    );
  end if;

  select id, name into v_comp
  from public.competitions
  where access_code = v_norm;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if exists (
    select 1 from public.competition_participants
    where competition_id = v_comp.id and user_id = v_uid
  ) then
    return jsonb_build_object('success', false, 'error', 'already_in', 'competition_name', v_comp.name);
  end if;

  insert into public.competition_join_requests (competition_id, user_id, display_name, status)
  values (v_comp.id, v_uid, trim(p_display_name), 'pending')
  on conflict (competition_id, user_id) do update
    set display_name = excluded.display_name,
        status = 'pending',
        created_at = now(),
        reviewed_at = null;

  return jsonb_build_object(
    'success', true,
    'status', 'pending',
    'competition_name', v_comp.name,
    'competition_id', v_comp.id
  );
end;
$$;

revoke all on function public.racing_request_join(text, text) from public;
grant execute on function public.racing_request_join(text, text) to authenticated;

create or replace function public.admin_approve_request(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.competition_join_requests%rowtype;
  v_join_check jsonb;
  v_cap jsonb;
  v_agg jsonb;
  v_creator uuid;
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select * into v_req from public.competition_join_requests where id = p_request_id and status = 'pending';
  if v_req.id is null then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;

  if not public.racing_can_manage_competition(v_req.competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  v_join_check := public.subscription_check_user_join_limit(v_req.user_id);
  if not (v_join_check->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_join_check->>'error');
  end if;

  v_cap := public.subscription_check_competition_capacity('racing', v_req.competition_id);
  if not (v_cap->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_cap->>'error');
  end if;

  select created_by_user_id into v_creator from public.competitions where id = v_req.competition_id;
  v_agg := public.subscription_check_creator_aggregate(v_creator, 1);
  if not (v_agg->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_agg->>'error');
  end if;

  insert into public.competition_participants (competition_id, user_id, display_name)
  values (v_req.competition_id, v_req.user_id, v_req.display_name)
  on conflict (competition_id, user_id) do update set display_name = excluded.display_name;

  update public.competition_join_requests set status = 'approved', reviewed_at = now() where id = p_request_id;
  return jsonb_build_object('success', true);
end;
$$;
