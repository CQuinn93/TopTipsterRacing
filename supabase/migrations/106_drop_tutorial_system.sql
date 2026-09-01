-- Drop legacy database objects no longer used by Racing, LMS, F2T, or the competition hub.
-- Safe to re-run: IF EXISTS / CASCADE throughout.

-- ---------------------------------------------------------------------------
-- 1) Tutorial sandbox (removed from app; replaced by Getting started screen)
-- ---------------------------------------------------------------------------

drop function if exists public.tutorial_get_data(text);

drop table if exists public.tutorial_bot_selections;
drop table if exists public.tutorial_bot_users;
drop table if exists public.tutorial_runners;
drop table if exists public.tutorial_races;
drop table if exists public.tutorial_meetings;

-- ---------------------------------------------------------------------------
-- 2) WC2026 World Cup module (app routes removed; no active competitions)
-- ---------------------------------------------------------------------------

drop schema if exists wc2026 cascade;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ~ '^wc_'
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Racing selections normalised table (app uses daily_selections JSON only)
-- ---------------------------------------------------------------------------

drop table if exists public.selections;

-- ---------------------------------------------------------------------------
-- 4) Tablet quick-access (dropped in 062; remove if still present on older DBs)
-- ---------------------------------------------------------------------------

drop function if exists public.tablet_get_data(text);
drop function if exists public.tablet_submit_selections(text, uuid, date, jsonb);
drop table if exists public.user_tablet_codes;

-- ---------------------------------------------------------------------------
-- 5) Obsolete RPCs (only referenced by removed tablet / WC / tutorial code)
-- ---------------------------------------------------------------------------

drop function if exists public.get_races_for_race_day(uuid);

-- Safety re-drop if an earlier partial run of this migration left stragglers
drop function if exists public.tutorial_get_data(text);

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ~ '^wc_'
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end;
$$;
