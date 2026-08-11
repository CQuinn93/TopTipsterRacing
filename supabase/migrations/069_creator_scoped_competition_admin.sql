-- =============================================================================
-- Creator-scoped competition admin (LMS + Racing)
-- =============================================================================
-- Admins manage competitions they created; Owners manage all.
-- Fixture exclusions remain Owner-only (shared LMS calendar).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Helpers
-- ---------------------------------------------------------------------------

create or replace function public.lms_can_manage_competition(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
    or exists (
      select 1
      from public.lms_competitions c
      where c.id = p_competition_id
        and c.created_by_user_id = auth.uid()
    );
$$;

create or replace function public.racing_can_manage_competition(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
    or exists (
      select 1
      from public.competitions c
      where c.id = p_competition_id
        and c.created_by_user_id = auth.uid()
    );
$$;

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
      'is_creator', false,
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
      'is_creator', false,
      'created_by_user_id', null,
      'error', 'invalid_competition'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'can_manage', public.lms_can_manage_competition(p_competition_id),
    'is_creator', (v_created_by is not null and v_created_by = auth.uid()),
    'created_by_user_id', v_created_by
  );
end;
$$;

revoke all on function public.lms_can_manage_competition(uuid) from public;
revoke all on function public.racing_can_manage_competition(uuid) from public;
revoke all on function public.lms_can_manage_competition_rpc(uuid) from public;
grant execute on function public.lms_can_manage_competition(uuid) to authenticated;
grant execute on function public.racing_can_manage_competition(uuid) to authenticated;
grant execute on function public.lms_can_manage_competition_rpc(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) LMS: team pool / fixture exclusion / delete
-- ---------------------------------------------------------------------------

create or replace function public.lms_admin_set_competition_team(
  p_competition_id uuid,
  p_team_id uuid,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if not exists (select 1 from public.lms_competitions where id = p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if not exists (select 1 from public.lms_teams where id = p_team_id) then
    return jsonb_build_object('success', false, 'error', 'invalid_team');
  end if;

  if p_enabled then
    insert into public.lms_competition_teams (competition_id, team_id)
    values (p_competition_id, p_team_id)
    on conflict do nothing;
  else
    delete from public.lms_used_teams u
    using public.lms_picks pk
    where u.competition_id = p_competition_id
      and u.team_id = p_team_id
      and pk.competition_id = u.competition_id
      and pk.user_id = u.user_id
      and pk.team_id = p_team_id
      and pk.gameweek_id = u.gameweek_id
      and pk.result = 'pending';

    delete from public.lms_picks
    where competition_id = p_competition_id
      and team_id = p_team_id
      and result = 'pending';

    delete from public.lms_competition_teams
    where competition_id = p_competition_id and team_id = p_team_id;
  end if;

  return jsonb_build_object('success', true, 'enabled', p_enabled);
end;
$$;

create or replace function public.lms_admin_set_fixture_excluded(
  p_fixture_id uuid,
  p_excluded boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fx public.lms_fixtures%rowtype;
begin
  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select * into v_fx from public.lms_fixtures where id = p_fixture_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_fixture');
  end if;

  update public.lms_fixtures
  set
    excluded_from_lms = p_excluded,
    excluded_reason = case
      when p_excluded then nullif(trim(coalesce(p_reason, '')), '')
      else null
    end,
    excluded_at = case when p_excluded then now() else null end,
    excluded_by = case when p_excluded then auth.uid() else null end
  where id = p_fixture_id;

  if p_excluded then
    delete from public.lms_used_teams u
    using public.lms_picks pk
    where pk.gameweek_id = v_fx.gameweek_id
      and pk.result = 'pending'
      and pk.team_id in (v_fx.home_team_id, v_fx.away_team_id)
      and u.competition_id = pk.competition_id
      and u.user_id = pk.user_id
      and u.team_id = pk.team_id
      and u.gameweek_id = pk.gameweek_id;

    delete from public.lms_picks
    where gameweek_id = v_fx.gameweek_id
      and result = 'pending'
      and team_id in (v_fx.home_team_id, v_fx.away_team_id);
  end if;

  return jsonb_build_object('success', true, 'excluded', p_excluded);
end;
$$;

create or replace function public.lms_admin_delete_competition(p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select name into v_name from public.lms_competitions where id = p_competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  delete from public.lms_competitions where id = p_competition_id;

  return jsonb_build_object('success', true, 'name', v_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) LMS: list competitions / pending (creator-scoped)
-- ---------------------------------------------------------------------------

create or replace function public.lms_admin_list_competitions(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_is_owner boolean;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return '[]'::jsonb;
  end if;

  v_is_owner := public.is_owner();

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'season', c.season,
          'status', c.status,
          'created_at', c.created_at,
          'created_by_user_id', c.created_by_user_id,
          'creator_username', p.username,
          'start_gameweek_id', c.start_gameweek_id,
          'start_gameweek_number', sg.number,
          'join_code', (
            select ac.code from public.lms_access_codes ac
            where ac.competition_id = c.id and ac.type = 'join' and ac.is_active = true
            order by ac.created_at asc
            limit 1
          ),
          'active_rejoin_code', (
            select ac.code from public.lms_access_codes ac
            where ac.competition_id = c.id and ac.type = 'rejoin' and ac.is_active = true
            order by ac.created_at desc
            limit 1
          ),
          'participant_count', (
            select count(*)::int from public.lms_participants lp where lp.competition_id = c.id
          ),
          'active_count', (
            select count(*)::int from public.lms_participants lp
            where lp.competition_id = c.id and lp.status = 'active'
          )
        )
        order by c.created_at desc
      ),
      '[]'::jsonb
    )
    from public.lms_competitions c
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    left join public.profiles p on p.id = c.created_by_user_id
    where v_is_owner
       or c.created_by_user_id = auth.uid()
  );
end;
$$;

create or replace function public.lms_admin_list_pending(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
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
    where r.status = 'pending'
      and public.lms_can_manage_competition(r.competition_id)
  );
end;
$$;

create or replace function public.lms_admin_list_pending_for_competition(p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.lms_can_manage_competition(p_competition_id) then
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

revoke all on function public.lms_admin_list_pending_for_competition(uuid) from public;
grant execute on function public.lms_admin_list_pending_for_competition(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) LMS: approve / reject / rejoin code (can_manage after load)
-- ---------------------------------------------------------------------------

create or replace function public.lms_admin_approve_join(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_req public.lms_join_requests%rowtype;
  v_ac public.lms_access_codes%rowtype;
  v_gw public.lms_gameweeks%rowtype;
  v_rollover int := 0;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select * into v_req from public.lms_join_requests where id = p_request_id and status = 'pending';
  if not found then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;

  if not public.lms_can_manage_competition(v_req.competition_id) then
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
  v_admin uuid;
  v_req public.lms_join_requests%rowtype;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select * into v_req from public.lms_join_requests where id = p_request_id and status = 'pending';
  if not found then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;

  if not public.lms_can_manage_competition(v_req.competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  update public.lms_join_requests
  set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin
  where id = v_req.id;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.lms_admin_create_rejoin_code(
  p_code text,
  p_competition_id uuid,
  p_gameweek_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_gw public.lms_gameweeks%rowtype;
  v_access char(6);
  v_attempts int := 0;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select * into v_gw from public.lms_gameweeks where id = p_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_gameweek');
  end if;
  if now() >= v_gw.starts_at then
    return jsonb_build_object('success', false, 'error', 'gameweek_already_started');
  end if;

  update public.lms_access_codes
  set is_active = false, voided_at = coalesce(voided_at, now())
  where competition_id = p_competition_id and type = 'rejoin' and is_active = true;

  loop
    v_access := public.lms_generate_access_code();
    begin
      insert into public.lms_access_codes (
        competition_id, code, type, valid_for_gameweek_id, created_by_user_id
      ) values (p_competition_id, v_access, 'rejoin', p_gameweek_id, v_admin);
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 20 then
        return jsonb_build_object('success', false, 'error', 'code_generation_failed');
      end if;
    end;
  end loop;

  return jsonb_build_object('success', true, 'access_code', v_access, 'gameweek_id', p_gameweek_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) LMS: create competition — auto-add creator as participant
-- ---------------------------------------------------------------------------

create or replace function public.lms_admin_create_competition(
  p_code text,
  p_name text,
  p_start_gameweek_id uuid,
  p_season text default '2026/27'
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
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

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

  insert into public.lms_competitions (name, season, status, created_by_user_id, start_gameweek_id)
  values (trim(p_name), v_season, 'open', v_admin, p_start_gameweek_id)
  returning id into v_comp_id;

  insert into public.lms_competition_teams (competition_id, team_id)
  select v_comp_id, t.id from public.lms_teams t
  on conflict do nothing;

  insert into public.lms_participants (competition_id, user_id, status, joined_at)
  values (v_comp_id, v_admin, 'active', now())
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
    'start_gameweek_number', v_gw.number
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) LMS: get_home — creator / can_manage flags on participant rows
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
      'can_manage', (
        public.is_owner()
        or (c.created_by_user_id is not null and c.created_by_user_id = v_uid)
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

-- ---------------------------------------------------------------------------
-- 7) LMS: admin submit pick on behalf of a participant
-- ---------------------------------------------------------------------------

create or replace function public.lms_admin_submit_pick_for_user(
  p_competition_id uuid,
  p_user_id uuid,
  p_gameweek_id uuid,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part public.lms_participants%rowtype;
  v_gw public.lms_gameweeks%rowtype;
  v_comp public.lms_competitions%rowtype;
  v_start public.lms_gameweeks%rowtype;
  v_plays boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_required');
  end if;

  select * into v_comp from public.lms_competitions where id = p_competition_id;
  if not found or v_comp.status = 'completed' then
    return jsonb_build_object('success', false, 'error', 'competition_unavailable');
  end if;

  select * into v_part
  from public.lms_participants
  where competition_id = p_competition_id and user_id = p_user_id;
  if not found or v_part.status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'not_active');
  end if;

  select * into v_gw from public.lms_gameweeks where id = p_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_gameweek');
  end if;

  if v_comp.start_gameweek_id is not null then
    select * into v_start from public.lms_gameweeks where id = v_comp.start_gameweek_id;
    if found then
      if v_gw.season <> v_start.season or v_gw.number < v_start.number then
        return jsonb_build_object('success', false, 'error', 'before_competition_start');
      end if;
    end if;
  end if;

  if now() >= v_gw.deadline_at then
    return jsonb_build_object('success', false, 'error', 'deadline_passed');
  end if;

  if not exists (
    select 1 from public.lms_competition_teams
    where competition_id = p_competition_id and team_id = p_team_id
  ) then
    return jsonb_build_object('success', false, 'error', 'team_not_in_pool');
  end if;

  if exists (
    select 1 from public.lms_used_teams
    where competition_id = p_competition_id and user_id = p_user_id and team_id = p_team_id
  ) then
    return jsonb_build_object('success', false, 'error', 'team_already_used');
  end if;

  select exists (
    select 1 from public.lms_fixtures f
    where f.gameweek_id = p_gameweek_id
      and coalesce(f.excluded_from_lms, false) = false
      and (f.home_team_id = p_team_id or f.away_team_id = p_team_id)
  ) into v_plays;

  if not v_plays then
    return jsonb_build_object('success', false, 'error', 'team_not_playing');
  end if;

  insert into public.lms_picks (competition_id, user_id, gameweek_id, team_id, result, updated_at)
  values (p_competition_id, p_user_id, p_gameweek_id, p_team_id, 'pending', now())
  on conflict (competition_id, user_id, gameweek_id) do update
    set team_id = excluded.team_id,
        result = 'pending',
        updated_at = now()
  where lms_picks.result = 'pending';

  if not exists (
    select 1 from public.lms_picks
    where competition_id = p_competition_id
      and user_id = p_user_id
      and gameweek_id = p_gameweek_id
      and team_id = p_team_id
      and result = 'pending'
  ) then
    return jsonb_build_object('success', false, 'error', 'pick_locked');
  end if;

  delete from public.lms_used_teams
  where competition_id = p_competition_id
    and user_id = p_user_id
    and gameweek_id = p_gameweek_id;

  insert into public.lms_used_teams (competition_id, user_id, team_id, gameweek_id)
  values (p_competition_id, p_user_id, p_team_id, p_gameweek_id)
  on conflict (competition_id, user_id, team_id) do update
    set gameweek_id = excluded.gameweek_id;

  if v_comp.status = 'open' then
    update public.lms_competitions set status = 'active', updated_at = now() where id = v_comp.id;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.lms_admin_submit_pick_for_user(uuid, uuid, uuid, uuid) from public;
grant execute on function public.lms_admin_submit_pick_for_user(uuid, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Racing: list / create / delete / pending / selections
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_competitions(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_is_owner boolean;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return '[]'::jsonb;
  end if;

  v_is_owner := public.is_owner();

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'access_code', c.access_code,
          'festival_start_date', c.festival_start_date,
          'festival_end_date', c.festival_end_date,
          'created_by_user_id', c.created_by_user_id,
          'creator_username', p.username,
          'display_status',
            case
              when current_date < c.festival_start_date then 'upcoming'
              when current_date >= c.festival_start_date and current_date <= c.festival_end_date then 'live'
              else 'complete'
            end
        )
        order by c.festival_start_date desc
      ),
      '[]'::jsonb
    )
    from public.competitions c
    left join public.profiles p on p.id = c.created_by_user_id
    where v_is_owner
       or c.created_by_user_id is null
       or c.created_by_user_id = v_admin
  );
end;
$$;

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
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
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
    created_by_user_id
  ) values (
    trim(p_name),
    p_festival_start_date,
    p_festival_end_date,
    coalesce(p_selection_open_utc, '10:00'::time),
    coalesce(p_selection_close_minutes_before_first_race, 60),
    v_code,
    v_admin
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

  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

create or replace function public.admin_delete_competition(p_code text, p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_name text;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if not public.racing_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select name into v_name from public.competitions where id = p_competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  -- Children cascade via FK (participants, join requests, race days, selections, etc.)
  delete from public.competitions where id = p_competition_id;

  return jsonb_build_object('success', true, 'name', v_name);
end;
$$;

revoke all on function public.admin_delete_competition(text, uuid) from public;
grant execute on function public.admin_delete_competition(text, uuid) to authenticated;

create or replace function public.admin_list_pending(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'competition_id', r.competition_id,
      'competition_name', c.name,
      'user_id', r.user_id,
      'display_name', r.display_name,
      'created_at', r.created_at
    ) order by r.created_at desc), '[]'::jsonb)
    from public.competition_join_requests r
    join public.competitions c on c.id = r.competition_id
    where r.status = 'pending'
      and public.racing_can_manage_competition(r.competition_id)
  );
end;
$$;

create or replace function public.admin_list_pending_for_competition(p_code text, p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return '[]'::jsonb;
  end if;

  if not public.racing_can_manage_competition(p_competition_id) then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'competition_id', r.competition_id,
      'competition_name', c.name,
      'user_id', r.user_id,
      'display_name', r.display_name,
      'created_at', r.created_at
    ) order by r.created_at desc), '[]'::jsonb)
    from public.competition_join_requests r
    join public.competitions c on c.id = r.competition_id
    where r.competition_id = p_competition_id
      and r.status = 'pending'
  );
