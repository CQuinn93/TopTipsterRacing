-- =============================================================================
-- LMS: per-competition team pool + gameweek fixture exclusions
-- =============================================================================
-- - lms_competition_teams: which clubs are eligible in a given competition
-- - lms_fixtures.excluded_from_lms: postponed / unavailable for picks (shared calendar)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------

create table if not exists public.lms_competition_teams (
  competition_id uuid not null references public.lms_competitions(id) on delete cascade,
  team_id uuid not null references public.lms_teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (competition_id, team_id)
);

create index if not exists idx_lms_competition_teams_team
  on public.lms_competition_teams(team_id);

comment on table public.lms_competition_teams is
  'Teams allowed in a specific LMS competition (admin-managed pool).';

alter table public.lms_fixtures
  add column if not exists excluded_from_lms boolean not null default false;

alter table public.lms_fixtures
  add column if not exists excluded_reason text;

alter table public.lms_fixtures
  add column if not exists excluded_at timestamptz;

alter table public.lms_fixtures
  add column if not exists excluded_by uuid references auth.users(id) on delete set null;

comment on column public.lms_fixtures.excluded_from_lms is
  'When true, neither side can be picked for this gameweek (e.g. postponed).';

alter table public.lms_competition_teams enable row level security;

drop policy if exists "lms_competition_teams_select" on public.lms_competition_teams;
create policy "lms_competition_teams_select"
  on public.lms_competition_teams for select to authenticated
  using (
    public.lms_is_competition_member(competition_id)
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'Admin'
    )
  );

-- Backfill: every existing competition gets the full current team list
insert into public.lms_competition_teams (competition_id, team_id)
select c.id, t.id
from public.lms_competitions c
cross join public.lms_teams t
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2) Helpers
-- ---------------------------------------------------------------------------

create or replace function public.lms_is_profile_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'Admin'
  );
$$;

revoke all on function public.lms_is_profile_admin() from public;
grant execute on function public.lms_is_profile_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Create competition — seed full pool by default
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
-- 4) Admin RPCs (profile Admin role — in-app competition admin)
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
  if not public.lms_is_profile_admin() then
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
    -- Clear pending picks using this team in this competition
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
  if not public.lms_is_profile_admin() then
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
    -- Clear pending picks for either side in this gameweek (all competitions)
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

revoke all on function public.lms_admin_set_competition_team(uuid, uuid, boolean) from public;
revoke all on function public.lms_admin_set_fixture_excluded(uuid, boolean, text) from public;
grant execute on function public.lms_admin_set_competition_team(uuid, uuid, boolean) to authenticated;
grant execute on function public.lms_admin_set_fixture_excluded(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Submit pick — respect pool + excluded fixtures
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

  if not exists (
    select 1 from public.lms_competition_teams
    where competition_id = p_competition_id and team_id = p_team_id
  ) then
    return jsonb_build_object('success', false, 'error', 'team_not_in_pool');
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
      and coalesce(f.excluded_from_lms, false) = false
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
-- 6) Auto-assign + settle — ignore excluded fixtures
-- ---------------------------------------------------------------------------

create or replace function public.lms_auto_assign_missed_picks(p_gameweek_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gw public.lms_gameweeks%rowtype;
  v_part record;
  v_team_id uuid;
  v_assigned int := 0;
begin
  select * into v_gw from public.lms_gameweeks where id = p_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_gameweek');
  end if;

  if now() < v_gw.deadline_at then
    return jsonb_build_object('success', true, 'assigned', 0, 'skipped', 'before_deadline');
  end if;

  if not exists (
    select 1 from public.lms_fixtures
    where gameweek_id = p_gameweek_id and coalesce(excluded_from_lms, false) = false
  ) then
    return jsonb_build_object('success', true, 'assigned', 0, 'skipped', 'no_fixtures');
  end if;

  for v_part in
    select p.*
    from public.lms_participants p
    join public.lms_competitions c on c.id = p.competition_id
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    where p.status = 'active'
      and c.status in ('open', 'active')
      and (
        c.start_gameweek_id is null
        or (sg.season = v_gw.season and sg.number <= v_gw.number)
      )
      and not exists (
        select 1 from public.lms_picks pk
        where pk.competition_id = p.competition_id
          and pk.user_id = p.user_id
          and pk.gameweek_id = p_gameweek_id
      )
  loop
    select t.id into v_team_id
    from public.lms_teams t
    where exists (
      select 1 from public.lms_competition_teams ct
      where ct.competition_id = v_part.competition_id and ct.team_id = t.id
    )
    and exists (
      select 1 from public.lms_fixtures f
      where f.gameweek_id = p_gameweek_id
        and coalesce(f.excluded_from_lms, false) = false
        and (f.home_team_id = t.id or f.away_team_id = t.id)
    )
    and not exists (
      select 1 from public.lms_used_teams u
      where u.competition_id = v_part.competition_id
        and u.user_id = v_part.user_id
        and u.team_id = t.id
    )
    order by lower(t.name) asc
    limit 1;

    if v_team_id is null then
      continue;
    end if;

    insert into public.lms_picks (
      competition_id, user_id, gameweek_id, team_id, result, updated_at
    ) values (
      v_part.competition_id, v_part.user_id, p_gameweek_id, v_team_id, 'pending', now()
    )
    on conflict (competition_id, user_id, gameweek_id) do nothing;

    insert into public.lms_used_teams (competition_id, user_id, team_id, gameweek_id)
    values (v_part.competition_id, v_part.user_id, v_team_id, p_gameweek_id)
    on conflict (competition_id, user_id, team_id) do update
      set gameweek_id = excluded.gameweek_id;

    update public.lms_competitions
    set status = 'active', updated_at = now()
    where id = v_part.competition_id and status = 'open';

    v_assigned := v_assigned + 1;
  end loop;

  return jsonb_build_object('success', true, 'assigned', v_assigned);
end;
$$;

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
  v_fixture public.lms_fixtures%rowtype;
  v_won boolean;
  v_summary jsonb := '[]'::jsonb;
  v_settle public.lms_gameweeks%rowtype;
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
      and coalesce(f.excluded_from_lms, false) = false
      and (f.home_team_id = v_pick.team_id or f.away_team_id = v_pick.team_id)
    limit 1;

    if not found then
      -- Pick on excluded/missing fixture: mark incorrect / eliminate
      update public.lms_picks
      set result = 'incorrect', updated_at = now()
      where id = v_pick.id;

      update public.lms_participants
      set status = 'eliminated',
          eliminated_gameweek_id = p_gameweek_id
      where competition_id = v_pick.competition_id
        and user_id = v_pick.user_id
        and status = 'active';
      continue;
    end if;

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

  return jsonb_build_object('success', true, 'results', v_summary);
end;
$$;
