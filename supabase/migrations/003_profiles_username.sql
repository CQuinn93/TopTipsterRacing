-- Profiles: one row per user with a unique username (set at sign-up for leaderboard display).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_username on public.profiles(username);

alter table public.profiles enable row level security;

create policy "Profiles read own" on public.profiles for select using (auth.uid() = id);
create policy "Profiles insert own" on public.profiles for insert with check (auth.uid() = id);
create policy "Profiles update own" on public.profiles for update using (auth.uid() = id);

-- Allow reading any profile (for leaderboard display names)
create policy "Profiles read all" on public.profiles for select using (true);