end;
$$;

revoke all on function public.admin_list_pending_for_competition(text, uuid) from public;
grant execute on function public.admin_list_pending_for_competition(text, uuid) to authenticated;

create or replace function public.admin_approve_request(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.competition_join_requests%rowtype;
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
  insert into public.competition_participants (competition_id, user_id, display_name)
  values (v_req.competition_id, v_req.user_id, v_req.display_name)
  on conflict (competition_id, user_id) do update set display_name = excluded.display_name;
  update public.competition_join_requests set status = 'approved', reviewed_at = now() where id = p_request_id;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_reject_request(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.competition_join_requests%rowtype;
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

  update public.competition_join_requests
  set status = 'rejected', reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_list_selections(p_code text, p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return '[]'::jsonb;
  end if;

  if not public.racing_can_manage_competition(p_competition_id) then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'display_name', p.display_name,
      'race_date', s.race_date,
      'selections', s.selections
    ) order by s.race_date, p.display_name), '[]'::jsonb)
    from public.daily_selections s
    join public.competition_participants p on p.competition_id = s.competition_id and p.user_id = s.user_id
    where s.competition_id = p_competition_id
  );
end;
$$;

create or replace function public.admin_update_selection(
  p_code text,
  p_selection_id uuid,
  p_selections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competition_id uuid;
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select competition_id into v_competition_id
  from public.daily_selections
  where id = p_selection_id;

  if v_competition_id is null then
    return jsonb_build_object('success', false, 'error', 'selection_not_found');
  end if;

  if not public.racing_can_manage_competition(v_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  perform set_config('app.allow_backfill', 'true', true);

  update public.daily_selections
  set selections = p_selections, updated_at = now()
  where id = p_selection_id;

  perform set_config('app.allow_backfill', '', true);

  if not found then
    return jsonb_build_object('success', false, 'error', 'selection_not_found');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) Owner list — include LMS created_by_user_id / creator_username
-- ---------------------------------------------------------------------------

create or replace function public.owner_list_competitions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_racing jsonb;
  v_lms jsonb;
begin
  if not public.is_owner() then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sport', 'racing',
        'id', c.id,
        'name', c.name,
        'status',
          case
            when current_date < c.festival_start_date then 'upcoming'
            when current_date >= c.festival_start_date and current_date <= c.festival_end_date then 'live'
            else 'complete'
          end,
        'join_code', c.access_code,
        'rejoin_code', null,
        'festival_start_date', c.festival_start_date,
        'festival_end_date', c.festival_end_date,
        'created_by_user_id', c.created_by_user_id,
        'creator_username', p.username,
        'participant_count', (
          select count(*)::int from public.competition_participants cp
          where cp.competition_id = c.id
        )
      )
      order by c.festival_start_date desc nulls last, c.name
    ),
    '[]'::jsonb
  )
  into v_racing
  from public.competitions c
  left join public.profiles p on p.id = c.created_by_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sport', 'lms',
        'id', c.id,
        'name', c.name,
        'status', c.status,
        'join_code', (
          select ac.code from public.lms_access_codes ac
          where ac.competition_id = c.id and ac.type = 'join' and ac.is_active = true
          order by ac.created_at asc
          limit 1
        ),
        'rejoin_code', (
          select ac.code from public.lms_access_codes ac
          where ac.competition_id = c.id and ac.type = 'rejoin' and ac.is_active = true
          order by ac.created_at desc
          limit 1
        ),
        'season', c.season,
        'created_at', c.created_at,
        'created_by_user_id', c.created_by_user_id,
        'creator_username', p.username,
        'participant_count', (
          select count(*)::int from public.lms_participants lp where lp.competition_id = c.id
        ),
        'active_count', (
          select count(*)::int from public.lms_participants lp
          where lp.competition_id = c.id and lp.status = 'active'
        )
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_lms
  from public.lms_competitions c
  left join public.profiles p on p.id = c.created_by_user_id;

  return coalesce(v_racing, '[]'::jsonb) || coalesce(v_lms, '[]'::jsonb);
end;
$$;
