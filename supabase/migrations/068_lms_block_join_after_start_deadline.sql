-- =============================================================================
-- Block new LMS joins after the competition start-gameweek pick deadline.
-- Rejoin codes keep their existing window (until that gameweek's starts_at).
-- =============================================================================

create or replace function public.lms_competition_join_open(p_competition_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_deadline timestamptz;
begin
  select sg.deadline_at
  into v_deadline
  from public.lms_competitions c
  join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
  where c.id = p_competition_id;

  -- No start gameweek configured → treat as open (legacy / misconfigured).
  if v_deadline is null then
    return true;
  end if;

  return now() < v_deadline;
end;
$$;

revoke all on function public.lms_competition_join_open(uuid) from public;
grant execute on function public.lms_competition_join_open(uuid) to authenticated;

comment on function public.lms_competition_join_open(uuid) is
  'True while new players may join via a normal join code (before start GW deadline).';

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
  else
    -- Normal join codes close when the competition start-week pick deadline passes.
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
        reviewed_by = null;

  return jsonb_build_object('success', true, 'status', 'pending', 'competition_name', v_comp.name, 'competition_id', v_comp.id);
end;
$$;

create or replace function public.lms_admin_approve_join(p_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_req public.lms_join_requests%rowtype;
  v_ac public.lms_access_codes%rowtype;
  v_gw public.lms_gameweeks%rowtype;
  v_rollover int := 0;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select * into v_req from public.lms_join_requests where id = p_request_id and status = 'pending';
  if not found then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;

  select * into v_ac from public.lms_access_codes where id = v_req.access_code_id;

  if v_ac.type = 'rejoin' then
    select * into v_gw from public.lms_gameweeks where id = v_ac.valid_for_gameweek_id;
    if not found or now() >= v_gw.starts_at or v_ac.is_active = false then
      update public.lms_access_codes
        set is_active = false, voided_at = coalesce(voided_at, now())
      where id = v_ac.id;
      update public.lms_join_requests
        set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin
      where id = v_req.id;
      return jsonb_build_object('success', false, 'error', 'code_void');
    end if;

    delete from public.lms_used_teams
    where competition_id = v_req.competition_id and user_id = v_req.user_id;
    delete from public.lms_picks
    where competition_id = v_req.competition_id and user_id = v_req.user_id;

    select coalesce(rollover_count, 0) + 1 into v_rollover
    from public.lms_participants
    where competition_id = v_req.competition_id and user_id = v_req.user_id;

    insert into public.lms_participants (
      competition_id, user_id, status, eliminated_gameweek_id, joined_at, rollover_count
    )
    values (
      v_req.competition_id, v_req.user_id, 'active', null, now(), coalesce(v_rollover, 1)
    )
    on conflict (competition_id, user_id) do update
      set status = 'active',
          eliminated_gameweek_id = null,
          joined_at = now(),
          rollover_count = excluded.rollover_count;
  else
    if not public.lms_competition_join_open(v_req.competition_id) then
      update public.lms_join_requests
        set status = 'rejected', reviewed_at = now(), reviewed_by = v_admin
      where id = v_req.id;
      return jsonb_build_object('success', false, 'error', 'entries_closed');
    end if;

    insert into public.lms_participants (competition_id, user_id, status, joined_at)
    values (v_req.competition_id, v_req.user_id, 'active', now())
    on conflict (competition_id, user_id) do update
      set status = 'active',
          eliminated_gameweek_id = null,
          joined_at = now();
  end if;

  update public.lms_join_requests
  set status = 'approved', reviewed_at = now(), reviewed_by = v_admin
  where id = v_req.id;

  update public.lms_competitions
  set status = case when status = 'open' then 'active' else status end,
      updated_at = now()
  where id = v_req.competition_id;

  return jsonb_build_object('success', true);
end;
$$;
