-- Role-based admin model (replaces hardcoded admin code)
-- Adds profile role, admin access requests, and role-aware admin RPCs.

alter table public.profiles
  add column if not exists role text not null default 'User'
  check (role in ('User', 'Admin'));

comment on column public.profiles.role is 'User role: User or Admin.';

create table if not exists public.admin_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique(user_id)
);

create index if not exists idx_admin_access_requests_status on public.admin_access_requests(status);

alter table public.admin_access_requests enable row level security;

create policy "Admin access requests insert own"
  on public.admin_access_requests
  for insert
  with check (auth.uid() = user_id);

create policy "Admin access requests select own"
  on public.admin_access_requests
  for select
  using (auth.uid() = user_id);

create or replace function public.tablet_code_admin_user_id(p_code text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select utc.user_id
  from public.user_tablet_codes utc
  join public.profiles p on p.id = utc.user_id
  where utc.code = trim(p_code)
    and p.role = 'Admin'
  limit 1;
$$;

create or replace function public.admin_request_access()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if exists (select 1 from public.profiles where id = v_uid and role = 'Admin') then
    return jsonb_build_object('success', true, 'status', 'already_admin');
  end if;

  insert into public.admin_access_requests (user_id, status, created_at, reviewed_at, reviewed_by)
  values (v_uid, 'pending', now(), null, null)
  on conflict (user_id) do update
    set status = 'pending', created_at = now(), reviewed_at = null, reviewed_by = null;

  return jsonb_build_object('success', true, 'status', 'pending');
end;
$$;

create or replace function public.admin_list_access_requests(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'user_id', r.user_id,
          'username', p.username,
          'created_at', r.created_at
        )
        order by r.created_at desc
      ),
      '[]'::jsonb
    )
    from public.admin_access_requests r
    left join public.profiles p on p.id = r.user_id
    where r.status = 'pending'
  );
end;
$$;

create or replace function public.admin_approve_access_request(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_user_id uuid;
  v_target_user_id uuid;
begin
  v_admin_user_id := public.tablet_code_admin_user_id(p_code);
  if v_admin_user_id is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select user_id into v_target_user_id
  from public.admin_access_requests
  where id = p_request_id and status = 'pending';

  if v_target_user_id is null then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;

  update public.profiles
  set role = 'Admin', updated_at = now()
  where id = v_target_user_id;

  update public.admin_access_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = v_admin_user_id
  where id = p_request_id;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_reject_access_request(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_user_id uuid;
begin
  v_admin_user_id := public.tablet_code_admin_user_id(p_code);
  if v_admin_user_id is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  update public.admin_access_requests
  set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin_user_id
  where id = p_request_id and status = 'pending';

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_list_pending(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'competition_id', r.competition_id,
      'competition_name', c.name,
      'user_id', r.user_id,
      'display_name', r.display_name,
      'created_at', r.created_at
    ) order by r.created_at desc), '[]'::jsonb)
    from public.competition_join_requests r
    join public.competitions c on c.id = r.competition_id
    where r.status = 'pending'
  );
end;
$$;

create or replace function public.admin_approve_request(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.competition_join_requests%rowtype;
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  select * into v_req from public.competition_join_requests where id = p_request_id and status = 'pending';
  if v_req.id is null then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;
  insert into public.competition_participants (competition_id, user_id, display_name)
  values (v_req.competition_id, v_req.user_id, v_req.display_name)
  on conflict (competition_id, user_id) do update set display_name = excluded.display_name;
  update public.competition_join_requests set status = 'approved', reviewed_at = now() where id = p_request_id;
  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.admin_reject_request(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  update public.competition_join_requests set status = 'rejected', reviewed_at = now() where id = p_request_id and status = 'pending';
  return jsonb_build_object('success', true);
end;
$$;

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
begin
  if public.tablet_code_admin_user_id(p_code) is null then
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

create or replace function public.admin_list_selections(p_code text, p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id,
      'display_name', p.display_name,
      'race_date', s.race_date,
      'selections', s.selections
    ) order by s.race_date, p.display_name), '[]'::jsonb)
    from public.daily_selections s
    join public.competition_participants p on p.competition_id = s.competition_id and p.user_id = s.user_id
    where s.competition_id = p_competition_id
  );
end;
$$;

create or replace function public.admin_update_selection(
  p_code text,
  p_selection_id uuid,
  p_selections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  perform set_config('app.allow_backfill', 'true', true);

  update public.daily_selections
  set selections = p_selections, updated_at = now()
  where id = p_selection_id;

  perform set_config('app.allow_backfill', '', true);

  if not found then
    return jsonb_build_object('success', false, 'error', 'selection_not_found');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.tablet_code_admin_user_id(text) to anon, authenticated;
grant execute on function public.admin_request_access() to authenticated;
grant execute on function public.admin_list_access_requests(text) to anon, authenticated;
grant execute on function public.admin_approve_access_request(text, uuid) to anon, authenticated;
grant execute on function public.admin_reject_access_request(text, uuid) to anon, authenticated;
grant execute on function public.admin_list_pending(text) to anon, authenticated;
grant execute on function public.admin_approve_request(text, uuid) to anon, authenticated;
grant execute on function public.admin_reject_request(text, uuid) to anon, authenticated;
grant execute on function public.admin_create_competition(text, text, date, date, time, int, text, text[]) to anon, authenticated;
grant execute on function public.admin_list_selections(text, uuid) to anon, authenticated;
grant execute on function public.admin_update_selection(text, uuid, jsonb) to anon, authenticated;
