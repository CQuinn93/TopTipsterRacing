-- Track which admin created each competition; list competitions in admin UI with join code and creator.

alter table public.competitions
  add column if not exists created_by_user_id uuid references auth.users (id) on delete set null;

comment on column public.competitions.created_by_user_id is 'Admin user who created this competition via admin_create_competition; null for rows created before this column existed.';

create index if not exists idx_competitions_created_by_user_id on public.competitions (created_by_user_id);

-- Replace admin_create_competition: no status column; set created_by_user_id from tablet code.
create or replace function public.admin_create_competition(
  p_code text,
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
  v_admin uuid;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
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
    festival_start_date,
    festival_end_date,
    selection_open_utc,
    selection_close_minutes_before_first_race,
    access_code,
    created_by_user_id
  ) values (
    trim(p_name),
    p_festival_start_date,
    p_festival_end_date,
    coalesce(p_selection_open_utc, '10:00'::time),
    coalesce(p_selection_close_minutes_before_first_race, 60),
    v_code,
    v_admin
  )
  returning id into v_id;
  foreach v_course in array p_courses loop
    insert into public.competition_courses (competition_id, course)
    values (v_id, trim(v_course))
    on conflict (competition_id) do update set course = excluded.course;
  end loop;
  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

-- Competitions visible to this admin: ones they created, or legacy rows with no creator (shared).
create or replace function public.admin_list_competitions(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'access_code', c.access_code,
          'festival_start_date', c.festival_start_date,
          'festival_end_date', c.festival_end_date,
          'created_by_user_id', c.created_by_user_id,
          'creator_username', p.username,
          'display_status',
            case
              when current_date < c.festival_start_date then 'upcoming'
              when current_date >= c.festival_start_date and current_date <= c.festival_end_date then 'live'
              else 'complete'
            end
        )
        order by c.festival_start_date desc
      ),
      '[]'::jsonb
    )
    from public.competitions c
    left join public.profiles p on p.id = c.created_by_user_id
    where c.created_by_user_id is null
       or c.created_by_user_id = v_admin
  );
end;
$$;

grant execute on function public.admin_list_competitions(text) to anon, authenticated;
