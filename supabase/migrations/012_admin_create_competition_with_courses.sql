-- Update admin_create_competition to accept courses (1+ per competition)
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
  v_code := case when p_access_code is null or trim(p_access_code) = '' then null else trim(p_access_code)::char(6) end;
  insert into public.competitions (
    name,
    status,
    festival_start_date,
    festival_end_date,
    selection_open_utc,
    selection_close_minutes_before_first_race,
    access_code
  ) values (
    trim(p_name),
    'upcoming',
    p_festival_start_date,
    p_festival_end_date,
    coalesce(p_selection_open_utc, '10:00'::time),
    coalesce(p_selection_close_minutes_before_first_race, 60),
    v_code
  )
  returning id into v_id;
  foreach v_course in array p_courses loop
    insert into public.competition_courses (competition_id, course)
    values (v_id, trim(v_course))
    on conflict (competition_id, course) do nothing;
  end loop;
  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

grant execute on function public.admin_create_competition(text, text, date, date, time, int, text, text[]) to anon, authenticated;
