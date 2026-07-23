-- =============================================================================
-- LMS: competition start gameweek + settle/pick fixes
-- =============================================================================
-- - Each competition has a starting gameweek
-- - Picks only allowed from that gameweek onward
-- - Settling a gameweek only affects competitions that have started by then
-- - Repair participants wrongly eliminated before their competition started
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------

alter table public.lms_competitions
  add column if not exists start_gameweek_id uuid references public.lms_gameweeks(id) on delete restrict;

comment on column public.lms_competitions.start_gameweek_id is
  'First gameweek this competition uses for picks and elimination.';

-- Backfill existing competitions to GW1 of their season (or earliest GW)
update public.lms_competitions c
set start_gameweek_id = (
  select g.id
  from public.lms_gameweeks g
  where g.season = c.season
  order by g.number asc
  limit 1
)
where c.start_gameweek_id is null;

create index if not exists idx_lms_competitions_start_gw
  on public.lms_competitions(start_gameweek_id);

-- ---------------------------------------------------------------------------
-- 2) Create competition (requires start gameweek)
-- ---------------------------------------------------------------------------

drop function if exists public.lms_admin_create_competition(text, text, text);

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

grant execute on function public.lms_admin_create_competition(text, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Admin list competitions — include start week
-- ---------------------------------------------------------------------------

create or replace function public.lms_admin_list_competitions(p_code text)
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
          'id', c.id,
          'name', c.name,
          'season', c.season,
          'status', c.status,
          'created_at', c.created_at,
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
            select count(*)::int from public.lms_participants p where p.competition_id = c.id
          ),
          'active_count', (
            select count(*)::int from public.lms_participants p
            where p.competition_id = c.id and p.status = 'active'
          )
        )
        order by c.created_at desc
      ),
      '[]'::jsonb
    )
    from public.lms_competitions c
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Player list — include start week
-- ---------------------------------------------------------------------------

create or replace function public.lms_list_my_competitions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'competition_id', c.id,
          'name', c.name,
          'season', c.season,
          'competition_status', c.status,
          'participant_status', p.status,
          'joined_at', p.joined_at,
          'rollover_count', p.rollover_count,
          'start_gameweek_id', c.start_gameweek_id,
          'start_gameweek_number', sg.number
        )
        order by p.joined_at desc
      ),
      '[]'::jsonb
    )
    from public.lms_participants p
    join public.lms_competitions c on c.id = p.competition_id
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    where p.user_id = v_uid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Submit pick — block gameweeks before competition start
-- ---------------------------------------------------------------------------

