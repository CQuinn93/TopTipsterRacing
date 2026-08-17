-- =============================================================================
-- LMS extra lives: league rule + per-player remaining extras.
-- extra_lives = 0 is classic LMS (out on first loss). Missed pick is still
-- instant elimination. A scored loss/draw consumes one extra life.
-- =============================================================================

alter table public.lms_competitions
  add column if not exists extra_lives int not null default 0;

alter table public.lms_competitions
  drop constraint if exists lms_competitions_extra_lives_check;

alter table public.lms_competitions
  add constraint lms_competitions_extra_lives_check
  check (extra_lives between 0 and 3);

comment on column public.lms_competitions.extra_lives is
  'Extra lives granted at join. 0 = classic LMS (out on first loss). Max 3.';

alter table public.lms_participants
  add column if not exists lives_remaining int not null default 0;

alter table public.lms_participants
  drop constraint if exists lms_participants_lives_remaining_check;

alter table public.lms_participants
  add constraint lms_participants_lives_remaining_check
  check (lives_remaining >= -1);

comment on column public.lms_participants.lives_remaining is
  'Remaining extra lives for this player. Decremented on a scored loss/draw.';

-- ---------------------------------------------------------------------------
-- Consume one extra life; eliminate when remaining drops below 0.
-- Returns true if the player was eliminated.
-- ---------------------------------------------------------------------------

