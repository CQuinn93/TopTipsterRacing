-- Enforce selections lock 1 hour before first race of the meeting.
-- Rejects INSERT/UPDATE on daily_selections when first_race_utc - 1 hour <= now().

create or replace function public.check_selections_not_locked()
returns trigger
language plpgsql
as $$
declare
  v_first_race_utc timestamptz;
  v_deadline timestamptz;
begin
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
    raise exception 'Selections are locked - less than 1 hour until the first race of this meeting'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists daily_selections_lock_before_first_race on public.daily_selections;
create trigger daily_selections_lock_before_first_race
  before insert or update on public.daily_selections
  for each row
  execute function public.check_selections_not_locked();
