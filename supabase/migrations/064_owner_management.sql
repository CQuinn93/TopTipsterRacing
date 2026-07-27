-- Owner management: list all users, all competitions + join codes, set User/Admin role.
-- Future: gate or enrich these RPCs with subscription status when billing is added.

-- ---------------------------------------------------------------------------
-- List all profiles (Owner only)
-- ---------------------------------------------------------------------------
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
          'updated_at', p.updated_at
        )
        order by
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

revoke all on function public.owner_list_users() from public;
grant execute on function public.owner_list_users() to authenticated;

-- ---------------------------------------------------------------------------
-- List all competitions across sports with join codes (Owner only)
-- ---------------------------------------------------------------------------
create or replace function public.owner_list_competitions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_racing jsonb;
  v_lms jsonb;
begin
  if not public.is_owner() then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sport', 'racing',
        'id', c.id,
        'name', c.name,
        'status',
          case
            when current_date < c.festival_start_date then 'upcoming'
            when current_date >= c.festival_start_date and current_date <= c.festival_end_date then 'live'
            else 'complete'
          end,
        'join_code', c.access_code,
        'rejoin_code', null,
        'festival_start_date', c.festival_start_date,
        'festival_end_date', c.festival_end_date,
        'created_by_user_id', c.created_by_user_id,
        'creator_username', p.username,
        'participant_count', (
          select count(*)::int from public.competition_participants cp
          where cp.competition_id = c.id
        )
      )
      order by c.festival_start_date desc nulls last, c.name
    ),
    '[]'::jsonb
  )
  into v_racing
  from public.competitions c
  left join public.profiles p on p.id = c.created_by_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sport', 'lms',
        'id', c.id,
        'name', c.name,
        'status', c.status,
        'join_code', (
          select ac.code from public.lms_access_codes ac
          where ac.competition_id = c.id and ac.type = 'join' and ac.is_active = true
          order by ac.created_at asc
          limit 1
        ),
        'rejoin_code', (
          select ac.code from public.lms_access_codes ac
          where ac.competition_id = c.id and ac.type = 'rejoin' and ac.is_active = true
          order by ac.created_at desc
          limit 1
        ),
        'season', c.season,
        'created_at', c.created_at,
        'participant_count', (
          select count(*)::int from public.lms_participants lp where lp.competition_id = c.id
        ),
        'active_count', (
          select count(*)::int from public.lms_participants lp
          where lp.competition_id = c.id and lp.status = 'active'
        )
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_lms
  from public.lms_competitions c;

  return coalesce(v_racing, '[]'::jsonb) || coalesce(v_lms, '[]'::jsonb);
end;
$$;

revoke all on function public.owner_list_competitions() from public;
grant execute on function public.owner_list_competitions() to authenticated;

-- ---------------------------------------------------------------------------
-- Change user role between User and Admin (Owner only; never touch Owner)
-- ---------------------------------------------------------------------------
create or replace function public.owner_set_user_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_target_role text;
  v_new_role text := trim(p_role);
begin
  if v_owner_id is null or not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if v_new_role is null or v_new_role not in ('User', 'Admin') then
    return jsonb_build_object('success', false, 'error', 'invalid_role');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_required');
  end if;

  if p_user_id = v_owner_id then
    return jsonb_build_object('success', false, 'error', 'cannot_change_own_role');
  end if;

  select role into v_target_role from public.profiles where id = p_user_id;
  if v_target_role is null then
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  if v_target_role = 'Owner' then
    return jsonb_build_object('success', false, 'error', 'cannot_change_owner');
  end if;

  update public.profiles
  set role = v_new_role, updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('success', true, 'user_id', p_user_id, 'role', v_new_role);
end;
$$;

revoke all on function public.owner_set_user_role(uuid, text) from public;
grant execute on function public.owner_set_user_role(uuid, text) to authenticated;
