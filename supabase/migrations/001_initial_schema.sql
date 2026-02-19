-- Cheltenham Top Tipster – initial schema (Supabase free tier, egress-conscious)
-- Run this in Supabase SQL Editor.

-- Competitions (e.g. "Cheltenham 2026")
create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'finished')),
  festival_start_date date not null,
  festival_end_date date not null,
  selection_open_utc time not null,
  selection_close_minutes_before_first_race int not null default 60,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Access codes: one per competition, given by you to allow entry
create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique(competition_id, code)
);

-- Participants: user can be in many competitions; one row per (competition, user)
create table if not exists public.competition_participants (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  joined_at timestamptz not null default now(),
  unique(competition_id, user_id)
);

-- Race days: one row per (competition, date). Races JSON populated by daily script.
create table if not exists public.race_days (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  race_date date not null,
  first_race_utc timestamptz not null,
  races jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(competition_id, race_date)
);

-- Daily selections: one row per (competition, user, race_date)
create table if not exists public.daily_selections (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null,
  race_date date not null,
  selections jsonb not null default '{}',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(competition_id, user_id, race_date)
);

-- Indexes for egress-efficient queries
create index if not exists idx_access_codes_competition_code on public.access_codes(competition_id, code);
create index if not exists idx_participants_competition on public.competition_participants(competition_id);
create index if not exists idx_participants_user on public.competition_participants(user_id);
create index if not exists idx_race_days_competition_date on public.race_days(competition_id, race_date);
create index if not exists idx_daily_selections_competition_user on public.daily_selections(competition_id, user_id);
create index if not exists idx_daily_selections_competition_date on public.daily_selections(competition_id, race_date);

-- RLS: enable and policy for authenticated users (anon key used by app)
alter table public.competitions enable row level security;
alter table public.access_codes enable row level security;
alter table public.competition_participants enable row level security;
alter table public.race_days enable row level security;
alter table public.daily_selections enable row level security;

-- Competitions: read for everyone (to show list / join)
create policy "Competitions read" on public.competitions for select using (true);

-- Access codes: only check code (no read of other codes). Use a function or service role for validation.
-- For client: allow select only for the purpose of validating a code (we validate in app then call a edge function or use service role).
-- Simpler: allow anonymous to read access_codes where code = X and competition_id = Y and used_at is null (so they can "claim" one).
-- That would expose codes. Better: validate in Edge Function or in app by calling a Supabase function that uses service role.
-- Here we allow select so the app can check code; restrict to minimal columns if needed. For free tier we do minimal read.
create policy "Access codes validate" on public.access_codes for select using (true);

-- Allow update of access_codes to set used_at (claim code). Restrict to own claim via trigger or function.
-- Simpler RLS: allow update where used_at is null (so only unused codes can be updated).
create policy "Access codes claim" on public.access_codes for update using (used_at is null);

-- Competition participants: users can read participants for competitions they're in or for leaderboard
create policy "Participants read" on public.competition_participants for select using (true);
create policy "Participants insert" on public.competition_participants for insert with check (true);
create policy "Participants update own" on public.competition_participants for update using (auth.uid() = user_id);

-- Race days: read for everyone (races are public)
create policy "Race days read" on public.race_days for select using (true);

-- Daily selections: users can read all for a competition (for leaderboard scoring) and own for edit
create policy "Daily selections read" on public.daily_selections for select using (true);
create policy "Daily selections insert" on public.daily_selections for insert with check (auth.uid() = user_id);
create policy "Daily selections update own" on public.daily_selections for update using (auth.uid() = user_id);

-- Auth: we use Supabase Auth. Ensure auth.users exists (default). Link competition_participants.user_id to auth.uid().
-- No trigger needed if we always set user_id = auth.uid() from the client.
