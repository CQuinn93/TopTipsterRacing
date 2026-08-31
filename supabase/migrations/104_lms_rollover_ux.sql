-- LMS rollover UX: expose active rejoin codes to participants + home list flag.

-- ---------------------------------------------------------------------------
-- Participant-safe rejoin info (not manager-only)
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
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_competition_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  select exists (
    select 1 from public.lms_participants p
    where p.competition_id = p_competition_id and p.user_id = v_uid
  ) or public.lms_can_handle_joins(p_competition_id)
  into v_is_member;

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

  return jsonb_build_object(
    'success', true,
    'has_active_rejoin', v_code is not null,
    'active_rejoin_code', v_code,
    'rejoin_valid_for_gameweek_id', v_gw_id,
    'rejoin_valid_for_gameweek_number', v_gw_number
  );
end;
$$;

revoke all on function public.lms_get_competition_rejoin_info(uuid) from public;
grant execute on function public.lms_get_competition_rejoin_info(uuid) to authenticated;
grant execute on function public.lms_get_competition_rejoin_info(uuid) to service_role;

comment on function public.lms_get_competition_rejoin_info(uuid) is
  'Active LMS rejoin/rollover code for participants (and managers).';

-- ---------------------------------------------------------------------------
-- Home list: include rollover / rejoin flags
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
      'active_rejoin_code', (
        select ac.code
        from public.lms_access_codes ac
        where ac.competition_id = c.id
          and ac.type = 'rejoin'
          and ac.is_active = true
        order by ac.created_at desc nulls last
        limit 1
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
