-- =============================================================================
-- LMS: creator/Owner can remove a player from a competition.
-- Competition managers cannot remove players (only accept/reject joins).
-- =============================================================================

create or replace function public.lms_admin_remove_participant(
  p_competition_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_created_by uuid;
  v_username text;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_required');
  end if;

  select c.created_by_user_id into v_created_by
  from public.lms_competitions c
  where c.id = p_competition_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if v_created_by is not null and p_user_id = v_created_by then
    return jsonb_build_object('success', false, 'error', 'cannot_remove_creator');
  end if;

  if not exists (
    select 1
    from public.lms_participants part
    where part.competition_id = p_competition_id
      and part.user_id = p_user_id
  ) then
    return jsonb_build_object('success', false, 'error', 'not_a_participant');
  end if;

  select p.username into v_username
  from public.profiles p
  where p.id = p_user_id;

  delete from public.lms_picks
  where competition_id = p_competition_id
    and user_id = p_user_id;

  delete from public.lms_used_teams
  where competition_id = p_competition_id
    and user_id = p_user_id;

  delete from public.lms_competition_managers
  where competition_id = p_competition_id
    and user_id = p_user_id;

  delete from public.lms_join_notify_prefs
  where competition_id = p_competition_id
    and user_id = p_user_id;

  delete from public.lms_participants
  where competition_id = p_competition_id
    and user_id = p_user_id;

  -- Allow a fresh join request later if needed (upsert path resets to pending).
  update public.lms_join_requests
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = v_uid
  where competition_id = p_competition_id
    and user_id = p_user_id
    and status = 'approved';

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'username', v_username
  );
end;
$$;

revoke all on function public.lms_admin_remove_participant(uuid, uuid) from public;
grant execute on function public.lms_admin_remove_participant(uuid, uuid) to authenticated;

comment on function public.lms_admin_remove_participant(uuid, uuid) is
  'Creator/Owner removes a participant (and their picks/manager role). Managers cannot call this.';
