-- Admin: create competition (only via RPC with code 777777)
create or replace function public.admin_create_competition(
  p_admin_code text,
  p_name text,
  p_festival_start_date date,
  p_festival_end_date date,
  p_selection_open_utc time default '10:00'::time,
  p_selection_close_minutes_before_first_race int default 60,
  p_access_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code char(6);
begin
  if trim(p_admin_code) <> '777777' then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  if trim(p_name) is null or trim(p_name) = '' then
    return jsonb_build_object('success', false, 'error', 'name_required');
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
  return jsonb_build_object('success', true, 'id', v_id);
end;
$$;

-- Admin: list all selections for a competition (display_name only, no email/user_id exposed)
create or replace function public.admin_list_selections(p_admin_code text, p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(p_admin_code) <> '777777' then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'display_name', p.display_name,
      'race_date', s.race_date,
      'selections', s.selections
    ) order by s.race_date, p.display_name), '[]'::jsonb)
    from daily_selections s
    join competition_participants p on p.competition_id = s.competition_id and p.user_id = s.user_id
    where s.competition_id = p_competition_id
  );
end;
$$;

-- Admin: update any user's selection
create or replace function public.admin_update_selection(
  p_admin_code text,
  p_selection_id uuid,
  p_selections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(p_admin_code) <> '777777' then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  update daily_selections
  set selections = p_selections, updated_at = now()
  where id = p_selection_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'selection_not_found');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.admin_create_competition(text, text, date, date, time, int, text) to anon, authenticated;
grant execute on function public.admin_list_selections(text, uuid) to anon, authenticated;
grant execute on function public.admin_update_selection(text, uuid, jsonb) to anon, authenticated;
