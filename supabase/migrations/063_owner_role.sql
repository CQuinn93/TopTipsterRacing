-- Three-tier roles: User < Admin < Owner
-- Owner has all Admin powers, plus exclusive right to promote/reject Admin access requests.

-- 1) Expand profiles.role check constraint
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('User', 'Admin', 'Owner'));

comment on column public.profiles.role is 'User role: User, Admin, or Owner.';

-- 2) Staff helpers (Admin tools) vs Owner-only (promote admins)
create or replace function public.is_staff_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('Admin', 'Owner')
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'Owner'
  );
$$;

revoke all on function public.is_staff_admin() from public;
revoke all on function public.is_owner() from public;
grant execute on function public.is_staff_admin() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- 3) Session gate used by admin RPCs: Admin or Owner
create or replace function public.tablet_code_admin_user_id(p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- p_code retained for call-site compatibility; no longer used.
  if v_uid is null then
    return null;
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.role in ('Admin', 'Owner')
  ) then
    return v_uid;
  end if;
  return null;
end;
$$;

-- 4) LMS profile admin check: Admin or Owner
create or replace function public.lms_is_profile_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff_admin();
$$;

-- 5) Request admin: treat Admin/Owner as already elevated
create or replace function public.admin_request_access()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role in ('Admin', 'Owner') then
    return jsonb_build_object('success', true, 'status', 'already_admin');
  end if;

  insert into public.admin_access_requests (user_id, status, created_at, reviewed_at, reviewed_by)
  values (v_uid, 'pending', now(), null, null)
  on conflict (user_id) do update
    set status = 'pending', created_at = now(), reviewed_at = null, reviewed_by = null;

  return jsonb_build_object('success', true, 'status', 'pending');
end;
$$;

-- 6) Owner-only: list / approve / reject admin access requests
create or replace function public.admin_list_access_requests(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
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
  v_owner_id uuid := auth.uid();
  v_target_user_id uuid;
begin
  if v_owner_id is null or not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select user_id into v_target_user_id
  from public.admin_access_requests
  where id = p_request_id and status = 'pending';

  if v_target_user_id is null then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;

  -- Promote to Admin only (never Owner via this path)
  update public.profiles
  set role = 'Admin', updated_at = now()
  where id = v_target_user_id
    and role = 'User';

  update public.admin_access_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = v_owner_id
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
  v_owner_id uuid := auth.uid();
begin
  if v_owner_id is null or not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  update public.admin_access_requests
  set status = 'rejected', reviewed_at = now(), reviewed_by = v_owner_id
  where id = p_request_id and status = 'pending';

  return jsonb_build_object('success', true);
end;
$$;
