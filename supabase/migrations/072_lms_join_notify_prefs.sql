-- =============================================================================
-- Per-user LMS join-request notification preferences + recipient helper.
-- Defaults (when no row): competition creator = ON, Owner (non-creator) = OFF.
-- =============================================================================

create table if not exists public.lms_join_notify_prefs (
  competition_id uuid not null references public.lms_competitions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

create index if not exists lms_join_notify_prefs_user_idx
  on public.lms_join_notify_prefs (user_id);

alter table public.lms_join_notify_prefs enable row level security;

drop policy if exists "lms_join_notify_prefs_select_own" on public.lms_join_notify_prefs;
create policy "lms_join_notify_prefs_select_own"
  on public.lms_join_notify_prefs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "lms_join_notify_prefs_upsert_own" on public.lms_join_notify_prefs;
-- insert/update via RPCs (security definer); keep direct writes locked down
-- no insert/update/delete policies for authenticated

comment on table public.lms_join_notify_prefs is
  'Per-manager opt-in for LMS join-request web push. Missing row → creator on, owner-only off.';

-- Effective preference for the current user on a competition they can manage.
create or replace function public.lms_get_join_notify_pref(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_created_by uuid;
  v_enabled boolean;
  v_is_creator boolean;
  v_is_owner boolean;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select c.created_by_user_id into v_created_by
  from public.lms_competitions c
  where c.id = p_competition_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  v_is_creator := (v_created_by is not null and v_created_by = v_uid);
  v_is_owner := public.is_owner();

  select p.enabled into v_enabled
  from public.lms_join_notify_prefs p
  where p.competition_id = p_competition_id and p.user_id = v_uid;

  if not found then
    -- Creator (including owner-who-created): default ON. Owner-only: default OFF.
    v_enabled := v_is_creator;
  end if;

  return jsonb_build_object(
    'success', true,
    'enabled', v_enabled,
    'is_creator', v_is_creator,
    'is_owner', v_is_owner,
    'has_explicit_pref', exists (
      select 1 from public.lms_join_notify_prefs p
      where p.competition_id = p_competition_id and p.user_id = v_uid
    )
  );
end;
$$;

revoke all on function public.lms_get_join_notify_pref(uuid) from public;
grant execute on function public.lms_get_join_notify_pref(uuid) to authenticated;

create or replace function public.lms_set_join_notify_pref(
  p_competition_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if not exists (select 1 from public.lms_competitions c where c.id = p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  insert into public.lms_join_notify_prefs (competition_id, user_id, enabled, updated_at)
  values (p_competition_id, v_uid, coalesce(p_enabled, true), now())
  on conflict (competition_id, user_id) do update
    set enabled = excluded.enabled,
        updated_at = now();

  return jsonb_build_object('success', true, 'enabled', coalesce(p_enabled, true));
end;
$$;

revoke all on function public.lms_set_join_notify_pref(uuid, boolean) from public;
grant execute on function public.lms_set_join_notify_pref(uuid, boolean) to authenticated;

-- Recipients for a join-request push (service role / edge function).
-- Returns push subscription rows for managers who effectively have notify ON.
create or replace function public.lms_list_join_notify_recipients(p_competition_id uuid)
returns table (
  user_id uuid,
  endpoint text,
  p256dh text,
  auth text
)
language sql
stable
security definer
set search_path = public
as $$
  with managers as (
    -- Creator
    select c.created_by_user_id as user_id, true as is_creator
    from public.lms_competitions c
    where c.id = p_competition_id
      and c.created_by_user_id is not null
    union
    -- Owners (may overlap with creator)
    select p.id as user_id, false as is_creator
    from public.profiles p
    where p.role = 'Owner'
  ),
  distinct_managers as (
    select
      m.user_id,
      bool_or(m.is_creator) as is_creator
    from managers m
    where m.user_id is not null
    group by m.user_id
  ),
  with_pref as (
    select
      dm.user_id,
      dm.is_creator,
      pref.enabled as pref_enabled
    from distinct_managers dm
    left join public.lms_join_notify_prefs pref
      on pref.competition_id = p_competition_id
     and pref.user_id = dm.user_id
  ),
  enabled_users as (
    select wp.user_id
    from with_pref wp
    where coalesce(wp.pref_enabled, wp.is_creator) = true
  )
  select
    s.user_id,
    s.endpoint,
    s.p256dh,
    s.auth
  from enabled_users eu
  join public.web_push_subscriptions s on s.user_id = eu.user_id;
$$;

revoke all on function public.lms_list_join_notify_recipients(uuid) from public;
revoke all on function public.lms_list_join_notify_recipients(uuid) from authenticated;
grant execute on function public.lms_list_join_notify_recipients(uuid) to service_role;
