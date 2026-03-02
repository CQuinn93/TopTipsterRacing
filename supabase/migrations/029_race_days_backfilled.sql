-- Add columns to track FAV backfill per race day.
-- Backfill runs once per race day when first_race_utc + 1 hour <= now.
alter table public.race_days
  add column if not exists is_backfilled boolean not null default false,
  add column if not exists backfilled_at timestamptz;
