-- Compatibility updates so legacy WC scripts run against wc2026 schema.

create schema if not exists wc2026;

alter table if exists wc2026.groups
  add column if not exists tournament_stage_id uuid references wc2026.tournament_stages(id);

create table if not exists wc2026.group_teams (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references wc2026.groups(id) on delete cascade,
  team_id uuid references wc2026.teams(id) on delete cascade,
  position integer check (position between 1 and 4),
  points integer default 0,
  goals_for integer default 0,
  goals_against integer default 0,
  goal_difference integer default 0,
  matches_played integer default 0,
  wins integer default 0,
  draws integer default 0,
  losses integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(group_id, team_id)
);

create index if not exists idx_wc2026_group_teams_group on wc2026.group_teams(group_id);
create index if not exists idx_wc2026_group_teams_team on wc2026.group_teams(team_id);

alter table wc2026.group_teams enable row level security;

drop policy if exists "wc2026_read_group_teams" on wc2026.group_teams;
create policy "wc2026_read_group_teams" on wc2026.group_teams
  for select to authenticated
  using (true);
