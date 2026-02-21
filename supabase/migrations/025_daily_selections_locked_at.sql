-- Add locked_at for early lock-in. When set, no further edits allowed.
alter table public.daily_selections add column if not exists locked_at timestamptz;

-- Update trigger: also reject when row is already locked (user locked early).
create or replace function public.check_selections_not_locked()
returns trigger
language plpgsql
as $$
declare
  v_first_race_utc timestamptz;
  v_deadline timestamptz;
begin
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
