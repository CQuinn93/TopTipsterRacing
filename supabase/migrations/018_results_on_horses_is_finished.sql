-- Results stored on horses (position, is_fav, pos_points, sp_points); races.is_finished.
-- Remove winner/place columns from races; single source of truth is horses.position.

-- Add new columns to horses
alter table public.horses
  add column if not exists position integer,
  add column if not exists is_fav boolean not null default false,
  add column if not exists pos_points numeric,
  add column if not exists sp_points numeric;

-- Add is_finished to races (default false for new races)
alter table public.races
  add column if not exists is_finished boolean not null default false;

-- For existing races that already have results, mark as finished before we drop the columns
update public.races
set is_finished = true
where winner_horse_id is not null;

-- Drop FK constraints and place columns from races
alter table public.races drop constraint if exists races_winner_horse_id_fkey;
alter table public.races drop constraint if exists races_place1_horse_id_fkey;
alter table public.races drop constraint if exists races_place2_horse_id_fkey;
alter table public.races drop constraint if exists races_place3_horse_id_fkey;
alter table public.races drop constraint if exists races_place4_horse_id_fkey;

alter table public.races drop column if exists winner_horse_id;
alter table public.races drop column if exists place1_horse_id;
alter table public.races drop column if exists place2_horse_id;
alter table public.races drop column if exists place3_horse_id;
alter table public.races drop column if exists place4_horse_id;
