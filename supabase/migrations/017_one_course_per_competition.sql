-- Enforce one course (one meeting) per competition.
-- Keep a single row per competition_id; remove duplicates then add unique.

-- Remove duplicate rows, keeping one per competition (lowest id)
delete from public.competition_courses a
using public.competition_courses b
where a.competition_id = b.competition_id and a.id > b.id;

-- Replace unique(competition_id, course) with unique(competition_id) so only one course per competition
alter table public.competition_courses drop constraint if exists competition_courses_competition_id_course_key;
alter table public.competition_courses add constraint competition_courses_one_per_competition unique (competition_id);

comment on constraint competition_courses_one_per_competition on public.competition_courses is 'Each competition has exactly one course/meeting.';

-- Admin: insert single course; conflict on competition_id (one per competition)
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
  insert into public.competition_courses (competition_id, course)
  values (v_id, v_course)
  on conflict (competition_id) do update set course = excluded.course;
  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;