create or replace function public.lms_submit_pick(
  p_competition_id uuid,
  p_gameweek_id uuid,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_part public.lms_participants%rowtype;
  v_gw public.lms_gameweeks%rowtype;
  v_comp public.lms_competitions%rowtype;
  v_start public.lms_gameweeks%rowtype;
  v_plays boolean;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_comp from public.lms_competitions where id = p_competition_id;
  if not found or v_comp.status = 'completed' then
    return jsonb_build_object('success', false, 'error', 'competition_unavailable');
  end if;

  select * into v_part
  from public.lms_participants
  where competition_id = p_competition_id and user_id = v_uid;
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

  if exists (
    select 1 from public.lms_used_teams
    where competition_id = p_competition_id and user_id = v_uid and team_id = p_team_id
  ) then
    return jsonb_build_object('success', false, 'error', 'team_already_used');
  end if;

  select exists (
    select 1 from public.lms_fixtures f
    where f.gameweek_id = p_gameweek_id
      and (f.home_team_id = p_team_id or f.away_team_id = p_team_id)
  ) into v_plays;

  if not v_plays then
    return jsonb_build_object('success', false, 'error', 'team_not_playing');
  end if;

  insert into public.lms_picks (competition_id, user_id, gameweek_id, team_id, result, updated_at)
  values (p_competition_id, v_uid, p_gameweek_id, p_team_id, 'pending', now())
  on conflict (competition_id, user_id, gameweek_id) do update
    set team_id = excluded.team_id,
        result = 'pending',
        updated_at = now()
  where lms_picks.result = 'pending';

  if not exists (
    select 1 from public.lms_picks
    where competition_id = p_competition_id
      and user_id = v_uid
      and gameweek_id = p_gameweek_id
      and team_id = p_team_id
      and result = 'pending'
  ) then
    return jsonb_build_object('success', false, 'error', 'pick_locked');
  end if;

  delete from public.lms_used_teams
  where competition_id = p_competition_id
    and user_id = v_uid
    and gameweek_id = p_gameweek_id;

  insert into public.lms_used_teams (competition_id, user_id, team_id, gameweek_id)
  values (p_competition_id, v_uid, p_team_id, p_gameweek_id)
  on conflict (competition_id, user_id, team_id) do update
    set gameweek_id = excluded.gameweek_id;

  if v_comp.status = 'open' then
    update public.lms_competitions set status = 'active', updated_at = now() where id = v_comp.id;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Settle gameweek — only comps that have started by this GW
-- ---------------------------------------------------------------------------

create or replace function public.lms_settle_gameweek(p_code text, p_gameweek_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_unfinished int;
  v_comp record;
  v_active_count int;
  v_next_gw_id uuid;
  v_access char(6);
  v_attempts int;
  v_pick record;
  v_fixture public.lms_fixtures%rowtype;
  v_won boolean;
  v_summary jsonb := '[]'::jsonb;
  v_settle public.lms_gameweeks%rowtype;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select * into v_settle from public.lms_gameweeks where id = p_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_gameweek');
  end if;

  select count(*)::int into v_unfinished
  from public.lms_fixtures
  where gameweek_id = p_gameweek_id and status <> 'finished';

  if v_unfinished > 0 then
    return jsonb_build_object('success', false, 'error', 'fixtures_incomplete', 'remaining', v_unfinished);
  end if;

  if not exists (select 1 from public.lms_fixtures where gameweek_id = p_gameweek_id) then
    return jsonb_build_object('success', false, 'error', 'no_fixtures');
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
        or (sg.season = v_settle.season and sg.number <= v_settle.number)
      )
  loop
    select f.* into v_fixture
    from public.lms_fixtures f
    where f.gameweek_id = p_gameweek_id
      and (f.home_team_id = v_pick.team_id or f.away_team_id = v_pick.team_id)
    limit 1;

    v_won := public.lms_team_won_fixture(v_fixture, v_pick.team_id);

    update public.lms_picks
    set result = case when v_won then 'correct' else 'incorrect' end,
        updated_at = now()
    where id = v_pick.id;

    if not v_won then
      update public.lms_participants
      set status = 'eliminated',
          eliminated_gameweek_id = p_gameweek_id
      where competition_id = v_pick.competition_id
        and user_id = v_pick.user_id
        and status = 'active';
    end if;
  end loop;

  -- No-pick eliminations only for competitions already started by this GW
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
            ) values (v_comp.id, v_access, 'rejoin', v_next_gw_id, v_admin);
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

  return jsonb_build_object('success', true, 'results', v_summary);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Repair: restore players eliminated before their competition start week
-- ---------------------------------------------------------------------------

update public.lms_participants p
set status = 'active',
    eliminated_gameweek_id = null
from public.lms_competitions c,
     public.lms_gameweeks sg,
     public.lms_gameweeks eg
where p.competition_id = c.id
  and sg.id = c.start_gameweek_id
  and eg.id = p.eliminated_gameweek_id
  and p.status = 'eliminated'
  and c.status in ('open', 'active')
  and eg.season = sg.season
  and eg.number < sg.number;

-- Also restore anyone eliminated with no incorrect pick while competition
-- start week has not begun yet
update public.lms_participants p
set status = 'active',
    eliminated_gameweek_id = null
from public.lms_competitions c,
     public.lms_gameweeks sg
where p.competition_id = c.id
  and sg.id = c.start_gameweek_id
  and p.status = 'eliminated'
  and c.status in ('open', 'active')
  and now() < sg.starts_at
  and not exists (
    select 1 from public.lms_picks pk
    where pk.competition_id = p.competition_id
      and pk.user_id = p.user_id
      and pk.result = 'incorrect'
  );
