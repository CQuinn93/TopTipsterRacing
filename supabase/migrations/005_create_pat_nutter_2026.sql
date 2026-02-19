-- Create competition: Pat Nutter 2026
-- Run this in Supabase SQL Editor after the initial schema (001) is applied.
-- Safe to run multiple times: only inserts if no competition with this name exists.

insert into public.competitions (
  name,
  status,
  festival_start_date,
  festival_end_date,
  selection_open_utc,
  selection_close_minutes_before_first_race
)
select
  'Pat Nutter 2026',
  'upcoming',
  '2026-03-10'::date,
  '2026-03-13'::date,
  '08:00'::time,
  60
where not exists (
  select 1 from public.competitions where name = 'Pat Nutter 2026'
);
