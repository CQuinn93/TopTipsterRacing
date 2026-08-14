-- =============================================================================
-- Per-competition LMS managers (join-request deputies).
-- Global roles stay User / Admin / Owner. This is league-scoped only.
-- Managers: view/accept/reject joins + join-request notifications.
-- Full admin (pool, pick-for-user, delete, assign managers) stays creator/Owner.
-- =============================================================================

create table if not exists public.lms_competition_managers (
  competition_id uuid not null references public.lms_competitions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

create index if not exists lms_competition_managers_user_idx
  on public.lms_competition_managers (user_id);

alter table public.lms_competition_managers enable row level security;

comment on table public.lms_competition_managers is
  'Users assigned by a competition creator/Owner to handle LMS join requests.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.lms_is_competition_manager(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lms_competition_managers m
    where m.competition_id = p_competition_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.lms_can_handle_joins(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.lms_can_manage_competition(p_competition_id)
    or public.lms_is_competition_manager(p_competition_id);
$$;

create or replace function public.lms_user_can_handle_joins(
  p_competition_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.lms_competitions c
    where c.id = p_competition_id
      and (
        c.created_by_user_id = p_user_id
        or exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'Owner')
        or exists (
          select 1 from public.lms_competition_managers m
          where m.competition_id = p_competition_id and m.user_id = p_user_id
        )
      )
  );
$$;

revoke all on function public.lms_is_competition_manager(uuid) from public;
revoke all on function public.lms_can_handle_joins(uuid) from public;
revoke all on function public.lms_user_can_handle_joins(uuid, uuid) from public;
grant execute on function public.lms_is_competition_manager(uuid) to authenticated;
grant execute on function public.lms_can_handle_joins(uuid) to authenticated;
grant execute on function public.lms_user_can_handle_joins(uuid, uuid) to authenticated, service_role;

drop policy if exists "lms_competition_managers_select" on public.lms_competition_managers;
create policy "lms_competition_managers_select"
  on public.lms_competition_managers for select to authenticated
  using (
    user_id = auth.uid()
    or public.lms_is_competition_member(competition_id)
    or public.lms_can_handle_joins(competition_id)
  );

-- Join requests: members who handle joins can read pending rows
drop policy if exists "lms_join_requests_select_own" on public.lms_join_requests;
create policy "lms_join_requests_select_own" on public.lms_join_requests
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.lms_can_handle_joins(competition_id)
  );

-- ---------------------------------------------------------------------------
-- Permission RPC (client shell)
-- ---------------------------------------------------------------------------

create or replace function public.lms_can_manage_competition_rpc(p_competition_id uuid)
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
    return jsonb_build_object(
      'success', false,
      'can_manage', false,
      'can_handle_joins', false,
      'is_creator', false,
      'is_manager', false,
      'created_by_user_id', null
    );
  end if;

  select c.created_by_user_id
  into v_created_by
  from public.lms_competitions c
  where c.id = p_competition_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'can_manage', false,
      'can_handle_joins', false,
      'is_creator', false,
      'is_manager', false,
      'created_by_user_id', null,
      'error', 'invalid_competition'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'can_manage', public.lms_can_manage_competition(p_competition_id),
    'can_handle_joins', public.lms_can_handle_joins(p_competition_id),
    'is_creator', (v_created_by is not null and v_created_by = auth.uid()),
    'is_manager', public.lms_is_competition_manager(p_competition_id),
    'created_by_user_id', v_created_by
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Assign / list managers
-- ---------------------------------------------------------------------------

create or replace function public.lms_list_competition_managers(p_competition_id uuid)
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
    public.lms_is_competition_member(p_competition_id)
    or public.lms_can_handle_joins(p_competition_id)
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
    from public.lms_competition_managers m
    left join public.profiles p on p.id = m.user_id
    where m.competition_id = p_competition_id
  );
end;
$$;

revoke all on function public.lms_list_competition_managers(uuid) from public;
grant execute on function public.lms_list_competition_managers(uuid) to authenticated;

