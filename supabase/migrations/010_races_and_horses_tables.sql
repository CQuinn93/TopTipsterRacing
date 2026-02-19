-- Races and horses tables for full API data (racecards + results with Winner, Place 1–4).
-- race_days remains the source for the app JSON; these tables store full runner details and results.

-- Create races first (winner/place columns added without FK to horses yet).
create table if not exists public.races (
  id uuid primary key default gen_random_uuid(),
  race_day_id uuid not null references public.race_days(id) on delete cascade,
  api_race_id text not null,
  name text not null,
  scheduled_time_utc timestamptz not null,
  distance text,
  is_handicap boolean not null default false,
  winner_horse_id uuid,
  place1_horse_id uuid,
  place2_horse_id uuid,
  place3_horse_id uuid,
  place4_horse_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(race_day_id, api_race_id)
);

create table if not exists public.horses (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  api_horse_id text not null,
  name text not null,
  jockey text,
  trainer text,
  age text,
  weight text,
  number text,
  last_ran_days_ago text,
  non_runner text not null default '0',
  form text,
  owner text,
  odds_decimal numeric,
  sp numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(race_id, api_horse_id)
);

-- Add FKs from races to horses (for winner/place columns).
alter table public.races
  add constraint races_winner_horse_id_fkey foreign key (winner_horse_id) references public.horses(id) on delete set null,
  add constraint races_place1_horse_id_fkey foreign key (place1_horse_id) references public.horses(id) on delete set null,
  add constraint races_place2_horse_id_fkey foreign key (place2_horse_id) references public.horses(id) on delete set null,
  add constraint races_place3_horse_id_fkey foreign key (place3_horse_id) references public.horses(id) on delete set null,
  add constraint races_place4_horse_id_fkey foreign key (place4_horse_id) references public.horses(id) on delete set null;

create index if not exists idx_races_race_day_id on public.races(race_day_id);
create index if not exists idx_races_scheduled_time_utc on public.races(scheduled_time_utc);
create index if not exists idx_horses_race_id on public.horses(race_id);

alter table public.races enable row level security;
alter table public.horses enable row level security;
create policy "Races read" on public.races for select using (true);
create policy "Horses read" on public.horses for select using (true);
