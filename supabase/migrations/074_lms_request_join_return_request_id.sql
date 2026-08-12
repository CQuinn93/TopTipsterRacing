-- Return join_request_id so the client can notify managers without relying only on a DB webhook.

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
  v_request_id uuid;
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
  else
    if not public.lms_competition_join_open(v_comp.id) then
      return jsonb_build_object(
        'success', false,
        'error', 'entries_closed',
        'competition_name', v_comp.name
      );
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
        reviewed_by = null
  returning id into v_request_id;

  return jsonb_build_object(
    'success', true,
    'status', 'pending',
    'competition_name', v_comp.name,
    'competition_id', v_comp.id,
    'join_request_id', v_request_id
  );
end;
$$;
