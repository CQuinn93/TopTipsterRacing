-- =============================================================================
-- F2T admin parity with LMS: join codes, managers (max 3), join-notify prefs,
-- broadcast authorize.
-- =============================================================================

create table if not exists public.f2t_join_notify_prefs (
  competition_id uuid not null references public.f2t_competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

create index if not exists f2t_join_notify_prefs_user_idx
  on public.f2t_join_notify_prefs (user_id);

alter table public.f2t_join_notify_prefs enable row level security;

drop policy if exists "f2t_join_notify_prefs_select_own" on public.f2t_join_notify_prefs;
create policy "f2t_join_notify_prefs_select_own"
  on public.f2t_join_notify_prefs for select to authenticated
  using (user_id = auth.uid());

comment on table public.f2t_join_notify_prefs is
  'Per-user preference for F2T join-request push alerts (creators/managers default ON).';

create table if not exists public.f2t_competition_broadcasts (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.f2t_competitions(id) on delete cascade,
  sent_by uuid references auth.users(id) on delete set null,
  title text not null,
  body text not null,
  recipient_count int not null default 0,
  sent_at timestamptz not null default now()
);

create index if not exists f2t_competition_broadcasts_comp_sent_idx
  on public.f2t_competition_broadcasts (competition_id, sent_at desc);

alter table public.f2t_competition_broadcasts enable row level security;

comment on table public.f2t_competition_broadcasts is
  'Audit log for creator/Owner custom Web Push broadcasts to F2T competition players.';

-- ---------------------------------------------------------------------------
-- Join codes
-- ---------------------------------------------------------------------------

create or replace function public.f2t_get_competition_join_codes(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_join text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.f2t_can_handle_joins(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if not exists (select 1 from public.f2t_competitions c where c.id = p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  select ac.code into v_join
  from public.f2t_access_codes ac
  where ac.competition_id = p_competition_id
    and ac.type = 'join'
    and ac.is_active = true
  order by ac.created_at asc
  limit 1;

  return jsonb_build_object(
    'success', true,
    'join_code', v_join
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Managers
-- ---------------------------------------------------------------------------

create or replace function public.f2t_list_competition_managers(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;

  if not (
    public.f2t_is_competition_member(p_competition_id)
    or public.f2t_can_handle_joins(p_competition_id)
  ) then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', m.user_id,
          'username', p.username,
          'assigned_at', m.assigned_at
        )
        order by p.username nulls last, m.assigned_at asc
      ),
      '[]'::jsonb
    )
    from public.f2t_competition_managers m
    left join public.profiles p on p.id = m.user_id
    where m.competition_id = p_competition_id
  );
end;
$$;

create or replace function public.f2t_list_assignable_managers(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;

  if not public.f2t_can_manage_competition(p_competition_id) then
    return '[]'::jsonb;
  end if;

  select c.created_by_user_id into v_created_by
  from public.f2t_competitions c
  where c.id = p_competition_id;

  if not found then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', part.user_id,
          'username', p.username,
          'status', part.status,
          'is_creator', (v_created_by is not null and part.user_id = v_created_by),
          'is_manager', exists (
            select 1
            from public.f2t_competition_managers m
            where m.competition_id = part.competition_id
              and m.user_id = part.user_id
          )
        )
        order by
          (v_created_by is not null and part.user_id = v_created_by) desc,
          p.username nulls last,
          part.joined_at asc
      ),
      '[]'::jsonb
    )
    from public.f2t_participants part
    left join public.profiles p on p.id = part.user_id
    where part.competition_id = p_competition_id
  );
end;
$$;

