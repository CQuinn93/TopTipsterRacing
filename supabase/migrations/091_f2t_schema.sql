-- =============================================================================
-- First2Twenty (F2T): shared player/goal data + per-competition selections
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared season: players + gameweek goals
-- ---------------------------------------------------------------------------

create table if not exists public.football_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.lms_teams(id) on delete restrict,
  display_name text not null,
  full_name text not null default '',
  fpl_element_id int unique,
  bbs_player_id text unique,
  is_active boolean not null default true,
  owner_flagged boolean not null default false,
  owner_flagged_at timestamptz,
  owner_flagged_by uuid references auth.users(id) on delete set null,
  picker_stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_football_players_team on public.football_players(team_id);
create index if not exists idx_football_players_active on public.football_players(is_active) where is_active = true;
create index if not exists idx_football_players_owner_flagged on public.football_players(owner_flagged) where owner_flagged = true;

create table if not exists public.football_player_gameweek_goals (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.football_players(id) on delete cascade,
  gameweek_id uuid not null references public.lms_gameweeks(id) on delete cascade,
  goals int not null check (goals > 0),
  synced_at timestamptz not null default now(),
  unique (player_id, gameweek_id)
);

create index if not exists idx_fpg_goals_gameweek on public.football_player_gameweek_goals(gameweek_id);

-- ---------------------------------------------------------------------------
-- F2T competitions / membership / selections (per user per competition)
-- ---------------------------------------------------------------------------

create table if not exists public.f2t_competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  season text not null default '2026/27',
  status text not null default 'open'
    check (status in ('open', 'active', 'completed')),
  start_gameweek_id uuid not null references public.lms_gameweeks(id) on delete restrict,
  entry text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.f2t_access_codes (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.f2t_competitions(id) on delete cascade,
  code char(6) not null,
  type text not null default 'join' check (type = 'join'),
  is_active boolean not null default true,
  created_by_user_id uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (code)
);

create index if not exists idx_f2t_access_codes_competition on public.f2t_access_codes(competition_id);
create index if not exists idx_f2t_access_codes_active on public.f2t_access_codes(code) where is_active = true;

create table if not exists public.f2t_join_requests (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.f2t_competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_code_id uuid not null references public.f2t_access_codes(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (competition_id, user_id)
);

create index if not exists idx_f2t_join_requests_pending
  on public.f2t_join_requests(status) where status = 'pending';

create table if not exists public.f2t_participants (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.f2t_competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'winner')),
  regular_sub_used boolean not null default false,
  completed_at timestamptz,
  joined_at timestamptz not null default now(),
  unique (competition_id, user_id)
);

create index if not exists idx_f2t_participants_user on public.f2t_participants(user_id);
create index if not exists idx_f2t_participants_comp_status on public.f2t_participants(competition_id, status);