create or replace function public.lms_set_competition_manager(
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

  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_required');
  end if;

  select c.created_by_user_id into v_created_by
  from public.lms_competitions c
  where c.id = p_competition_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if v_created_by is not null and p_user_id = v_created_by then
    return jsonb_build_object('success', false, 'error', 'already_creator');
  end if;

  if not exists (
    select 1 from public.lms_participants part
    where part.competition_id = p_competition_id
      and part.user_id = p_user_id
  ) then
    return jsonb_build_object('success', false, 'error', 'not_a_participant');
  end if;

  if coalesce(p_enabled, false) then
    select count(*)::int into v_count
    from public.lms_competition_managers m
    where m.competition_id = p_competition_id
      and m.user_id <> p_user_id;

    if v_count >= v_max then
      return jsonb_build_object('success', false, 'error', 'manager_limit', 'max', v_max);
    end if;

    insert into public.lms_competition_managers (
      competition_id, user_id, assigned_by, assigned_at
    )
    values (p_competition_id, p_user_id, v_uid, now())
    on conflict (competition_id, user_id) do update
      set assigned_by = excluded.assigned_by,
          assigned_at = now();

    insert into public.lms_join_notify_prefs (competition_id, user_id, enabled, updated_at)
    values (p_competition_id, p_user_id, true, now())
    on conflict (competition_id, user_id) do nothing;

    return jsonb_build_object('success', true, 'enabled', true);
  end if;

  delete from public.lms_competition_managers
  where competition_id = p_competition_id
    and user_id = p_user_id;

  return jsonb_build_object('success', true, 'enabled', false);
end;
$$;

revoke all on function public.lms_set_competition_manager(uuid, uuid, boolean) from public;
grant execute on function public.lms_set_competition_manager(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Join-request list / approve / reject — handle_joins (not full admin)
-- ---------------------------------------------------------------------------

create or replace function public.lms_admin_list_pending_for_competition(p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.lms_can_handle_joins(p_competition_id) then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'competition_id', r.competition_id,
          'competition_name', c.name,
          'user_id', r.user_id,
          'username', p.username,
          'code_type', ac.type,
          'created_at', r.created_at
        )
        order by r.created_at asc
      ),
      '[]'::jsonb
    )
    from public.lms_join_requests r
    join public.lms_competitions c on c.id = r.competition_id
    join public.lms_access_codes ac on ac.id = r.access_code_id
    left join public.profiles p on p.id = r.user_id
    where r.competition_id = p_competition_id
      and r.status = 'pending'
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
begin
  -- p_code retained for call-site compatibility; session user is the actor.
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
      competition_id, user_id, status, eliminated_gameweek_id, joined_at, rollover_count
    )
    values (
      v_req.competition_id, v_req.user_id, 'active', null, now(), coalesce(v_rollover, 1)
    )
    on conflict (competition_id, user_id) do update
      set status = 'active',
          eliminated_gameweek_id = null,
          joined_at = now(),
          rollover_count = excluded.rollover_count;
  else
    if not public.lms_competition_join_open(v_req.competition_id) then
      update public.lms_join_requests
        set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin
      where id = v_req.id;
      return jsonb_build_object('success', false, 'error', 'entries_closed');
    end if;

    insert into public.lms_participants (competition_id, user_id, status, joined_at)
    values (v_req.competition_id, v_req.user_id, 'active', now())
    on conflict (competition_id, user_id) do update
      set status = 'active',
          eliminated_gameweek_id = null,
          joined_at = now();
  end if;

  update public.lms_join_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = v_admin
  where id = v_req.id;

  update public.lms_competitions
  set status = case when status = 'open' then 'active' else status end,
      updated_at = now()
  where id = v_req.competition_id;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.lms_admin_reject_join(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_req public.lms_join_requests%rowtype;
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

  update public.lms_join_requests
  set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin
  where id = v_req.id;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.lms_get_competition_join_codes(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_join text;
  v_rejoin text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.lms_can_handle_joins(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if not exists (select 1 from public.lms_competitions c where c.id = p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  select ac.code into v_join
  from public.lms_access_codes ac
  where ac.competition_id = p_competition_id
    and ac.type = 'join'
    and ac.is_active = true
  order by ac.created_at asc
  limit 1;

  select ac.code into v_rejoin
  from public.lms_access_codes ac
  where ac.competition_id = p_competition_id
    and ac.type = 'rejoin'
    and ac.is_active = true
  order by ac.created_at desc
  limit 1;

  return jsonb_build_object(
    'success', true,
    'join_code', v_join,
    'active_rejoin_code', v_rejoin
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Join-notify prefs + recipients include assigned managers (default ON)
-- ---------------------------------------------------------------------------

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
  v_is_manager boolean;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.lms_can_handle_joins(p_competition_id) then
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
  v_is_manager := public.lms_is_competition_manager(p_competition_id);

  select p.enabled into v_enabled
  from public.lms_join_notify_prefs p
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
      select 1 from public.lms_join_notify_prefs p
      where p.competition_id = p_competition_id and p.user_id = v_uid
    )
  );
end;
$$;

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

  if not public.lms_can_handle_joins(p_competition_id) then
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
    select c.created_by_user_id as user_id, true as default_on
    from public.lms_competitions c
    where c.id = p_competition_id
      and c.created_by_user_id is not null
    union
    select p.id as user_id, false as default_on
    from public.profiles p
    where p.role = 'Owner'
    union
    select m.user_id, true as default_on
    from public.lms_competition_managers m
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
    left join public.lms_join_notify_prefs pref
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
-- Home: surface is_manager / can_handle_joins
-- ---------------------------------------------------------------------------

create or replace function public.lms_get_home(p_season text default '2026/27')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_season text := coalesce(nullif(trim(p_season), ''), '2026/27');
  v_next_gw public.lms_gameweeks%rowtype;
  v_competitions jsonb := '[]'::jsonb;
  v_pending jsonb := '[]'::jsonb;
  v_fixtures jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object(
      'competitions', '[]'::jsonb,
      'pending', '[]'::jsonb,
      'next_up', jsonb_build_object('gameweek', null, 'fixtures', '[]'::jsonb)
    );
  end if;

  select coalesce(
    jsonb_agg(q.row_json order by q.joined_at desc),
    '[]'::jsonb
  )
  into v_competitions
  from (
    select
      p.joined_at,
      jsonb_build_object(
      'competition_id', c.id,
      'name', c.name,
      'season', c.season,
      'competition_status', c.status,
      'participant_status', p.status,
      'joined_at', p.joined_at,
      'rollover_count', p.rollover_count,
      'start_gameweek_id', c.start_gameweek_id,
      'start_gameweek_number', sg.number,
      'created_by_user_id', c.created_by_user_id,
      'is_creator', (c.created_by_user_id is not null and c.created_by_user_id = v_uid),
      'is_manager', exists (
        select 1 from public.lms_competition_managers cm
        where cm.competition_id = c.id and cm.user_id = v_uid
      ),
      'can_manage', (
        public.is_owner()
        or (c.created_by_user_id is not null and c.created_by_user_id = v_uid)
      ),
      'can_handle_joins', (
        public.is_owner()
        or (c.created_by_user_id is not null and c.created_by_user_id = v_uid)
        or exists (
          select 1 from public.lms_competition_managers cm
          where cm.competition_id = c.id and cm.user_id = v_uid
        )
      ),
      'total_count', (
        select count(*)::int
        from public.lms_participants xp
        where xp.competition_id = c.id
      ),
      'alive_count', (
        select count(*)::int
        from public.lms_participants xp
        where xp.competition_id = c.id
          and xp.status in ('active', 'winner')
      ),
      'current_gameweek_number', cgw.number,
      'pick_team', case
        when pk.team_id is null then null
        else jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'short_name', t.short_name,
          'slug', t.slug
        )
      end,
      'pick_available', (
        p.status = 'active'
        and cgw.id is not null
        and pk.id is null
      )
    ) as row_json
    from public.lms_participants p
    join public.lms_competitions c on c.id = p.competition_id
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    left join lateral (
      select gw.*
      from public.lms_gameweeks gw
      where gw.season = c.season
        and gw.number >= coalesce(sg.number, 1)
        and gw.status <> 'complete'
      order by gw.number asc
      limit 1
    ) cgw on true
    left join public.lms_picks pk
      on pk.competition_id = c.id
     and pk.user_id = v_uid
     and pk.gameweek_id = cgw.id
    left join public.lms_teams t on t.id = pk.team_id
    where p.user_id = v_uid
  ) q;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'competition_id', c.id,
        'name', c.name,
        'season', c.season,
        'requested_at', jr.created_at
      )
      order by jr.created_at desc
    ),
    '[]'::jsonb
  )
  into v_pending
  from public.lms_join_requests jr
  join public.lms_competitions c on c.id = jr.competition_id
  where jr.user_id = v_uid
    and jr.status = 'pending';

  select * into v_next_gw
  from public.lms_gameweeks gw
  where gw.season = v_season
    and gw.status <> 'complete'
  order by gw.number asc
  limit 1;

  if found then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'gameweek_id', f.gameweek_id,
          'kickoff_at', f.kickoff_at,
          'status', f.status,
          'excluded_from_lms', coalesce(f.excluded_from_lms, false),
          'home_team_id', f.home_team_id,
          'away_team_id', f.away_team_id,
          'home_team', jsonb_build_object(
            'id', ht.id,
            'name', ht.name,
            'short_name', ht.short_name,
            'slug', ht.slug
          ),
          'away_team', jsonb_build_object(
            'id', at.id,
            'name', at.name,
            'short_name', at.short_name,
            'slug', at.slug
          )
        )
        order by f.kickoff_at asc
      ),
      '[]'::jsonb
    )
    into v_fixtures
    from public.lms_fixtures f
    join public.lms_teams ht on ht.id = f.home_team_id
    join public.lms_teams at on at.id = f.away_team_id
    where f.gameweek_id = v_next_gw.id;
  end if;

  return jsonb_build_object(
    'competitions', v_competitions,
    'pending', v_pending,
    'next_up', jsonb_build_object(
      'gameweek', case
        when v_next_gw.id is null then null
        else jsonb_build_object(
          'id', v_next_gw.id,
          'season', v_next_gw.season,
          'number', v_next_gw.number,
          'deadline_at', v_next_gw.deadline_at,
          'starts_at', v_next_gw.starts_at,
          'status', v_next_gw.status
        )
      end,
      'fixtures', coalesce(v_fixtures, '[]'::jsonb)
    )
  );
end;
$$;
