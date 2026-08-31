-- LMS rollover: former players rejoin with a button; newcomers use the rejoin code.
-- Admin pending list labels (new) vs (re entry).

-- ---------------------------------------------------------------------------
-- Former participant: request rejoin without typing the code
-- ---------------------------------------------------------------------------

create or replace function public.lms_request_rejoin(p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.lms_competitions%rowtype;
  v_part public.lms_participants%rowtype;
  v_code public.lms_access_codes%rowtype;
  v_gw public.lms_gameweeks%rowtype;
  v_request_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if public.is_profile_banned(v_uid) then
    return jsonb_build_object('success', false, 'error', 'account_banned');
  end if;

  if p_competition_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  select * into v_comp from public.lms_competitions where id = p_competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if v_comp.status = 'completed' then
    return jsonb_build_object('success', false, 'error', 'competition_completed');
  end if;

  select * into v_part
  from public.lms_participants
  where competition_id = p_competition_id and user_id = v_uid;

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_a_member');
  end if;

  if v_part.status in ('active', 'winner') then
    return jsonb_build_object('success', false, 'error', 'already_in', 'competition_name', v_comp.name);
  end if;

  select * into v_code
  from public.lms_access_codes
  where competition_id = p_competition_id
    and type = 'rejoin'
    and is_active = true
    and voided_at is null
  order by created_at desc nulls last
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'no_active_rejoin');
  end if;

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

  if exists (
    select 1 from public.lms_join_requests
    where competition_id = p_competition_id
      and user_id = v_uid
      and status = 'pending'
  ) then
    select id into v_request_id
    from public.lms_join_requests
    where competition_id = p_competition_id
      and user_id = v_uid
      and status = 'pending'
    limit 1;

    return jsonb_build_object(
      'success', true,
      'status', 'pending',
      'competition_name', v_comp.name,
      'competition_id', v_comp.id,
      'join_request_id', v_request_id,
      'is_reentry', true
    );
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
    'join_request_id', v_request_id,
    'is_reentry', true
  );
end;
$$;

revoke all on function public.lms_request_rejoin(uuid) from public;
grant execute on function public.lms_request_rejoin(uuid) to authenticated;

comment on function public.lms_request_rejoin(uuid) is
  'Former LMS participant requests re-entry during an active rollover (no code).';

-- ---------------------------------------------------------------------------
-- Pending list: mark (new) vs (re entry)
-- ---------------------------------------------------------------------------

create or replace function public.lms_admin_list_pending_for_competition(p_competition_id uuid)
returns jsonb
language plpgsql
stable
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
          'created_at', r.created_at,
          'is_reentry', exists (
            select 1
            from public.lms_participants xp
            where xp.competition_id = r.competition_id
              and xp.user_id = r.user_id
          ),
          'request_kind', case
            when exists (
              select 1
              from public.lms_participants xp
              where xp.competition_id = r.competition_id
                and xp.user_id = r.user_id
            ) then 're_entry'
            else 'new'
          end
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

-- ---------------------------------------------------------------------------
-- Rejoin info for Standing: former player vs code-only newcomer path
-- ---------------------------------------------------------------------------

create or replace function public.lms_get_competition_rejoin_info(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_gw_id uuid;
  v_gw_number int;
  v_is_member boolean := false;
  v_part_status text;
  v_pending boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_competition_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  select p.status into v_part_status
  from public.lms_participants p
  where p.competition_id = p_competition_id and p.user_id = v_uid;

  v_is_member := found or public.lms_can_handle_joins(p_competition_id);

  if not v_is_member then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select ac.code, ac.valid_for_gameweek_id
  into v_code, v_gw_id
  from public.lms_access_codes ac
  where ac.competition_id = p_competition_id
    and ac.type = 'rejoin'
    and ac.is_active = true
  order by ac.created_at desc nulls last
  limit 1;

  if v_gw_id is not null then
    select number into v_gw_number from public.lms_gameweeks where id = v_gw_id;
  end if;

  select exists (
    select 1 from public.lms_join_requests jr
    where jr.competition_id = p_competition_id
      and jr.user_id = v_uid
      and jr.status = 'pending'
  ) into v_pending;

  return jsonb_build_object(
    'success', true,
    'has_active_rejoin', v_code is not null,
    'active_rejoin_code', case
      when public.lms_can_handle_joins(p_competition_id) then v_code
      else null
    end,
    'rejoin_valid_for_gameweek_id', v_gw_id,
    'rejoin_valid_for_gameweek_number', v_gw_number,
    'is_former_participant', v_part_status is not null,
    'participant_status', v_part_status,
    'can_request_rejoin', (
      v_code is not null
      and v_part_status is not null
      and v_part_status not in ('active', 'winner')
      and not v_pending
    ),
    'has_pending_rejoin', v_pending
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Home: pending rejoin + only show rollover while not yet active again
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
      ),
      'has_active_rejoin', exists (
        select 1 from public.lms_access_codes ac
        where ac.competition_id = c.id
          and ac.type = 'rejoin'
          and ac.is_active = true
      ),
      'has_pending_rejoin', exists (
        select 1 from public.lms_join_requests jr
        where jr.competition_id = c.id
          and jr.user_id = v_uid
          and jr.status = 'pending'
      ),
      'show_rollover_label', (
        p.status not in ('active', 'winner')
        and exists (
          select 1 from public.lms_access_codes ac
          where ac.competition_id = c.id
            and ac.type = 'rejoin'
            and ac.is_active = true
        )
      ),
      'rejoin_valid_for_gameweek_number', (
        select gw.number
        from public.lms_access_codes ac
        join public.lms_gameweeks gw on gw.id = ac.valid_for_gameweek_id
        where ac.competition_id = c.id
          and ac.type = 'rejoin'
          and ac.is_active = true
        order by ac.created_at desc nulls last
        limit 1
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
          'home_goals', f.home_goals,
          'away_goals', f.away_goals,
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

grant execute on function public.lms_get_home(text) to authenticated;
grant execute on function public.lms_get_home(text) to service_role;
