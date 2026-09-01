-- Fix join-limit counting: only alive in live competitions count.
-- Eliminated LMS players in still-running comps do not count.
-- Completed / ended competitions do not count.

create or replace function public.subscription_count_user_joins(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (
    (select count(*)::int from public.lms_participants lp
      inner join public.lms_competitions c on c.id = lp.competition_id
      where lp.user_id = p_user_id
        and lp.status = 'active'
        and c.status in ('open', 'active'))
    + (select count(*)::int from public.f2t_participants fp
      inner join public.f2t_competitions c on c.id = fp.competition_id
      where fp.user_id = p_user_id
        and fp.status = 'active'
        and c.status in ('open', 'active'))
    + (select count(*)::int from public.competition_participants cp
      inner join public.competitions c on c.id = cp.competition_id
      where cp.user_id = p_user_id
        and c.festival_end_date >= current_date)
  );
$$;

create or replace function public.subscription_count_user_eliminated_in_live(p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select (
    select count(*)::int from public.lms_participants lp
    inner join public.lms_competitions c on c.id = lp.competition_id
    where lp.user_id = p_user_id
      and lp.status = 'eliminated'
      and c.status in ('open', 'active')
  );
$$;

create or replace function public.subscription_join_limit_warning(p_user_id uuid, p_access_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ent jsonb;
  v_max int;
  v_alive int;
  v_eliminated_live int;
  v_norm text;
  v_code_type text;
begin
  if p_user_id is null then
    return jsonb_build_object('needs_warning', false);
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and role = 'Owner') then
    return jsonb_build_object('needs_warning', false, 'is_owner', true);
  end if;

  v_ent := public.effective_entitlements(p_user_id);
  v_max := (v_ent->>'max_concurrent_joins')::int;
  if v_max is null then
    return jsonb_build_object('needs_warning', false, 'max_joins', null);
  end if;

  if p_access_code is not null and length(trim(p_access_code)) > 0 then
    v_norm := upper(trim(p_access_code));
    select ac.type into v_code_type
    from public.lms_access_codes ac
    where ac.code = v_norm and ac.is_active = true and ac.voided_at is null
    limit 1;
    if v_code_type = 'rejoin' then
      return jsonb_build_object('needs_warning', false, 'is_rejoin_code', true);
    end if;

    select ac.type into v_code_type
    from public.f2t_access_codes ac
    where ac.code = v_norm and ac.is_active = true and ac.voided_at is null
    limit 1;
    if v_code_type = 'rejoin' then
      return jsonb_build_object('needs_warning', false, 'is_rejoin_code', true);
    end if;
  end if;

  v_alive := public.subscription_count_user_joins(p_user_id);
  v_eliminated_live := public.subscription_count_user_eliminated_in_live(p_user_id);

  return jsonb_build_object(
    'needs_warning',
      v_eliminated_live > 0 and v_alive + 1 >= v_max,
    'alive_count', v_alive,
    'eliminated_in_live_count', v_eliminated_live,
    'max_joins', v_max
  );
end;
$$;

create or replace function public.get_my_join_limit_warning(p_access_code text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.subscription_join_limit_warning(auth.uid(), p_access_code);
$$;

revoke all on function public.subscription_count_user_eliminated_in_live(uuid) from public;
grant execute on function public.subscription_count_user_eliminated_in_live(uuid) to authenticated;

revoke all on function public.subscription_join_limit_warning(uuid, text) from public;
grant execute on function public.subscription_join_limit_warning(uuid, text) to authenticated;

revoke all on function public.get_my_join_limit_warning(text) from public;
grant execute on function public.get_my_join_limit_warning(text) to authenticated;

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
    'current_eliminated_in_live_count', public.subscription_count_user_eliminated_in_live(p_user_id),
    'current_create_count', public.subscription_creator_active_competition_count(p_user_id, null),
    'current_aggregate_participants', public.subscription_creator_aggregate_participants(p_user_id)
  );
end;
$$;