create or replace function public.f2t_set_competition_manager(
  p_competition_id uuid,
  p_user_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_created_by uuid;
  v_count int;
  v_max int := 3;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.f2t_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_required');
  end if;

  select c.created_by_user_id into v_created_by
  from public.f2t_competitions c
  where c.id = p_competition_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if v_created_by is not null and p_user_id = v_created_by then
    return jsonb_build_object('success', false, 'error', 'already_creator');
  end if;

  if not exists (
    select 1 from public.f2t_participants part
    where part.competition_id = p_competition_id
      and part.user_id = p_user_id
  ) then
    return jsonb_build_object('success', false, 'error', 'not_a_participant');
  end if;

  if coalesce(p_enabled, false) then
    select count(*)::int into v_count
    from public.f2t_competition_managers m
    where m.competition_id = p_competition_id
      and m.user_id <> p_user_id;

    if v_count >= v_max then
      return jsonb_build_object('success', false, 'error', 'manager_limit', 'max', v_max);
    end if;

    insert into public.f2t_competition_managers (
      competition_id, user_id, assigned_by, assigned_at
    )
    values (p_competition_id, p_user_id, v_uid, now())
    on conflict (competition_id, user_id) do update
      set assigned_by = excluded.assigned_by,
          assigned_at = now();

    insert into public.f2t_join_notify_prefs (competition_id, user_id, enabled, updated_at)
    values (p_competition_id, p_user_id, true, now())
    on conflict (competition_id, user_id) do nothing;

    return jsonb_build_object('success', true, 'enabled', true);
  end if;

  delete from public.f2t_competition_managers
  where competition_id = p_competition_id
    and user_id = p_user_id;

  return jsonb_build_object('success', true, 'enabled', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Join notify prefs
-- ---------------------------------------------------------------------------

create or replace function public.f2t_get_join_notify_pref(p_competition_id uuid)
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
  v_is_manager boolean;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.f2t_can_handle_joins(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select c.created_by_user_id into v_created_by
  from public.f2t_competitions c
  where c.id = p_competition_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  v_is_creator := (v_created_by is not null and v_created_by = v_uid);
  v_is_owner := public.is_owner();
  v_is_manager := public.f2t_is_competition_manager(p_competition_id);

  select p.enabled into v_enabled
  from public.f2t_join_notify_prefs p
  where p.competition_id = p_competition_id and p.user_id = v_uid;

  if not found then
    v_enabled := v_is_creator or v_is_manager;
  end if;

  return jsonb_build_object(
    'success', true,
    'enabled', v_enabled,
    'is_creator', v_is_creator,
    'is_owner', v_is_owner,
    'is_manager', v_is_manager,
    'has_explicit_pref', exists (
      select 1 from public.f2t_join_notify_prefs p
      where p.competition_id = p_competition_id and p.user_id = v_uid
    )
  );
end;
$$;

create or replace function public.f2t_set_join_notify_pref(
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

  if not public.f2t_can_handle_joins(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if not exists (select 1 from public.f2t_competitions c where c.id = p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  insert into public.f2t_join_notify_prefs (competition_id, user_id, enabled, updated_at)
  values (p_competition_id, v_uid, coalesce(p_enabled, true), now())
  on conflict (competition_id, user_id) do update
    set enabled = excluded.enabled,
        updated_at = now();

  return jsonb_build_object('success', true, 'enabled', coalesce(p_enabled, true));
end;
$$;

create or replace function public.f2t_list_join_notify_recipients(p_competition_id uuid)
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
    select c.created_by_user_id as user_id, true as default_on
    from public.f2t_competitions c
    where c.id = p_competition_id
      and c.created_by_user_id is not null
    union
    select p.id as user_id, false as default_on
    from public.profiles p
    where p.role = 'Owner'
    union
    select m.user_id, true as default_on
    from public.f2t_competition_managers m
    where m.competition_id = p_competition_id
  ),
  distinct_managers as (
    select
      m.user_id,
      bool_or(m.default_on) as default_on
    from managers m
    where m.user_id is not null
    group by m.user_id
  ),
  with_pref as (
    select
      dm.user_id,
      dm.default_on,
      pref.enabled as pref_enabled
    from distinct_managers dm
    left join public.f2t_join_notify_prefs pref
      on pref.competition_id = p_competition_id
     and pref.user_id = dm.user_id
  ),
  enabled_users as (
    select wp.user_id
    from with_pref wp
    where coalesce(wp.pref_enabled, wp.default_on) = true
  )
  select
    s.user_id,
    s.endpoint,
    s.p256dh,
    s.auth
  from enabled_users eu
  join public.web_push_subscriptions s on s.user_id = eu.user_id;
$$;

-- ---------------------------------------------------------------------------
-- Broadcast authorize
-- ---------------------------------------------------------------------------

create or replace function public.f2t_admin_authorize_broadcast(
  p_competition_id uuid,
  p_title text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_name text;
  v_broadcast_id uuid;
  v_user_ids uuid[];
  v_recent int;
  v_day_count int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.f2t_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select c.name into v_name
  from public.f2t_competitions c
  where c.id = p_competition_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if length(v_title) < 1 or length(v_title) > 80 then
    return jsonb_build_object('success', false, 'error', 'invalid_title');
  end if;

  if length(v_body) < 1 or length(v_body) > 280 then
    return jsonb_build_object('success', false, 'error', 'invalid_body');
  end if;

  select count(*)::int into v_recent
  from public.f2t_competition_broadcasts b
  where b.competition_id = p_competition_id
    and b.sent_at > now() - interval '3 minutes';

  if v_recent > 0 then
    return jsonb_build_object('success', false, 'error', 'rate_limited');
  end if;

  select count(*)::int into v_day_count
  from public.f2t_competition_broadcasts b
  where b.competition_id = p_competition_id
    and b.sent_at > now() - interval '24 hours';

  if v_day_count >= 20 then
    return jsonb_build_object('success', false, 'error', 'daily_limit');
  end if;

  select coalesce(array_agg(part.user_id), '{}'::uuid[])
  into v_user_ids
  from public.f2t_participants part
  where part.competition_id = p_competition_id;

  insert into public.f2t_competition_broadcasts (
    competition_id, sent_by, title, body, recipient_count
  )
  values (
    p_competition_id, v_uid, v_title, v_body, coalesce(cardinality(v_user_ids), 0)
  )
  returning id into v_broadcast_id;

  return jsonb_build_object(
    'success', true,
    'broadcast_id', v_broadcast_id,
    'competition_id', p_competition_id,
    'competition_name', v_name,
    'title', v_title,
    'body', v_body,
    'user_ids', to_jsonb(coalesce(v_user_ids, '{}'::uuid[])),
    'recipient_count', coalesce(cardinality(v_user_ids), 0)
  );
end;
$$;

-- Grants
revoke all on function public.f2t_get_competition_join_codes(uuid) from public;
revoke all on function public.f2t_list_competition_managers(uuid) from public;
revoke all on function public.f2t_list_assignable_managers(uuid) from public;
revoke all on function public.f2t_set_competition_manager(uuid, uuid, boolean) from public;
revoke all on function public.f2t_get_join_notify_pref(uuid) from public;
revoke all on function public.f2t_set_join_notify_pref(uuid, boolean) from public;
revoke all on function public.f2t_list_join_notify_recipients(uuid) from public;
revoke all on function public.f2t_admin_authorize_broadcast(uuid, text, text) from public;

grant execute on function public.f2t_get_competition_join_codes(uuid) to authenticated;
grant execute on function public.f2t_list_competition_managers(uuid) to authenticated;
grant execute on function public.f2t_list_assignable_managers(uuid) to authenticated;
grant execute on function public.f2t_set_competition_manager(uuid, uuid, boolean) to authenticated;
grant execute on function public.f2t_get_join_notify_pref(uuid) to authenticated;
grant execute on function public.f2t_set_join_notify_pref(uuid, boolean) to authenticated;
grant execute on function public.f2t_admin_authorize_broadcast(uuid, text, text) to authenticated;

revoke all on function public.f2t_list_join_notify_recipients(uuid) from authenticated;
grant execute on function public.f2t_list_join_notify_recipients(uuid) to service_role;
