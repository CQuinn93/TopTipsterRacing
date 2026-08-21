-- =============================================================================
-- LMS: creator/Owner can submit/change a player's pick at any time
-- (including after the gameweek deadline). Player self-picks stay deadline-locked.
-- =============================================================================

create or replace function public.lms_admin_submit_pick_for_user(
  p_competition_id uuid,
  p_user_id uuid,
  p_gameweek_id uuid,
  p_team_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part public.lms_participants%rowtype;
  v_gw public.lms_gameweeks%rowtype;
  v_comp public.lms_competitions%rowtype;
  v_start public.lms_gameweeks%rowtype;
  v_plays boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_required');
  end if;

  select * into v_comp from public.lms_competitions where id = p_competition_id;
  if not found or v_comp.status = 'completed' then
    return jsonb_build_object('success', false, 'error', 'competition_unavailable');
  end if;

  select * into v_part
  from public.lms_participants
  where competition_id = p_competition_id and user_id = p_user_id;
  if not found or v_part.status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'not_active');
  end if;

  select * into v_gw from public.lms_gameweeks where id = p_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_gameweek');
  end if;

  if v_comp.start_gameweek_id is not null then
    select * into v_start from public.lms_gameweeks where id = v_comp.start_gameweek_id;
    if found then
      if v_gw.season <> v_start.season or v_gw.number < v_start.number then
        return jsonb_build_object('success', false, 'error', 'before_competition_start');
      end if;
    end if;
  end if;

  -- Intentionally no deadline check: admins may fix/override picks after lock.

  if not exists (
    select 1 from public.lms_competition_teams
    where competition_id = p_competition_id and team_id = p_team_id
  ) then
    return jsonb_build_object('success', false, 'error', 'team_not_in_pool');
  end if;

  -- Allow re-selecting the team already used for *this* gameweek (editing the pick).
  if exists (
    select 1 from public.lms_used_teams u
    where u.competition_id = p_competition_id
      and u.user_id = p_user_id
      and u.team_id = p_team_id
      and u.gameweek_id is distinct from p_gameweek_id
  ) then
    return jsonb_build_object('success', false, 'error', 'team_already_used');
  end if;

  select exists (
    select 1 from public.lms_fixtures f
    where f.gameweek_id = p_gameweek_id
      and coalesce(f.excluded_from_lms, false) = false
      and (f.home_team_id = p_team_id or f.away_team_id = p_team_id)
  ) into v_plays;

  if not v_plays then
    return jsonb_build_object('success', false, 'error', 'team_not_playing');
  end if;

  insert into public.lms_picks (competition_id, user_id, gameweek_id, team_id, result, updated_at)
  values (p_competition_id, p_user_id, p_gameweek_id, p_team_id, 'pending', now())
  on conflict (competition_id, user_id, gameweek_id) do update
    set team_id = excluded.team_id,
        result = 'pending',
        updated_at = now();

  delete from public.lms_used_teams
  where competition_id = p_competition_id
    and user_id = p_user_id
    and gameweek_id = p_gameweek_id;

  insert into public.lms_used_teams (competition_id, user_id, team_id, gameweek_id)
  values (p_competition_id, p_user_id, p_team_id, p_gameweek_id)
  on conflict (competition_id, user_id, team_id) do update
    set gameweek_id = excluded.gameweek_id;

  if v_comp.status = 'open' then
    update public.lms_competitions set status = 'active', updated_at = now() where id = v_comp.id;
  end if;

  return jsonb_build_object('success', true);
end;
$$;

comment on function public.lms_admin_submit_pick_for_user(uuid, uuid, uuid, uuid) is
  'Creator/Owner submit or override a player pick for a gameweek, including after the deadline.';
