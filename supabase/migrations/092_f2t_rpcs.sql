-- =============================================================================
-- First2Twenty RPCs: join, gameplay, owner player flags
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Join flow
-- ---------------------------------------------------------------------------

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
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if public.is_profile_banned(v_uid) then
    return jsonb_build_object('success', false, 'error', 'account_banned');
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

  update public.f2t_competitions
  set status = case when status = 'open' then 'active' else status end,
      updated_at = now()
  where id = v_req.competition_id;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.f2t_admin_reject_join(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_req public.f2t_join_requests%rowtype;
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

  update public.f2t_join_requests
  set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin
  where id = v_req.id;

  return jsonb_build_object('success', true);
end;
$$;

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

  insert into public.f2t_competitions (
    name, season, status, created_by_user_id, start_gameweek_id, entry
  )
  values (
    trim(p_name), v_season, 'open', v_admin, p_start_gameweek_id,
    nullif(trim(coalesce(p_entry, '')), '')
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
    'start_gameweek_number', v_gw.number
  );
end;
$$;

create or replace function public.f2t_set_competition_entry(
  p_competition_id uuid,
  p_entry text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.f2t_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  update public.f2t_competitions
  set entry = nullif(trim(coalesce(p_entry, '')), ''),
      updated_at = now()
  where id = p_competition_id;

  return jsonb_build_object('success', true, 'entry', nullif(trim(coalesce(p_entry, '')), ''));
end;
$$;

create or replace function public.f2t_can_manage_competition_rpc(p_competition_id uuid)
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

  select c.created_by_user_id into v_created_by
  from public.f2t_competitions c where c.id = p_competition_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  return jsonb_build_object(
    'success', true,
    'can_manage', public.f2t_can_manage_competition(p_competition_id),
    'can_handle_joins', public.f2t_can_handle_joins(p_competition_id),
    'is_creator', (v_created_by is not null and v_created_by = auth.uid()),
    'is_manager', public.f2t_is_competition_manager(p_competition_id),
    'created_by_user_id', v_created_by
  );
end;
$$;

create or replace function public.f2t_admin_list_pending_for_competition(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.f2t_can_handle_joins(p_competition_id) then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', jr.id,
          'competition_id', jr.competition_id,
          'user_id', jr.user_id,
          'username', pr.username,
          'created_at', jr.created_at
        )
        order by jr.created_at asc
      )
      from public.f2t_join_requests jr
      left join public.profiles pr on pr.id = jr.user_id
      where jr.competition_id = p_competition_id and jr.status = 'pending'
    ),
    '[]'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Read: home + competition + selectable players
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

  select coalesce(jsonb_agg(q.row_json order by q.joined_at desc), '[]'::jsonb)
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
    from public.f2t_participants p
    join public.f2t_competitions c on c.id = p.competition_id
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
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
  from public.f2t_join_requests jr
  join public.f2t_competitions c on c.id = jr.competition_id
  where jr.user_id = v_uid and jr.status = 'pending';

  return jsonb_build_object('competitions', v_competitions, 'pending', v_pending);
end;
$$;

create or replace function public.f2t_list_selectable_players(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.f2t_is_competition_member(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  return jsonb_build_object(
    'success', true,
    'players', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', fp.id,
            'display_name', fp.display_name,
            'full_name', fp.full_name,
            'team_id', fp.team_id,
            'team_name', t.name,
            'team_short_name', t.short_name,
            'team_slug', t.slug,
            'picker_stats', fp.picker_stats,
            'owner_flagged', fp.owner_flagged,
            'already_scored_for_comp', public.f2t_player_scored_since_start(p_competition_id, fp.id)
          )
          order by t.name, fp.display_name
        )
        from public.football_players fp
        join public.lms_teams t on t.id = fp.team_id
        where fp.is_active = true
          and fp.owner_flagged = false
          and not public.f2t_player_scored_since_start(p_competition_id, fp.id)
      ),
      '[]'::jsonb
    )
  );
