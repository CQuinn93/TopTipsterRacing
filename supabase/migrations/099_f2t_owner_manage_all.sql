-- Owner can open/manage all F2T competitions; owner_list includes F2T.

-- ---------------------------------------------------------------------------
-- f2t_get_competition: allow creators / Owners / assigned managers without
-- requiring a participant row.
-- ---------------------------------------------------------------------------

create or replace function public.f2t_get_competition(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.f2t_competitions%rowtype;
  v_part public.f2t_participants%rowtype;
  v_sg public.lms_gameweeks%rowtype;
  v_selections jsonb;
  v_leaderboard jsonb;
  v_unscored int := 0;
  v_completed_gws int := 0;
  v_sub_eligible_regular boolean := false;
  v_join_open boolean;
  v_has_part boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_comp from public.f2t_competitions where id = p_competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if not (
    public.f2t_is_competition_member(p_competition_id)
    or public.f2t_can_handle_joins(p_competition_id)
  ) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select * into v_part
  from public.f2t_participants
  where competition_id = p_competition_id and user_id = v_uid;
  v_has_part := found;

  select * into v_sg from public.lms_gameweeks where id = v_comp.start_gameweek_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slot', s.slot,
        'player_id', s.player_id,
        'display_name', fp.display_name,
        'team_id', fp.team_id,
        'team_name', t.name,
        'team_short_name', t.short_name,
        'team_slug', t.slug,
        'scored_at', s.scored_at,
        'scored_gameweek_id', s.scored_gameweek_id,
        'owner_flagged', fp.owner_flagged
      )
      order by s.slot
    ),
    '[]'::jsonb
  )
  into v_selections
  from public.f2t_selections s
  join public.football_players fp on fp.id = s.player_id
  join public.lms_teams t on t.id = fp.team_id
  where s.competition_id = p_competition_id and s.user_id = v_uid;

  select count(*)::int into v_unscored
  from public.f2t_selections s
  where s.competition_id = p_competition_id
    and s.user_id = v_uid
    and s.scored_at is null;

  select count(*)::int into v_completed_gws
  from public.lms_gameweeks gw
  where gw.season = v_comp.season
    and gw.number >= coalesce(v_sg.number, 1)
    and gw.status = 'complete';

  v_sub_eligible_regular := (
    v_has_part
    and v_part.status = 'active'
    and not coalesce(v_part.regular_sub_used, false)
    and v_completed_gws >= 3
    and v_unscored > 3
  );

  v_join_open := public.f2t_competition_join_open(p_competition_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'username', pr.username,
        'status', p.status,
        'scored_count', (
          select count(*)::int
          from public.f2t_selections s
          where s.competition_id = p.competition_id
            and s.user_id = p.user_id
            and s.scored_at is not null
        ),
        'completed_at', p.completed_at
      )
      order by
        case when p.status = 'winner' then 0 else 1 end,
        (
          select count(*)::int
          from public.f2t_selections s
          where s.competition_id = p.competition_id
            and s.user_id = p.user_id
            and s.scored_at is not null
        ) desc,
        p.completed_at nulls last
    ),
    '[]'::jsonb
  )
  into v_leaderboard
  from public.f2t_participants p
  left join public.profiles pr on pr.id = p.user_id
  where p.competition_id = p_competition_id;

  return jsonb_build_object(
    'success', true,
    'competition', jsonb_build_object(
      'id', v_comp.id,
      'name', v_comp.name,
      'season', v_comp.season,
      'status', v_comp.status,
      'entry', v_comp.entry,
      'start_gameweek_id', v_comp.start_gameweek_id,
      'start_gameweek_number', v_sg.number,
      'start_gameweek_deadline', v_sg.deadline_at,
      'join_open', v_join_open
    ),
    'participant', case
      when v_has_part then jsonb_build_object(
        'status', v_part.status,
        'regular_sub_used', v_part.regular_sub_used,
        'completed_at', v_part.completed_at,
        'scored_count', (
          select count(*)::int
          from public.f2t_selections s
          where s.competition_id = p_competition_id
            and s.user_id = v_uid
            and s.scored_at is not null
        ),
        'unscored_count', v_unscored,
        'selection_count', jsonb_array_length(v_selections),
        'sub_eligible_regular', v_sub_eligible_regular
      )
      else null
    end,
    'selections', v_selections,
    'leaderboard', v_leaderboard,
    'permissions', public.f2t_can_manage_competition_rpc(p_competition_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- f2t_get_home: Owners also see every competition they can manage
-- ---------------------------------------------------------------------------

create or replace function public.f2t_get_home(p_season text default '2026/27')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_season text := coalesce(nullif(trim(p_season), ''), '2026/27');
  v_competitions jsonb := '[]'::jsonb;
  v_pending jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('competitions', '[]'::jsonb, 'pending', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(q.row_json order by q.sort_at desc), '[]'::jsonb)
  into v_competitions
  from (
    select
      coalesce(p.joined_at, c.created_at) as sort_at,
      jsonb_build_object(
        'competition_id', c.id,
        'name', c.name,
        'season', c.season,
        'competition_status', c.status,
        'participant_status', coalesce(p.status, 'observer'),
        'entry', c.entry,
        'joined_at', p.joined_at,
        'start_gameweek_id', c.start_gameweek_id,
        'start_gameweek_number', sg.number,
        'scored_count', (
          select count(*)::int
          from public.f2t_selections s
          where s.competition_id = c.id
            and s.user_id = v_uid
            and s.scored_at is not null
        ),
        'selection_count', (
          select count(*)::int
          from public.f2t_selections s
          where s.competition_id = c.id and s.user_id = v_uid
        ),
        'selections_locked', (
          select count(*)::int >= 20
          from public.f2t_selections s
          where s.competition_id = c.id and s.user_id = v_uid
        ),
        'can_manage', public.f2t_can_manage_competition(c.id),
        'is_manager', public.f2t_is_competition_manager(c.id)
      ) as row_json
    from public.f2t_competitions c
    left join public.f2t_participants p
      on p.competition_id = c.id and p.user_id = v_uid
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    where c.season = v_season
      and (
        p.user_id is not null
        or public.f2t_can_manage_competition(c.id)
      )
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
  from public.f2t_join_requests jr
  join public.f2t_competitions c on c.id = jr.competition_id
  where jr.user_id = v_uid and jr.status = 'pending';

  return jsonb_build_object('competitions', v_competitions, 'pending', v_pending);
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete F2T competition (creator / Owner)
-- ---------------------------------------------------------------------------

create or replace function public.f2t_admin_delete_competition(p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.uid() is null then
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

  delete from public.f2t_competitions where id = p_competition_id;

  return jsonb_build_object('success', true, 'name', v_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- owner_list_competitions: include F2T
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
  v_f2t jsonb;
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sport', 'f2t',
        'id', c.id,
        'name', c.name,
        'status', c.status,
        'join_code', (
          select ac.code from public.f2t_access_codes ac
          where ac.competition_id = c.id and ac.type = 'join' and ac.is_active = true
          order by ac.created_at asc
          limit 1
        ),
        'rejoin_code', null,
        'season', c.season,
        'created_at', c.created_at,
        'created_by_user_id', c.created_by_user_id,
        'creator_username', p.username,
        'participant_count', (
          select count(*)::int from public.f2t_participants fp where fp.competition_id = c.id
        ),
        'active_count', (
          select count(*)::int from public.f2t_participants fp
          where fp.competition_id = c.id and fp.status = 'active'
        )
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_f2t
  from public.f2t_competitions c
  left join public.profiles p on p.id = c.created_by_user_id;

  return coalesce(v_racing, '[]'::jsonb)
    || coalesce(v_lms, '[]'::jsonb)
    || coalesce(v_f2t, '[]'::jsonb);
end;
$$;

revoke all on function public.f2t_admin_delete_competition(uuid) from public;
grant execute on function public.f2t_admin_delete_competition(uuid) to authenticated;