create or replace function public.lms_consume_participant_life(
  p_competition_id uuid,
  p_user_id uuid,
  p_gameweek_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining int;
begin
  update public.lms_participants
  set lives_remaining = lives_remaining - 1
  where competition_id = p_competition_id
    and user_id = p_user_id
    and status = 'active'
  returning lives_remaining into v_remaining;

  if not found then
    return false;
  end if;

  if v_remaining < 0 then
    update public.lms_participants
    set status = 'eliminated',
        eliminated_gameweek_id = p_gameweek_id
    where competition_id = p_competition_id
      and user_id = p_user_id
      and status = 'active';
    return found;
  end if;

  return false;
end;
$$;

revoke all on function public.lms_consume_participant_life(uuid, uuid, uuid) from public;
grant execute on function public.lms_consume_participant_life(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Progressive scoring: consume a life on draw/loss instead of instant out
-- ---------------------------------------------------------------------------

create or replace function public.lms_apply_finished_pick_results(p_gameweek_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gw public.lms_gameweeks%rowtype;
  v_pick record;
  v_fixture public.lms_fixtures%rowtype;
  v_won boolean;
  v_scored int := 0;
  v_eliminated int := 0;
begin
  select * into v_gw from public.lms_gameweeks where id = p_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_gameweek');
  end if;

  if v_gw.status = 'complete' then
    return jsonb_build_object(
      'success', true,
      'scored', 0,
      'eliminated', 0,
      'skipped', 'gameweek_complete'
    );
  end if;

  for v_pick in
    select pk.*
    from public.lms_picks pk
    join public.lms_competitions c on c.id = pk.competition_id
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    where pk.gameweek_id = p_gameweek_id
      and pk.result = 'pending'
      and c.status in ('open', 'active')
      and (
        c.start_gameweek_id is null
        or (sg.season = v_gw.season and sg.number <= v_gw.number)
      )
  loop
    select f.* into v_fixture
    from public.lms_fixtures f
    where f.gameweek_id = p_gameweek_id
      and coalesce(f.excluded_from_lms, false) = false
      and f.status = 'finished'
      and f.home_goals is not null
      and f.away_goals is not null
      and (f.home_team_id = v_pick.team_id or f.away_team_id = v_pick.team_id)
    limit 1;

    if not found then
      continue;
    end if;

    v_won := public.lms_team_won_fixture(v_fixture, v_pick.team_id);

    update public.lms_picks
    set result = case when v_won then 'correct' else 'incorrect' end,
        updated_at = now()
    where id = v_pick.id;

    v_scored := v_scored + 1;

    if not v_won then
      if public.lms_consume_participant_life(v_pick.competition_id, v_pick.user_id, p_gameweek_id) then
        v_eliminated := v_eliminated + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'scored', v_scored,
    'eliminated', v_eliminated
  );
end;
$$;

comment on function public.lms_apply_finished_pick_results(uuid) is
  'Score pending LMS picks whose fixtures are already finished; consume a life on draw/loss.';

-- ---------------------------------------------------------------------------
-- End-of-week settle: leftover pending picks consume a life; no-pick still out
-- ---------------------------------------------------------------------------

create or replace function public.lms_settle_gameweek_internal(p_gameweek_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unfinished int;
  v_comp record;
  v_active_count int;
  v_next_gw_id uuid;
  v_access char(6);
  v_attempts int;
  v_pick record;
  v_summary jsonb := '[]'::jsonb;
  v_settle public.lms_gameweeks%rowtype;
  v_apply jsonb;
begin
  select * into v_settle from public.lms_gameweeks where id = p_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_gameweek');
  end if;

  if v_settle.status = 'complete' then
    return jsonb_build_object('success', true, 'results', '[]'::jsonb, 'already_complete', true);
  end if;

  select count(*)::int into v_unfinished
  from public.lms_fixtures
  where gameweek_id = p_gameweek_id
    and coalesce(excluded_from_lms, false) = false
    and status <> 'finished';

  if v_unfinished > 0 then
    return jsonb_build_object('success', false, 'error', 'fixtures_incomplete', 'remaining', v_unfinished);
  end if;

  if not exists (
    select 1 from public.lms_fixtures
    where gameweek_id = p_gameweek_id and coalesce(excluded_from_lms, false) = false
  ) then
    return jsonb_build_object('success', false, 'error', 'no_fixtures');
  end if;

  perform public.lms_auto_assign_missed_picks(p_gameweek_id);

  v_apply := public.lms_apply_finished_pick_results(p_gameweek_id);

  for v_pick in
    select pk.*
    from public.lms_picks pk
    join public.lms_competitions c on c.id = pk.competition_id
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    where pk.gameweek_id = p_gameweek_id
      and pk.result = 'pending'
      and c.status in ('open', 'active')
      and (
        c.start_gameweek_id is null
        or (sg.season = v_settle.season and sg.number <= v_settle.number)
      )
  loop
    update public.lms_picks
    set result = 'incorrect', updated_at = now()
    where id = v_pick.id;

    perform public.lms_consume_participant_life(
      v_pick.competition_id,
      v_pick.user_id,
      p_gameweek_id
    );
  end loop;

  -- No pick at all for this gameweek → still instant eliminate
  update public.lms_participants p
  set status = 'eliminated',
      eliminated_gameweek_id = p_gameweek_id
  from public.lms_competitions c
  left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
  where p.competition_id = c.id
    and p.status = 'active'
    and c.status in ('open', 'active')
    and (
      c.start_gameweek_id is null
      or (sg.season = v_settle.season and sg.number <= v_settle.number)
    )
    and not exists (
      select 1 from public.lms_picks pk
      where pk.competition_id = p.competition_id
        and pk.user_id = p.user_id
        and pk.gameweek_id = p_gameweek_id
    );

  select gw.id into v_next_gw_id
  from public.lms_gameweeks gw
  where gw.season = v_settle.season
    and gw.number = v_settle.number + 1
  limit 1;

  for v_comp in
    select c.*
    from public.lms_competitions c
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    where c.status in ('open', 'active')
      and exists (
        select 1 from public.lms_participants p where p.competition_id = c.id
      )
      and (
        c.start_gameweek_id is null
        or (sg.season = v_settle.season and sg.number <= v_settle.number)
      )
  loop
    select count(*)::int into v_active_count
    from public.lms_participants
    where competition_id = v_comp.id and status = 'active';

    if v_active_count = 1 then
      update public.lms_participants
      set status = 'winner'
      where competition_id = v_comp.id and status = 'active';

      update public.lms_competitions
      set status = 'completed', updated_at = now()
      where id = v_comp.id;

      v_summary := v_summary || jsonb_build_array(jsonb_build_object(
        'competition_id', v_comp.id,
        'outcome', 'winner'
      ));

    elsif v_active_count = 0 then
      delete from public.lms_used_teams where competition_id = v_comp.id;
      delete from public.lms_picks where competition_id = v_comp.id;

      update public.lms_access_codes
      set is_active = false, voided_at = coalesce(voided_at, now())
      where competition_id = v_comp.id and type = 'rejoin' and is_active = true;

      if v_next_gw_id is not null then
        v_attempts := 0;
        loop
          v_access := public.lms_generate_access_code();
          begin
            insert into public.lms_access_codes (
              competition_id, code, type, valid_for_gameweek_id, created_by_user_id
            ) values (v_comp.id, v_access, 'rejoin', v_next_gw_id, null);
            exit;
          exception when unique_violation then
            v_attempts := v_attempts + 1;
            if v_attempts > 20 then
              v_access := null;
              exit;
            end if;
          end;
        end loop;
      else
        v_access := null;
      end if;

      update public.lms_competitions
      set status = 'open', updated_at = now()
      where id = v_comp.id;

      v_summary := v_summary || jsonb_build_array(jsonb_build_object(
        'competition_id', v_comp.id,
        'outcome', 'rollover',
        'rejoin_code', v_access,
        'valid_for_gameweek_id', v_next_gw_id
      ));

    else
      v_summary := v_summary || jsonb_build_array(jsonb_build_object(
        'competition_id', v_comp.id,
        'outcome', 'continue',
        'active_count', v_active_count
      ));
    end if;
  end loop;

  update public.lms_gameweeks
  set status = 'complete'
  where id = p_gameweek_id;

  return jsonb_build_object(
    'success', true,
    'results', v_summary,
    'apply', v_apply
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Create: optional extra lives (default 0)
-- ---------------------------------------------------------------------------

drop function if exists public.lms_admin_create_competition(text, text, uuid, text);

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
    name, season, status, created_by_user_id, start_gameweek_id, extra_lives
  )
  values (trim(p_name), v_season, 'open', v_admin, p_start_gameweek_id, v_extra)
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
    'extra_lives', v_extra
  );
end;
$$;

revoke all on function public.lms_admin_create_competition(text, text, uuid, text, int) from public;
grant execute on function public.lms_admin_create_competition(text, text, uuid, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Approve join / rejoin: copy competition extra_lives onto the participant
-- ---------------------------------------------------------------------------

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

  update public.lms_competitions
  set status = case when status = 'open' then 'active' else status end,
      updated_at = now()
  where id = v_req.competition_id;

  return jsonb_build_object('success', true);
end;
$$;
