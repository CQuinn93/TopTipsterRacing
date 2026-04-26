-- Core World Cup schema for shared Top Tipster Supabase project.
-- Run this in Supabase SQL Editor before testing WC data flows.

create schema if not exists wc2026;

create table if not exists wc2026.teams (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique,
  country_name text not null,
  confederation text not null,
  fifa_ranking int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wc2026.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  country text not null,
  capacity int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wc2026.groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null unique
);

create table if not exists wc2026.tournament_stages (
  id uuid primary key default gen_random_uuid(),
  stage_name text not null unique,
  stage_order int not null,
  is_knockout boolean not null default false
);

create table if not exists wc2026.matches (
  id uuid primary key default gen_random_uuid(),
  match_number int not null unique,
  tournament_stage_id uuid not null references wc2026.tournament_stages(id),
  group_id uuid references wc2026.groups(id),
  home_team_id uuid not null references wc2026.teams(id),
  away_team_id uuid not null references wc2026.teams(id),
  venue_id uuid not null references wc2026.venues(id),
  match_date timestamptz not null,
  home_score int,
  away_score int,
  status text not null default 'scheduled',
  is_knockout boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wc2026.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid references wc2026.matches(id) on delete cascade,
  match_number int,
  prediction_type text not null check (prediction_type in ('ante_post', 'live')),
  home_score int,
  away_score int,
  predicted_winner_id uuid references wc2026.teams(id),
  points_awarded int,
  is_correct boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_number, prediction_type)
);

alter table wc2026.teams enable row level security;
alter table wc2026.venues enable row level security;
alter table wc2026.groups enable row level security;
alter table wc2026.tournament_stages enable row level security;
alter table wc2026.matches enable row level security;
alter table wc2026.predictions enable row level security;

-- Read-only public reference data
drop policy if exists "wc2026_read_teams" on wc2026.teams;
create policy "wc2026_read_teams" on wc2026.teams for select to authenticated using (true);

drop policy if exists "wc2026_read_venues" on wc2026.venues;
create policy "wc2026_read_venues" on wc2026.venues for select to authenticated using (true);

drop policy if exists "wc2026_read_groups" on wc2026.groups;
create policy "wc2026_read_groups" on wc2026.groups for select to authenticated using (true);

drop policy if exists "wc2026_read_stages" on wc2026.tournament_stages;
create policy "wc2026_read_stages" on wc2026.tournament_stages for select to authenticated using (true);

drop policy if exists "wc2026_read_matches" on wc2026.matches;
create policy "wc2026_read_matches" on wc2026.matches for select to authenticated using (true);

-- Prediction ownership policies
drop policy if exists "wc2026_read_own_predictions" on wc2026.predictions;
create policy "wc2026_read_own_predictions" on wc2026.predictions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "wc2026_insert_own_predictions" on wc2026.predictions;
create policy "wc2026_insert_own_predictions" on wc2026.predictions
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "wc2026_update_own_predictions" on wc2026.predictions;
create policy "wc2026_update_own_predictions" on wc2026.predictions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_wc2026_matches_date on wc2026.matches(match_date);
create index if not exists idx_wc2026_predictions_user on wc2026.predictions(user_id);
create index if not exists idx_wc2026_predictions_match_number on wc2026.predictions(match_number);
