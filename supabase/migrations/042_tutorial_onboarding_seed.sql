-- Onboarding tutorial dataset (separate from live competitions).
-- Designed to be date-agnostic so the app can shift race times to "today" on the client.

create table if not exists public.tutorial_meetings (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  subtitle text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tutorial_races (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.tutorial_meetings(id) on delete cascade,
  sort_order int not null,
  race_name text not null,
  -- Minutes from meeting start (client can map meeting start to current day/time).
  starts_after_minutes int not null default 0,
  unique(meeting_id, sort_order)
);

create table if not exists public.tutorial_runners (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.tutorial_races(id) on delete cascade,
  api_horse_id text not null,
  horse_name text not null,
  number int,
  jockey text,
  odds_decimal numeric(6,2),
  is_fav boolean not null default false,
  result_position int,
  result_code text,
  unique(race_id, api_horse_id)
);

create table if not exists public.tutorial_bot_users (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.tutorial_meetings(id) on delete cascade,
  display_name text not null,
  avatar_color text,
  unique(meeting_id, display_name)
);

create table if not exists public.tutorial_bot_selections (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.tutorial_meetings(id) on delete cascade,
  bot_user_id uuid not null references public.tutorial_bot_users(id) on delete cascade,
  race_id uuid not null references public.tutorial_races(id) on delete cascade,
  runner_horse_id text not null,
  runner_name text not null,
  odds_decimal numeric(6,2),
  unique(bot_user_id, race_id)
);

alter table public.tutorial_meetings enable row level security;
alter table public.tutorial_races enable row level security;
alter table public.tutorial_runners enable row level security;
alter table public.tutorial_bot_users enable row level security;
alter table public.tutorial_bot_selections enable row level security;

create policy "Tutorial meetings read" on public.tutorial_meetings for select using (true);
create policy "Tutorial races read" on public.tutorial_races for select using (true);
create policy "Tutorial runners read" on public.tutorial_runners for select using (true);
create policy "Tutorial bot users read" on public.tutorial_bot_users for select using (true);
create policy "Tutorial bot selections read" on public.tutorial_bot_selections for select using (true);

-- Single starter tutorial meeting (3 races) with demo runners/results.
insert into public.tutorial_meetings (id, slug, title, subtitle, is_active)
values
  ('10000000-0000-0000-0000-000000000001', 'starter-tour', 'Top Tipster Tutorial', 'Learn how to join, pick, lock, and track points.', true)
on conflict (slug) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.tutorial_races (id, meeting_id, sort_order, race_name, starts_after_minutes)
values
  ('10000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000001', 1, '2m Novices Hurdle', 0),
  ('10000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000001', 2, '2m4f Handicap Chase', 35),
  ('10000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000001', 3, '3m Feature Hurdle', 70)
on conflict (id) do nothing;

insert into public.tutorial_runners (id, race_id, api_horse_id, horse_name, number, jockey, odds_decimal, is_fav, result_position, result_code)
values
  -- Race 1
  ('10000000-0000-0000-0000-000000001001', '10000000-0000-0000-0000-000000000101', 'TUT-R1-H1', 'Green Lantern', 1, 'S. Walsh', 3.50, true, 1, null),
  ('10000000-0000-0000-0000-000000001002', '10000000-0000-0000-0000-000000000101', 'TUT-R1-H2', 'Silver Crest', 2, 'J. Doyle', 5.00, false, 2, null),
  ('10000000-0000-0000-0000-000000001003', '10000000-0000-0000-0000-000000000101', 'TUT-R1-H3', 'River Call', 3, 'R. Black', 8.00, false, 3, null),
  ('10000000-0000-0000-0000-000000001004', '10000000-0000-0000-0000-000000000101', 'TUT-R1-H4', 'Bold Venture', 4, 'K. Moore', 10.00, false, null, 'pu'),
  -- Race 2
  ('10000000-0000-0000-0000-000000002001', '10000000-0000-0000-0000-000000000102', 'TUT-R2-H1', 'Mountain Echo', 1, 'P. Townend', 4.00, false, 2, null),
  ('10000000-0000-0000-0000-000000002002', '10000000-0000-0000-0000-000000000102', 'TUT-R2-H2', 'Royal Mint', 2, 'D. Russell', 3.25, true, 1, null),
  ('10000000-0000-0000-0000-000000002003', '10000000-0000-0000-0000-000000000102', 'TUT-R2-H3', 'Blue Ridge', 3, 'C. OBrien', 7.50, false, 3, null),
  ('10000000-0000-0000-0000-000000002004', '10000000-0000-0000-0000-000000000102', 'TUT-R2-H4', 'Storm Chaser', 4, 'M. Nolan', 11.00, false, null, 'f'),
  -- Race 3
  ('10000000-0000-0000-0000-000000003001', '10000000-0000-0000-0000-000000000103', 'TUT-R3-H1', 'Golden Vale', 1, 'B. Hayes', 6.00, false, 2, null),
  ('10000000-0000-0000-0000-000000003002', '10000000-0000-0000-0000-000000000103', 'TUT-R3-H2', 'Winter Flame', 2, 'H. Cobden', 2.90, true, 1, null),
  ('10000000-0000-0000-0000-000000003003', '10000000-0000-0000-0000-000000000103', 'TUT-R3-H3', 'High Admiral', 3, 'L. McKenna', 9.00, false, 3, null),
  ('10000000-0000-0000-0000-000000003004', '10000000-0000-0000-0000-000000000103', 'TUT-R3-H4', 'Final Bell', 4, 'G. Sheehan', 12.00, false, null, 'u')
on conflict (id) do nothing;

insert into public.tutorial_bot_users (id, meeting_id, display_name, avatar_color)
values
  ('10000000-0000-0000-0000-000000010001', '10000000-0000-0000-0000-000000000001', 'Megan (Bot)', '#10b981'),
  ('10000000-0000-0000-0000-000000010002', '10000000-0000-0000-0000-000000000001', 'Tom (Bot)', '#3b82f6'),
  ('10000000-0000-0000-0000-000000010003', '10000000-0000-0000-0000-000000000001', 'Sarah (Bot)', '#f59e0b')
on conflict (id) do nothing;

insert into public.tutorial_bot_selections (meeting_id, bot_user_id, race_id, runner_horse_id, runner_name, odds_decimal)
values
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000010001', '10000000-0000-0000-0000-000000000101', 'TUT-R1-H2', 'Silver Crest', 5.00),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000010001', '10000000-0000-0000-0000-000000000102', 'TUT-R2-H2', 'Royal Mint', 3.25),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000010001', '10000000-0000-0000-0000-000000000103', 'TUT-R3-H1', 'Golden Vale', 6.00),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000010002', '10000000-0000-0000-0000-000000000101', 'TUT-R1-H1', 'Green Lantern', 3.50),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000010002', '10000000-0000-0000-0000-000000000102', 'TUT-R2-H3', 'Blue Ridge', 7.50),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000010002', '10000000-0000-0000-0000-000000000103', 'TUT-R3-H2', 'Winter Flame', 2.90),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000010003', '10000000-0000-0000-0000-000000000101', 'TUT-R1-H3', 'River Call', 8.00),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000010003', '10000000-0000-0000-0000-000000000102', 'TUT-R2-H1', 'Mountain Echo', 4.00),
  ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000010003', '10000000-0000-0000-0000-000000000103', 'TUT-R3-H3', 'High Admiral', 9.00)
on conflict (bot_user_id, race_id) do update set
  runner_horse_id = excluded.runner_horse_id,
  runner_name = excluded.runner_name,
  odds_decimal = excluded.odds_decimal;
