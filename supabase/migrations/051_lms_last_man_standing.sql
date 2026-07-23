-- Last Man Standing (Premier League 2026/27)
-- Shared season data + multi-competition membership, picks, settlement, rollover.

-- ---------------------------------------------------------------------------
-- Tables: shared season
-- ---------------------------------------------------------------------------

create table if not exists public.lms_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.lms_gameweeks (
  id uuid primary key default gen_random_uuid(),
  season text not null default '2026/27',
  number int not null check (number between 1 and 38),
  deadline_at timestamptz not null,
  starts_at timestamptz not null,
  status text not null default 'upcoming'
    check (status in ('upcoming', 'live', 'complete')),
  created_at timestamptz not null default now(),
  unique (season, number)
);

create table if not exists public.lms_fixtures (
  id uuid primary key default gen_random_uuid(),
  gameweek_id uuid not null references public.lms_gameweeks(id) on delete cascade,
  home_team_id uuid not null references public.lms_teams(id),
  away_team_id uuid not null references public.lms_teams(id),
  kickoff_at timestamptz not null,
  home_goals int,
  away_goals int,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'finished')),
  created_at timestamptz not null default now(),
  check (home_team_id <> away_team_id),
  check (
    (status <> 'finished')
    or (home_goals is not null and away_goals is not null)
  )
);

create index if not exists idx_lms_fixtures_gameweek on public.lms_fixtures(gameweek_id);
create index if not exists idx_lms_fixtures_kickoff on public.lms_fixtures(kickoff_at);

-- ---------------------------------------------------------------------------
-- Tables: competitions / codes / membership
-- ---------------------------------------------------------------------------

create table if not exists public.lms_competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text not null default '2026/27',
  status text not null default 'open'
    check (status in ('open', 'active', 'completed')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lms_access_codes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.lms_competitions(id) on delete cascade,
  code char(6) not null,
  type text not null check (type in ('join', 'rejoin')),
  valid_for_gameweek_id uuid references public.lms_gameweeks(id) on delete set null,
  is_active boolean not null default true,
  created_by_user_id uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (code),
  check (
    (type = 'join' and valid_for_gameweek_id is null)
    or (type = 'rejoin' and valid_for_gameweek_id is not null)
  )
);

create index if not exists idx_lms_access_codes_competition on public.lms_access_codes(competition_id);
create index if not exists idx_lms_access_codes_active on public.lms_access_codes(code) where is_active = true;

create table if not exists public.lms_join_requests (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.lms_competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_code_id uuid not null references public.lms_access_codes(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (competition_id, user_id)
);

create index if not exists idx_lms_join_requests_pending
  on public.lms_join_requests(status) where status = 'pending';

create table if not exists public.lms_participants (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.lms_competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'eliminated', 'winner')),
  eliminated_gameweek_id uuid references public.lms_gameweeks(id) on delete set null,
  joined_at timestamptz not null default now(),
  rollover_count int not null default 0,
  unique (competition_id, user_id)
);

create index if not exists idx_lms_participants_user on public.lms_participants(user_id);
create index if not exists idx_lms_participants_comp_status on public.lms_participants(competition_id, status);

create table if not exists public.lms_picks (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.lms_competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  gameweek_id uuid not null references public.lms_gameweeks(id) on delete cascade,
  team_id uuid not null references public.lms_teams(id),
  result text not null default 'pending'
    check (result in ('pending', 'correct', 'incorrect')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, user_id, gameweek_id)
);

create index if not exists idx_lms_picks_gw on public.lms_picks(gameweek_id);
create index if not exists idx_lms_picks_comp_user on public.lms_picks(competition_id, user_id);

create table if not exists public.lms_used_teams (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.lms_competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.lms_teams(id),
  gameweek_id uuid not null references public.lms_gameweeks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (competition_id, user_id, team_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.lms_teams enable row level security;
alter table public.lms_gameweeks enable row level security;
alter table public.lms_fixtures enable row level security;
alter table public.lms_competitions enable row level security;
alter table public.lms_access_codes enable row level security;
alter table public.lms_join_requests enable row level security;
alter table public.lms_participants enable row level security;
alter table public.lms_picks enable row level security;
alter table public.lms_used_teams enable row level security;

drop policy if exists "lms_teams_select" on public.lms_teams;
create policy "lms_teams_select" on public.lms_teams for select to authenticated using (true);

drop policy if exists "lms_gameweeks_select" on public.lms_gameweeks;
create policy "lms_gameweeks_select" on public.lms_gameweeks for select to authenticated using (true);

drop policy if exists "lms_fixtures_select" on public.lms_fixtures;
create policy "lms_fixtures_select" on public.lms_fixtures for select to authenticated using (true);

drop policy if exists "lms_competitions_select_participant" on public.lms_competitions;
create policy "lms_competitions_select_participant" on public.lms_competitions
  for select to authenticated
  using (
    exists (
      select 1 from public.lms_participants p
      where p.competition_id = lms_competitions.id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.lms_join_requests r
      where r.competition_id = lms_competitions.id and r.user_id = auth.uid()
    )
  );

drop policy if exists "lms_join_requests_select_own" on public.lms_join_requests;
create policy "lms_join_requests_select_own" on public.lms_join_requests
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "lms_join_requests_insert_own" on public.lms_join_requests;
create policy "lms_join_requests_insert_own" on public.lms_join_requests
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "lms_participants_select_same_comp" on public.lms_participants;
create policy "lms_participants_select_same_comp" on public.lms_participants
  for select to authenticated
  using (
    exists (
      select 1 from public.lms_participants me
      where me.competition_id = lms_participants.competition_id
        and me.user_id = auth.uid()
    )
  );

drop policy if exists "lms_picks_select_same_comp" on public.lms_picks;
create policy "lms_picks_select_same_comp" on public.lms_picks
  for select to authenticated
  using (
    exists (
      select 1 from public.lms_participants me
      where me.competition_id = lms_picks.competition_id
        and me.user_id = auth.uid()
    )
  );

drop policy if exists "lms_used_teams_select_own_or_same" on public.lms_used_teams;
create policy "lms_used_teams_select_own_or_same" on public.lms_used_teams
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.lms_participants me
      where me.competition_id = lms_used_teams.competition_id
        and me.user_id = auth.uid()
    )
  );

