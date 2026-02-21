-- Drop competitions.status column. Status is derived from festival_start_date and festival_end_date:
-- upcoming: today < start, live: start <= today <= end, complete: today > end

-- Update user_competitions view to compute status from dates
create or replace view public.user_competitions as
select
  c.id as competition_id,
  c.name,
  case
    when current_date < c.festival_start_date then 'upcoming'
    when current_date >= c.festival_start_date and current_date <= c.festival_end_date then 'live'
    else 'complete'
  end as status,
  c.festival_start_date,
  c.festival_end_date,
  cp.display_name
from public.competitions c
join public.competition_participants cp on cp.competition_id = c.id
where cp.user_id = auth.uid();

-- Update tablet_get_data to compute status from dates
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
    'competitions', v_comps,
    'race_days', v_race_days,
    'selections', v_selections
  );
end;
$$;

-- Update admin_create_competition to not insert status (column will be dropped)
create or replace function public.admin_create_competition(
  p_admin_code text,
  p_name text,
  p_festival_start_date date,
  p_festival_end_date date,
  p_selection_open_utc time default '10:00'::time,
  p_selection_close_minutes_before_first_race int default 60,
  p_access_code text default null,
  p_courses text[] default array['Newcastle']
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code char(6);
  v_course text;
begin
  if trim(p_admin_code) <> '777777' then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  if trim(p_name) is null or trim(p_name) = '' then
    return jsonb_build_object('success', false, 'error', 'name_required');
  end if;
  if p_courses is null or array_length(p_courses, 1) is null or array_length(p_courses, 1) < 1 then
    p_courses := array['Newcastle'];
  end if;
  v_course := trim(p_courses[1]);
  if v_course = '' then v_course := 'Newcastle'; end if;
  v_code := case when p_access_code is null or trim(p_access_code) = '' then null else trim(p_access_code)::char(6) end;
  insert into public.competitions (
    name,
    festival_start_date,
    festival_end_date,
    selection_open_utc,
    selection_close_minutes_before_first_race,
    access_code
  ) values (
    trim(p_name),
    p_festival_start_date,
    p_festival_end_date,
    coalesce(p_selection_open_utc, '10:00'::time),
    coalesce(p_selection_close_minutes_before_first_race, 60),
    v_code
  )
  returning id into v_id;
  insert into public.competition_courses (competition_id, course)
  values (v_id, v_course)
  on conflict (competition_id) do update set course = excluded.course;
  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

-- Drop status column from competitions
alter table public.competitions drop column if exists status;