create table if not exists public.f2t_selections (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.f2t_competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot int not null check (slot between 1 and 20),
  player_id uuid not null references public.football_players(id) on delete restrict,
  scored_at timestamptz,
  scored_gameweek_id uuid references public.lms_gameweeks(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (competition_id, user_id, slot),
  unique (competition_id, user_id, player_id)
);

create index if not exists idx_f2t_selections_comp_user on public.f2t_selections(competition_id, user_id);
create index if not exists idx_f2t_selections_player on public.f2t_selections(player_id);

create table if not exists public.f2t_substitutions (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.f2t_competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  out_player_id uuid not null references public.football_players(id) on delete restrict,
  in_player_id uuid not null references public.football_players(id) on delete restrict,
  gameweek_id uuid not null references public.lms_gameweeks(id) on delete restrict,
  type text not null check (type in ('regular', 'owner_flag')),
  created_at timestamptz not null default now()
);

create index if not exists idx_f2t_substitutions_comp_user on public.f2t_substitutions(competition_id, user_id);

create table if not exists public.f2t_competition_managers (
  competition_id uuid not null references public.f2t_competitions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

create index if not exists idx_f2t_competition_managers_user on public.f2t_competition_managers(user_id);

-- ---------------------------------------------------------------------------
-- Helpers (before RLS policies that reference them)
-- ---------------------------------------------------------------------------

create or replace function public.f2t_is_competition_member(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.f2t_participants p
    where p.competition_id = p_competition_id and p.user_id = auth.uid()
  );
$$;

create or replace function public.f2t_has_competition_join_request(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.f2t_join_requests r
    where r.competition_id = p_competition_id and r.user_id = auth.uid()
  );
$$;

create or replace function public.f2t_can_manage_competition(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_owner()
    or exists (
      select 1 from public.f2t_competitions c
      where c.id = p_competition_id and c.created_by_user_id = auth.uid()
    );
$$;

create or replace function public.f2t_is_competition_manager(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.f2t_competition_managers m
    where m.competition_id = p_competition_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.f2t_can_handle_joins(p_competition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.f2t_can_manage_competition(p_competition_id)
    or public.f2t_is_competition_manager(p_competition_id);
$$;

create or replace function public.f2t_competition_join_open(p_competition_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deadline timestamptz;
begin
  select sg.deadline_at
  into v_deadline
  from public.f2t_competitions c
  join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
  where c.id = p_competition_id;

  if v_deadline is null then
    return true;
  end if;

  return now() < v_deadline;
end;
$$;

create or replace function public.f2t_player_scored_since_start(
  p_competition_id uuid,
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.football_player_gameweek_goals g
    join public.lms_gameweeks gw on gw.id = g.gameweek_id
    join public.f2t_competitions c on c.id = p_competition_id
    join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    where g.player_id = p_player_id
      and gw.season = c.season
      and gw.number >= sg.number
  );
$$;

create or replace function public.f2t_player_selectable(p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.football_players fp
    where fp.id = p_player_id
      and fp.is_active = true
      and fp.owner_flagged = false
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.football_players enable row level security;
alter table public.football_player_gameweek_goals enable row level security;
alter table public.f2t_competitions enable row level security;
alter table public.f2t_access_codes enable row level security;
alter table public.f2t_join_requests enable row level security;
alter table public.f2t_participants enable row level security;
alter table public.f2t_selections enable row level security;
alter table public.f2t_substitutions enable row level security;
alter table public.f2t_competition_managers enable row level security;

drop policy if exists "football_players_select" on public.football_players;
create policy "football_players_select" on public.football_players
  for select to authenticated using (true);

drop policy if exists "football_player_gameweek_goals_select" on public.football_player_gameweek_goals;
create policy "football_player_gameweek_goals_select" on public.football_player_gameweek_goals
  for select to authenticated using (true);

drop policy if exists "f2t_competitions_select_member" on public.f2t_competitions;
create policy "f2t_competitions_select_member" on public.f2t_competitions
  for select to authenticated
  using (
    public.f2t_is_competition_member(id)
    or public.f2t_has_competition_join_request(id)
    or public.f2t_can_manage_competition(id)
    or public.f2t_can_handle_joins(id)
  );

drop policy if exists "f2t_join_requests_select" on public.f2t_join_requests;
create policy "f2t_join_requests_select" on public.f2t_join_requests
  for select to authenticated
  using (user_id = auth.uid() or public.f2t_can_handle_joins(competition_id));

drop policy if exists "f2t_join_requests_insert_own" on public.f2t_join_requests;
create policy "f2t_join_requests_insert_own" on public.f2t_join_requests
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "f2t_participants_select_same_comp" on public.f2t_participants;
create policy "f2t_participants_select_same_comp" on public.f2t_participants
  for select to authenticated
  using (public.f2t_is_competition_member(competition_id));

drop policy if exists "f2t_selections_select_same_comp" on public.f2t_selections;
create policy "f2t_selections_select_same_comp" on public.f2t_selections
  for select to authenticated
  using (public.f2t_is_competition_member(competition_id));

drop policy if exists "f2t_substitutions_select_same_comp" on public.f2t_substitutions;
create policy "f2t_substitutions_select_same_comp" on public.f2t_substitutions
  for select to authenticated
  using (public.f2t_is_competition_member(competition_id));

drop policy if exists "f2t_competition_managers_select" on public.f2t_competition_managers;
create policy "f2t_competition_managers_select" on public.f2t_competition_managers
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.f2t_is_competition_member(competition_id)
    or public.f2t_can_handle_joins(competition_id)
  );
