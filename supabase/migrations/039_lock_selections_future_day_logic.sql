-- Make lock_selections behavior explicit and user-friendly:
-- - lock applies to the requested race day only
-- - allows locking future days (before that day's deadline)
-- - returns specific error codes for UI messages

create or replace function public.lock_selections(
  p_competition_id uuid,
  p_race_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_race_utc timestamptz;
  v_deadline timestamptz;
  v_locked_at timestamptz;
begin
  select rd.first_race_utc into v_first_race_utc
  from public.race_days rd
  join public.competition_race_days crd on crd.race_day_id = rd.id
  where crd.competition_id = p_competition_id
    and rd.race_date = p_race_date
  limit 1;

  if v_first_race_utc is null then
    return jsonb_build_object('success', false, 'error', 'race_day_not_found');
  end if;

  v_deadline := v_first_race_utc - interval '1 hour';
  if now() >= v_deadline then
    return jsonb_build_object('success', false, 'error', 'deadline_passed');
  end if;

  select locked_at into v_locked_at
  from public.daily_selections
  where competition_id = p_competition_id
    and race_date = p_race_date
    and user_id = auth.uid()
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'selection_not_found');
  end if;

  if v_locked_at is not null then
    return jsonb_build_object('success', false, 'error', 'already_locked');
  end if;

  update public.daily_selections
  set locked_at = now(), updated_at = now()
  where competition_id = p_competition_id
    and race_date = p_race_date
    and user_id = auth.uid();

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.lock_selections(uuid, date) to authenticated;