-- Access codes: no direct select for users (lookup via RPC)

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.lms_generate_access_code()
returns char(6)
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.lms_team_won_fixture(p_fixture public.lms_fixtures, p_team_id uuid)
returns boolean
language sql
immutable
as $$
  select case
    when p_fixture.status <> 'finished' then false
    when p_fixture.home_team_id = p_team_id then p_fixture.home_goals > p_fixture.away_goals
    when p_fixture.away_team_id = p_team_id then p_fixture.away_goals > p_fixture.home_goals
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- User RPCs
-- ---------------------------------------------------------------------------

create or replace function public.lms_request_join(p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code public.lms_access_codes%rowtype;
  v_comp public.lms_competitions%rowtype;
  v_gw public.lms_gameweeks%rowtype;
  v_norm text := upper(trim(p_access_code));
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if length(v_norm) <> 6 then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_code
  from public.lms_access_codes
  where code = v_norm and is_active = true and voided_at is null
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_comp from public.lms_competitions where id = v_code.competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if v_comp.status = 'completed' then
    return jsonb_build_object('success', false, 'error', 'competition_completed');
  end if;

  if v_code.type = 'rejoin' then
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
  end if;

  if exists (
    select 1 from public.lms_participants
    where competition_id = v_comp.id and user_id = v_uid and status in ('active', 'winner')
  ) then
    return jsonb_build_object('success', false, 'error', 'already_in', 'competition_name', v_comp.name);
  end if;

  insert into public.lms_join_requests (competition_id, user_id, access_code_id, status)
  values (v_comp.id, v_uid, v_code.id, 'pending')
  on conflict (competition_id, user_id) do update
    set access_code_id = excluded.access_code_id,
        status = 'pending',
        created_at = now(),
        reviewed_at = null,
        reviewed_by = null;

  return jsonb_build_object('success', true, 'status', 'pending', 'competition_name', v_comp.name, 'competition_id', v_comp.id);
end;
$$;

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
          'rollover_count', p.rollover_count
        )
        order by p.joined_at desc
      ),
      '[]'::jsonb
    )
    from public.lms_participants p
    join public.lms_competitions c on c.id = p.competition_id
    where p.user_id = v_uid
  );
end;
$$;

create or replace function public.lms_list_my_pending_joins()
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
          'requested_at', r.created_at
        )
        order by r.created_at desc
      ),
      '[]'::jsonb
    )
    from public.lms_join_requests r
    join public.lms_competitions c on c.id = r.competition_id
    where r.user_id = v_uid and r.status = 'pending'
  );
end;
$$;

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
-- Admin RPCs
-- ---------------------------------------------------------------------------

create or replace function public.lms_admin_create_competition(
  p_code text,
  p_name text,
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
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if trim(coalesce(p_name, '')) = '' then
    return jsonb_build_object('success', false, 'error', 'name_required');
  end if;

  insert into public.lms_competitions (name, season, status, created_by_user_id)
  values (trim(p_name), coalesce(nullif(trim(p_season), ''), '2026/27'), 'open', v_admin)
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
    'access_code', v_access
  );
