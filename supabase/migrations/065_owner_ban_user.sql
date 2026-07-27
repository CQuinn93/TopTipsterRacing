-- Owner-only: ban / unban users (platform-wide).
-- Banned users cannot use the app (sign-in + join checks).

alter table public.profiles
  add column if not exists banned_at timestamptz,
  add column if not exists banned_by uuid references auth.users(id) on delete set null;

comment on column public.profiles.banned_at is 'When set, the account is banned from the platform (Owner action).';
comment on column public.profiles.banned_by is 'Owner who banned this account.';

create or replace function public.is_profile_banned(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and banned_at is not null
  );
$$;

revoke all on function public.is_profile_banned(uuid) from public;
grant execute on function public.is_profile_banned(uuid) to authenticated;

-- Include ban fields in owner user list
create or replace function public.owner_list_users()
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
          'id', p.id,
          'username', p.username,
          'role', p.role,
          'created_at', p.created_at,
          'updated_at', p.updated_at,
          'banned_at', p.banned_at,
          'banned_by', p.banned_by
        )
        order by
          case when p.banned_at is not null then 0 else 1 end,
          case p.role when 'Owner' then 0 when 'Admin' then 1 else 2 end,
          coalesce(p.username, ''),
          p.created_at desc
      ),
      '[]'::jsonb
    )
    from public.profiles p
  );
end;
$$;

create or replace function public.owner_set_user_banned(p_user_id uuid, p_banned boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_target_role text;
begin
  if v_owner_id is null or not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_required');
  end if;

  if p_user_id = v_owner_id then
    return jsonb_build_object('success', false, 'error', 'cannot_ban_self');
  end if;

  select role into v_target_role from public.profiles where id = p_user_id;
  if v_target_role is null then
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  if v_target_role = 'Owner' then
    return jsonb_build_object('success', false, 'error', 'cannot_ban_owner');
  end if;

  if coalesce(p_banned, false) then
    update public.profiles
    set banned_at = now(),
        banned_by = v_owner_id,
        updated_at = now()
    where id = p_user_id;
  else
    update public.profiles
    set banned_at = null,
        banned_by = null,
        updated_at = now()
    where id = p_user_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'banned', coalesce(p_banned, false)
  );
end;
$$;

revoke all on function public.owner_set_user_banned(uuid, boolean) from public;
grant execute on function public.owner_set_user_banned(uuid, boolean) to authenticated;

-- Block banned users from LMS join (full body preserved from 051 + ban gate)
create or replace function public.lms_request_join(p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code public.lms_access_codes%rowtype;
  v_comp public.lms_competitions%rowtype;
  v_gw public.lms_gameweeks%rowtype;
  v_norm text := upper(trim(p_access_code));
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if public.is_profile_banned(v_uid) then
    return jsonb_build_object('success', false, 'error', 'account_banned');
  end if;

  if length(v_norm) <> 6 then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_code
  from public.lms_access_codes
  where code = v_norm and is_active = true and voided_at is null
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_comp from public.lms_competitions where id = v_code.competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if v_comp.status = 'completed' then
    return jsonb_build_object('success', false, 'error', 'competition_completed');
  end if;

  if v_code.type = 'rejoin' then
    if v_code.valid_for_gameweek_id is null then
      return jsonb_build_object('success', false, 'error', 'invalid_code');
    end if;
    select * into v_gw from public.lms_gameweeks where id = v_code.valid_for_gameweek_id;
    if not found or now() >= v_gw.starts_at then
      update public.lms_access_codes
        set is_active = false, voided_at = coalesce(voided_at, now())
      where id = v_code.id;
      return jsonb_build_object('success', false, 'error', 'code_void');
    end if;
  end if;

  if exists (
    select 1 from public.lms_participants
    where competition_id = v_comp.id and user_id = v_uid and status in ('active', 'winner')
  ) then
    return jsonb_build_object('success', false, 'error', 'already_in', 'competition_name', v_comp.name);
  end if;

  insert into public.lms_join_requests (competition_id, user_id, access_code_id, status)
  values (v_comp.id, v_uid, v_code.id, 'pending')
  on conflict (competition_id, user_id) do update
    set access_code_id = excluded.access_code_id,
        status = 'pending',
        created_at = now(),
        reviewed_at = null,
        reviewed_by = null;

  return jsonb_build_object('success', true, 'status', 'pending', 'competition_name', v_comp.name, 'competition_id', v_comp.id);
end;
$$;
