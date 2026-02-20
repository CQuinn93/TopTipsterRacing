-- points_system: SP-based points lookup (win/place) for horses.sp_points.
-- Same structure as TopTipster points-system (min/max decimal odds range -> points).

create table if not exists public.points_system (
  id serial primary key,
  min_fraction text,
  min_decimal numeric not null,
  max_fraction text,
  max_decimal numeric not null,
  points numeric not null,
  type text not null check (type in ('standard_win', 'standard_place', 'bonus_win', 'bonus_place')),
  created_at timestamptz not null default now()
);

create index if not exists idx_points_system_type on public.points_system(type);

alter table public.points_system enable row level security;
create policy "Points system read" on public.points_system for select using (true);