end;
$$;

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
  v_unscored int;
  v_completed_gws int;
  v_sub_eligible_regular boolean := false;
  v_join_open boolean;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_comp from public.f2t_competitions where id = p_competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if not public.f2t_is_competition_member(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select * into v_part
  from public.f2t_participants
  where competition_id = p_competition_id and user_id = v_uid;

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
    v_part.status = 'active'
    and not v_part.regular_sub_used
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
          select count(*) from public.f2t_selections s
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
    'participant', jsonb_build_object(
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
    ),
    'selections', v_selections,
    'leaderboard', v_leaderboard,
    'permissions', public.f2t_can_manage_competition_rpc(p_competition_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Gameplay: submit selections, substitutions, apply goals
-- ---------------------------------------------------------------------------

create or replace function public.f2t_submit_selections(
  p_competition_id uuid,
  p_player_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.f2t_competitions%rowtype;
  v_sg public.lms_gameweeks%rowtype;
  v_pid uuid;
  v_slot int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_comp from public.f2t_competitions where id = p_competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if not exists (
    select 1 from public.f2t_participants
    where competition_id = p_competition_id and user_id = v_uid and status = 'active'
  ) then
    return jsonb_build_object('success', false, 'error', 'not_participant');
  end if;

  select * into v_sg from public.lms_gameweeks where id = v_comp.start_gameweek_id;

  if now() >= v_sg.deadline_at then
    return jsonb_build_object('success', false, 'error', 'deadline_passed');
  end if;

  if coalesce(array_length(p_player_ids, 1), 0) <> 20 then
    return jsonb_build_object('success', false, 'error', 'invalid_count');
  end if;

  if exists (
    select pid from unnest(p_player_ids) as pid
    group by pid having count(*) > 1
  ) then
    return jsonb_build_object('success', false, 'error', 'duplicate_player');
  end if;

  foreach v_pid in array p_player_ids loop
    if not public.f2t_player_selectable(v_pid) then
      return jsonb_build_object('success', false, 'error', 'player_not_selectable');
    end if;
    if public.f2t_player_scored_since_start(p_competition_id, v_pid) then
      return jsonb_build_object('success', false, 'error', 'player_already_scored');
    end if;
  end loop;

  delete from public.f2t_selections
  where competition_id = p_competition_id and user_id = v_uid;

  foreach v_pid in array p_player_ids loop
    v_slot := v_slot + 1;
    insert into public.f2t_selections (
      competition_id, user_id, slot, player_id
    ) values (p_competition_id, v_uid, v_slot, v_pid);
  end loop;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.f2t_use_substitution(
  p_competition_id uuid,
  p_out_player_id uuid,
  p_in_player_id uuid,
  p_type text default 'regular'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_part public.f2t_participants%rowtype;
  v_comp public.f2t_competitions%rowtype;
  v_sg public.lms_gameweeks%rowtype;
  v_out_sel public.f2t_selections%rowtype;
  v_unscored int;
  v_completed_gws int;
  v_current_gw uuid;
  v_sub_type text := lower(trim(coalesce(p_type, 'regular')));
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if v_sub_type not in ('regular', 'owner_flag') then
    return jsonb_build_object('success', false, 'error', 'invalid_type');
  end if;

  select * into v_comp from public.f2t_competitions where id = p_competition_id;
  select * into v_part
  from public.f2t_participants
  where competition_id = p_competition_id and user_id = v_uid;

  if not found or v_part.status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'not_active');
  end if;

  select * into v_out_sel
  from public.f2t_selections
  where competition_id = p_competition_id
    and user_id = v_uid
    and player_id = p_out_player_id;

  if not found or v_out_sel.scored_at is not null then
    return jsonb_build_object('success', false, 'error', 'out_player_invalid');
  end if;

  if not public.f2t_player_selectable(p_in_player_id) then
    return jsonb_build_object('success', false, 'error', 'in_player_not_selectable');
  end if;

  if public.f2t_player_scored_since_start(p_competition_id, p_in_player_id) then
    return jsonb_build_object('success', false, 'error', 'in_player_already_scored');
  end if;

  if exists (
    select 1 from public.f2t_selections
    where competition_id = p_competition_id
      and user_id = v_uid
      and player_id = p_in_player_id
  ) then
    return jsonb_build_object('success', false, 'error', 'in_player_already_selected');
  end if;

  select * into v_sg from public.lms_gameweeks where id = v_comp.start_gameweek_id;

  if v_sub_type = 'owner_flag' then
    if not exists (
      select 1 from public.football_players
      where id = p_out_player_id and owner_flagged = true
    ) then
      return jsonb_build_object('success', false, 'error', 'out_not_owner_flagged');
    end if;
  else
    if v_part.regular_sub_used then
      return jsonb_build_object('success', false, 'error', 'regular_sub_used');
    end if;

    select count(*)::int into v_unscored
    from public.f2t_selections
    where competition_id = p_competition_id and user_id = v_uid and scored_at is null;

    select count(*)::int into v_completed_gws
    from public.lms_gameweeks gw
    where gw.season = v_comp.season
      and gw.number >= coalesce(v_sg.number, 1)
      and gw.status = 'complete';

    if v_completed_gws < 3 or v_unscored <= 3 then
      return jsonb_build_object('success', false, 'error', 'regular_sub_not_allowed');
    end if;
  end if;

  select gw.id into v_current_gw
  from public.lms_gameweeks gw
  where gw.season = v_comp.season
    and gw.status in ('upcoming', 'live')
    and gw.number >= coalesce(v_sg.number, 1)
  order by gw.number asc
  limit 1;

  if v_current_gw is null then
    select gw.id into v_current_gw
    from public.lms_gameweeks gw
    where gw.season = v_comp.season
    order by gw.number desc
    limit 1;
  end if;

  update public.f2t_selections
  set player_id = p_in_player_id
  where id = v_out_sel.id;

  insert into public.f2t_substitutions (
    competition_id, user_id, out_player_id, in_player_id, gameweek_id, type
  ) values (
    p_competition_id, v_uid, p_out_player_id, p_in_player_id, v_current_gw, v_sub_type
  );

  if v_sub_type = 'regular' then
    update public.f2t_participants
    set regular_sub_used = true
    where competition_id = p_competition_id and user_id = v_uid;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.f2t_apply_gameweek_goals(p_gameweek_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gw public.lms_gameweeks%rowtype;
  v_updated int := 0;
  v_winner_set int := 0;
begin
  select * into v_gw from public.lms_gameweeks where id = p_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_gameweek');
  end if;

  with scored as (
    select s.id as selection_id, s.competition_id, s.user_id, g.gameweek_id
    from public.f2t_selections s
    join public.f2t_competitions c on c.id = s.competition_id
    join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    join public.football_player_gameweek_goals g on g.player_id = s.player_id
    join public.lms_gameweeks gw on gw.id = g.gameweek_id
    where s.scored_at is null
      and gw.season = c.season
      and gw.number >= sg.number
      and g.gameweek_id = p_gameweek_id
  ),
  upd as (
    update public.f2t_selections sel
    set scored_at = now(),
        scored_gameweek_id = scored.gameweek_id
    from scored
    where sel.id = scored.selection_id
    returning sel.competition_id, sel.user_id
  )
  select count(*)::int into v_updated from upd;

  -- Promote first to 20 scored per competition (no prior winner)
  with winners as (
    select p.competition_id, p.user_id
    from public.f2t_participants p
    where p.status = 'active'
      and not exists (
        select 1 from public.f2t_participants w
        where w.competition_id = p.competition_id and w.status = 'winner'
      )
      and (
        select count(*) from public.f2t_selections s
        where s.competition_id = p.competition_id
          and s.user_id = p.user_id
          and s.scored_at is not null
      ) >= 20
  ),
  mark as (
    update public.f2t_participants p
    set status = 'winner',
        completed_at = now()
    from winners w
    where p.competition_id = w.competition_id
      and p.user_id = w.user_id
      and p.status = 'active'
    returning p.competition_id
  )
  select count(*)::int into v_winner_set from mark;

  update public.f2t_competitions c
  set status = 'completed', updated_at = now()
  where exists (select 1 from public.f2t_participants p where p.competition_id = c.id and p.status = 'winner')
    and c.status <> 'completed';

  return jsonb_build_object(
    'success', true,
    'selections_updated', v_updated,
    'winners_set', v_winner_set,
    'gameweek_number', v_gw.number
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner: player flags + list
-- ---------------------------------------------------------------------------

create or replace function public.owner_list_football_players(
  p_team_id uuid default null,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  return jsonb_build_object(
    'success', true,
    'players', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', fp.id,
            'display_name', fp.display_name,
            'full_name', fp.full_name,
            'team_id', fp.team_id,
            'team_name', t.name,
            'team_short_name', t.short_name,
            'owner_flagged', fp.owner_flagged,
            'owner_flagged_at', fp.owner_flagged_at,
            'is_active', fp.is_active,
            'picker_stats', fp.picker_stats,
            'fpl_element_id', fp.fpl_element_id,
            'bbs_player_id', fp.bbs_player_id
          )
          order by t.name, fp.display_name
        )
        from public.football_players fp
        join public.lms_teams t on t.id = fp.team_id
        where (p_team_id is null or fp.team_id = p_team_id)
          and (
            p_search is null
            or trim(p_search) = ''
            or fp.display_name ilike '%' || trim(p_search) || '%'
            or fp.full_name ilike '%' || trim(p_search) || '%'
          )
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.owner_set_football_player_flagged(
  p_player_id uuid,
  p_flagged boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if not exists (select 1 from public.football_players where id = p_player_id) then
    return jsonb_build_object('success', false, 'error', 'player_not_found');
  end if;

  update public.football_players
  set owner_flagged = p_flagged,
      owner_flagged_at = case when p_flagged then now() else null end,
      owner_flagged_by = case when p_flagged then v_uid else null end,
      updated_at = now()
  where id = p_player_id;

  return jsonb_build_object('success', true, 'owner_flagged', p_flagged);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.f2t_is_competition_member(uuid) from public;
revoke all on function public.f2t_has_competition_join_request(uuid) from public;
revoke all on function public.f2t_can_manage_competition(uuid) from public;
revoke all on function public.f2t_is_competition_manager(uuid) from public;
revoke all on function public.f2t_can_handle_joins(uuid) from public;
revoke all on function public.f2t_competition_join_open(uuid) from public;
revoke all on function public.f2t_player_scored_since_start(uuid, uuid) from public;
revoke all on function public.f2t_player_selectable(uuid) from public;

grant execute on function public.f2t_is_competition_member(uuid) to authenticated;
grant execute on function public.f2t_has_competition_join_request(uuid) to authenticated;
grant execute on function public.f2t_can_manage_competition(uuid) to authenticated;
grant execute on function public.f2t_is_competition_manager(uuid) to authenticated;
grant execute on function public.f2t_can_handle_joins(uuid) to authenticated;
grant execute on function public.f2t_competition_join_open(uuid) to authenticated;
grant execute on function public.f2t_player_scored_since_start(uuid, uuid) to authenticated;
grant execute on function public.f2t_player_selectable(uuid) to authenticated;

grant execute on function public.f2t_request_join(text) to authenticated;
grant execute on function public.f2t_admin_approve_join(text, uuid) to authenticated;
grant execute on function public.f2t_admin_reject_join(text, uuid) to authenticated;
grant execute on function public.f2t_admin_create_competition(text, text, uuid, text, text) to authenticated;
grant execute on function public.f2t_set_competition_entry(uuid, text) to authenticated;
grant execute on function public.f2t_can_manage_competition_rpc(uuid) to authenticated;
grant execute on function public.f2t_admin_list_pending_for_competition(uuid) to authenticated;
grant execute on function public.f2t_get_home(text) to authenticated;
grant execute on function public.f2t_list_selectable_players(uuid) to authenticated;
grant execute on function public.f2t_get_competition(uuid) to authenticated;
grant execute on function public.f2t_submit_selections(uuid, uuid[]) to authenticated;
grant execute on function public.f2t_use_substitution(uuid, uuid, uuid, text) to authenticated;

revoke all on function public.f2t_apply_gameweek_goals(uuid) from public;
grant execute on function public.f2t_apply_gameweek_goals(uuid) to service_role;

grant execute on function public.owner_list_football_players(uuid, text) to authenticated;
grant execute on function public.owner_set_football_player_flagged(uuid, boolean) to authenticated;
