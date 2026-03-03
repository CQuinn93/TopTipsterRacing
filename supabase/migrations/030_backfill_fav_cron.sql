-- Backfill FAV selections via pg_cron: run every 10 minutes.
-- Runs when the selection deadline has passed: first_race_utc - 1 hour <= now() (i.e. at or after "1 hr before first race").
-- 1) Allow cron backfill to bypass the "selections locked" trigger.
-- 2) Function: find race_days where (first_race_utc - 1hr) <= now() and is_backfilled = false;
--    for each, fill missing per-race selections with FAV for all participants, then set is_backfilled = true.
-- 3) Schedule: every 10 minutes.
-- Note: pg_cron runs inside Postgres (no API/service key); the function uses SECURITY DEFINER so it has full DB access.

-- 1. Let the lock trigger skip when the backfill function sets app.allow_backfill = 'true'
create or replace function public.check_selections_not_locked()
returns trigger
language plpgsql
as $$
declare
  v_first_race_utc timestamptz;
  v_deadline timestamptz;
begin
  if current_setting('app.allow_backfill', true) = 'true' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.locked_at is not null then
    raise exception 'Selections are locked - you locked them in early'
      using errcode = 'check_violation';
  end if;

  select rd.first_race_utc into v_first_race_utc
  from public.race_days rd
  join public.competition_race_days crd on crd.race_day_id = rd.id
  where crd.competition_id = new.competition_id
    and rd.race_date = new.race_date
  limit 1;

  if v_first_race_utc is null then
    return new;
  end if;

  v_deadline := v_first_race_utc - interval '1 hour';
  if now() >= v_deadline then
    if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.selections is distinct from old.selections) then
      raise exception 'Selections are locked - less than 1 hour until the first race of this meeting'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- 2. Backfill function: run once per race day (uses is_backfilled so each day only backfilled once)
create or replace function public.backfill_fav_selections_for_today()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rd record;
  r record;
  v_race_ids text[];
  v_comp_id uuid;
  v_user_id uuid;
  v_race_date date;
  v_current jsonb;
  v_new jsonb;
  v_fav jsonb := '{"runnerId":"FAV","runnerName":"FAV","oddsDecimal":0}'::jsonb;
  v_changed boolean;
  v_updated int;
  v_race_id text;
begin
  perform set_config('app.allow_backfill', 'true', true);

  for rd in
    select id, race_date, first_race_utc
    from public.race_days
    where (first_race_utc - interval '1 hour') <= now()
      and coalesce(is_backfilled, false) = false
  loop
    select array_agg(api_race_id) into v_race_ids
    from public.races
    where race_day_id = rd.id and api_race_id is not null and api_race_id <> '';

    if v_race_ids is null or array_length(v_race_ids, 1) is null then
      update public.race_days set is_backfilled = true, backfilled_at = now() where id = rd.id;
      continue;
    end if;

    v_race_date := rd.race_date;
    v_updated := 0;

    for r in
      select distinct crd.competition_id, cp.user_id
      from public.competition_race_days crd
      join public.competition_participants cp on cp.competition_id = crd.competition_id
      where crd.race_day_id = rd.id
    loop
      v_comp_id := r.competition_id;
      v_user_id := r.user_id;

      select coalesce(selections, '{}'::jsonb) into v_current
      from public.daily_selections
      where competition_id = v_comp_id and user_id = v_user_id and race_date = v_race_date;

      v_new := coalesce(v_current, '{}'::jsonb);
      v_changed := false;

      foreach v_race_id in array v_race_ids loop
        if not (v_new ? v_race_id) then
          v_new := v_new || jsonb_build_object(v_race_id, v_fav);
          v_changed := true;
        end if;
      end loop;

      if v_changed then
        insert into public.daily_selections (competition_id, user_id, race_date, selections, updated_at)
        values (v_comp_id, v_user_id, v_race_date, v_new, now())
        on conflict (competition_id, user_id, race_date)
        do update set selections = excluded.selections, updated_at = excluded.updated_at;
        v_updated := v_updated + 1;
      end if;
    end loop;

    update public.race_days set is_backfilled = true, backfilled_at = now() where id = rd.id;
    if v_updated > 0 then
      raise notice 'backfill_fav: race_day % (%) - % selection row(s) backfilled', rd.race_date, rd.id, v_updated;
    end if;
  end loop;

  perform set_config('app.allow_backfill', '', true);
end;
$$;

-- 3. Schedule every 10 minutes, only between 12:00 and 18:59 UTC (12pm–6pm).
-- Requires pg_cron (Supabase: enable in Database → Extensions, then add job in Integrations → Cron if not enabled in migrations).
-- To replace: in Dashboard Cron, delete job "backfill-fav-every-10min" then re-run this migration or add the schedule manually.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'backfill-fav-every-10min',
      '*/10 12-18 * * *',
      $cmd$select public.backfill_fav_selections_for_today()$cmd$
    );
  end if;
exception
  when undefined_object then null;
  when unique_violation then null; -- job name already exists
end $$;
