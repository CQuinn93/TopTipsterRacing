-- Add display_name (username) to tablet_get_data for Welcome message
create or replace function public.tablet_get_data(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_display_name text;
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

  select coalesce(
    (select username from public.profiles where id = v_user_id),
    (select display_name from public.competition_participants where user_id = v_user_id limit 1),
    'there'
  ) into v_display_name;

  -- Competitions user is in (status computed from dates)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'status', case
      when current_date < c.festival_start_date then 'upcoming'
      when current_date >= c.festival_start_date and current_date <= c.festival_end_date then 'live'
      else 'complete'
    end
  )), '[]'::jsonb) into v_comps
  from public.competition_participants cp
  join public.competitions c on c.id = cp.competition_id
  where cp.user_id = v_user_id;

  -- Race days via competition_race_days; races derived from races + horses
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rd.id,
    'competition_id', crd.competition_id,
    'race_date', rd.race_date,
    'first_race_utc', rd.first_race_utc,
    'races', public.get_races_for_race_day(rd.id)
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
    'display_name', v_display_name,
    'competitions', v_comps,
    'race_days', v_race_days,
    'selections', v_selections
  );
end;
$$;