end;
$$;

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

    -- Rollover rejoin: reset used teams + picks for this user in competition
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
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  update public.lms_join_requests
  set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin
  where id = p_request_id and status = 'pending';

  if not found then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.lms_admin_set_fixture_result(
  p_code text,
  p_fixture_id uuid,
  p_home_goals int,
  p_away_goals int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_home_goals is null or p_away_goals is null or p_home_goals < 0 or p_away_goals < 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_score');
  end if;

  update public.lms_fixtures
  set home_goals = p_home_goals,
      away_goals = p_away_goals,
      status = 'finished'
  where id = p_fixture_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'fixture_not_found');
  end if;

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
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
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
    where pk.gameweek_id = p_gameweek_id
      and pk.result = 'pending'
      and c.status in ('open', 'active')
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

  update public.lms_participants p
  set status = 'eliminated',
      eliminated_gameweek_id = p_gameweek_id
  where p.status = 'active'
    and exists (
      select 1 from public.lms_competitions c
      where c.id = p.competition_id and c.status in ('open', 'active')
    )
    and not exists (
      select 1 from public.lms_picks pk
      where pk.competition_id = p.competition_id
        and pk.user_id = p.user_id
        and pk.gameweek_id = p_gameweek_id
    );

  select gw.id into v_next_gw_id
  from public.lms_gameweeks gw
  where gw.season = (select season from public.lms_gameweeks where id = p_gameweek_id)
    and gw.number = (select number + 1 from public.lms_gameweeks where id = p_gameweek_id)
  limit 1;

  for v_comp in
    select c.*
    from public.lms_competitions c
    where c.status in ('open', 'active')
      and exists (
        select 1 from public.lms_participants p where p.competition_id = c.id
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

grant execute on function public.lms_request_join(text) to authenticated;
grant execute on function public.lms_list_my_competitions() to authenticated;
grant execute on function public.lms_list_my_pending_joins() to authenticated;
grant execute on function public.lms_submit_pick(uuid, uuid, uuid) to authenticated;
grant execute on function public.lms_admin_create_competition(text, text, text) to authenticated;
grant execute on function public.lms_admin_list_competitions(text) to authenticated;
grant execute on function public.lms_admin_list_pending(text) to authenticated;
grant execute on function public.lms_admin_approve_join(text, uuid) to authenticated;
grant execute on function public.lms_admin_reject_join(text, uuid) to authenticated;
grant execute on function public.lms_admin_set_fixture_result(text, uuid, int, int) to authenticated;
grant execute on function public.lms_admin_create_rejoin_code(text, uuid, uuid) to authenticated;
grant execute on function public.lms_settle_gameweek(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: PL 2026/27 teams + gameweeks + GW1 sample fixtures
-- Official clubs (Premier League AGM): promoted Coventry, Ipswich, Hull;
-- relegated Wolves, Burnley, West Ham.
-- ---------------------------------------------------------------------------

insert into public.lms_teams (name, short_name, slug) values
  ('Arsenal', 'ARS', 'arsenal'),
  ('Aston Villa', 'AVL', 'aston-villa'),
  ('AFC Bournemouth', 'BOU', 'bournemouth'),
  ('Brentford', 'BRE', 'brentford'),
  ('Brighton & Hove Albion', 'BHA', 'brighton'),
  ('Chelsea', 'CHE', 'chelsea'),
  ('Coventry City', 'COV', 'coventry'),
  ('Crystal Palace', 'CRY', 'crystal-palace'),
  ('Everton', 'EVE', 'everton'),
  ('Fulham', 'FUL', 'fulham'),
  ('Hull City', 'HUL', 'hull'),
  ('Ipswich Town', 'IPS', 'ipswich'),
  ('Leeds United', 'LEE', 'leeds'),
  ('Liverpool', 'LIV', 'liverpool'),
  ('Manchester City', 'MCI', 'manchester-city'),
  ('Manchester United', 'MUN', 'manchester-united'),
  ('Newcastle United', 'NEW', 'newcastle'),
  ('Nottingham Forest', 'NFO', 'nottingham-forest'),
  ('Sunderland', 'SUN', 'sunderland'),
  ('Tottenham Hotspur', 'TOT', 'tottenham')
on conflict (slug) do nothing;

-- 38 gameweeks: opening weekend Sat 22 Aug 2026 (official PL start)
do $$
declare
  i int;
  start_ts timestamptz;
begin
  for i in 1..38 loop
    start_ts := timestamptz '2026-08-22 12:30:00+01' + ((i - 1) * interval '7 days');
    insert into public.lms_gameweeks (season, number, deadline_at, starts_at, status)
    values (
      '2026/27',
      i,
      start_ts - interval '20 minutes',
      start_ts,
      'upcoming'
    )
    on conflict (season, number) do nothing;
  end loop;
end $$;

-- GW1 sample fixtures (10 matches) — replace with official calendar when loaded
insert into public.lms_fixtures (gameweek_id, home_team_id, away_team_id, kickoff_at, status)
select g.id, h.id, a.id, g.starts_at + (offs.offset_hours * interval '1 hour'), 'scheduled'
from public.lms_gameweeks g
cross join (values
  ('liverpool', 'bournemouth', 0),
  ('aston-villa', 'newcastle', 0),
  ('brighton', 'fulham', 1),
  ('sunderland', 'ipswich', 1),
  ('tottenham', 'coventry', 2),
  ('hull', 'manchester-city', 24),
  ('chelsea', 'manchester-united', 25),
  ('crystal-palace', 'nottingham-forest', 25),
  ('everton', 'leeds', 26),
  ('brentford', 'arsenal', 42)
) as offs(home_slug, away_slug, offset_hours)
join public.lms_teams h on h.slug = offs.home_slug
join public.lms_teams a on a.slug = offs.away_slug
where g.season = '2026/27' and g.number = 1
  and not exists (
    select 1 from public.lms_fixtures f
    where f.gameweek_id = g.id and f.home_team_id = h.id and f.away_team_id = a.id
  );
