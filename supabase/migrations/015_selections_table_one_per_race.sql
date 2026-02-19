-- Selections: one row per (user, competition, race, horse) to match the entity model.
-- "A Selection belongs to 1 User, 1 Competition, 1 Race, 1 Horse."

create table if not exists public.selections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  race_id uuid not null references public.races(id) on delete cascade,
  horse_id uuid not null references public.horses(id) on delete cascade,
  odds_decimal numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, competition_id, race_id)
);

create index if not exists idx_selections_user_competition on public.selections(user_id, competition_id);
create index if not exists idx_selections_race on public.selections(race_id);

alter table public.selections enable row level security;

create policy "Selections read" on public.selections for select using (true);
create policy "Selections insert own" on public.selections for insert with check (auth.uid() = user_id);
create policy "Selections update own" on public.selections for update using (auth.uid() = user_id);
create policy "Selections delete own" on public.selections for delete using (auth.uid() = user_id);

comment on table public.selections is 'One row per user pick: user selects one horse in one race within one competition.';
