-- Update tablet_get_data to fetch race_days via competition_race_days (race_days no longer has competition_id)
create or replace function public.tablet_get_data(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_comps jsonb;
  v_race_days jsonb;
  v_selections jsonb;
begin
  if length(trim(p_code)) <> 6 then
    return jsonb_build_object('error', 'invalid_code');
  end if;

  select user_id into v_user_id
  from public.user_tablet_codes
  where code = trim(p_code);

  if v_user_id is null then
    return jsonb_build_object('error', 'invalid_code');
  end if;

  -- Competitions user is in
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'status', c.status
  )), '[]'::jsonb) into v_comps
  from public.competition_participants cp
  join public.competitions c on c.id = cp.competition_id
  where cp.user_id = v_user_id;

  -- Race days via competition_race_days (for competitions user is in)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rd.id,
    'competition_id', crd.competition_id,
    'race_date', rd.race_date,
    'first_race_utc', rd.first_race_utc,
    'races', rd.races
  ) order by crd.competition_id, rd.race_date), '[]'::jsonb) into v_race_days
  from public.competition_race_days crd
  join public.race_days rd on rd.id = crd.race_day_id
  where crd.competition_id in (
    select competition_id from public.competition_participants where user_id = v_user_id
  );

  -- Current daily selections for this user
  select coalesce(jsonb_agg(jsonb_build_object(
    'competition_id', ds.competition_id,
    'race_date', ds.race_date,
    'selections', ds.selections
  )), '[]'::jsonb) into v_selections
  from public.daily_selections ds
  where ds.user_id = v_user_id;

  return jsonb_build_object(
    'user_id', v_user_id,
    'competitions', v_comps,
    'race_days', v_race_days,
    'selections', v_selections
  );
end;
$$;
