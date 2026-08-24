-- =============================================================================
-- LMS: standing board — all players’ used picks + competition pool (one RPC)
-- =============================================================================

create or replace function public.lms_get_standing_board(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.lms_competitions%rowtype;
  v_allowed boolean := false;
  v_pool jsonb := '[]'::jsonb;
  v_picks jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_comp from public.lms_competitions where id = p_competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  select exists (
    select 1 from public.lms_participants p
    where p.competition_id = p_competition_id and p.user_id = v_uid
  )
  or exists (
    select 1 from public.lms_competition_managers m
    where m.competition_id = p_competition_id and m.user_id = v_uid
  )
  or (v_comp.created_by_user_id is not null and v_comp.created_by_user_id = v_uid)
  or public.is_owner()
  into v_allowed;

  if not coalesce(v_allowed, false) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'short_name', t.short_name,
        'slug', t.slug
      )
      order by coalesce(t.short_name, t.name)
    ),
    '[]'::jsonb
  )
  into v_pool
  from public.lms_competition_teams ct
  join public.lms_teams t on t.id = ct.team_id
  where ct.competition_id = p_competition_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', pk.user_id,
        'gameweek_id', pk.gameweek_id,
        'gameweek_number', gw.number,
        'team_id', pk.team_id,
        'result', pk.result,
        'team', jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'short_name', t.short_name,
          'slug', t.slug
        )
      )
      order by gw.number asc, pk.user_id
    ),
    '[]'::jsonb
  )
  into v_picks
  from public.lms_picks pk
  join public.lms_gameweeks gw on gw.id = pk.gameweek_id
  join public.lms_teams t on t.id = pk.team_id
  where pk.competition_id = p_competition_id
    and gw.season = v_comp.season
    and gw.status = 'complete';

  return jsonb_build_object(
    'success', true,
    'competition_id', p_competition_id,
    'pool_teams', v_pool,
    'picks', v_picks
  );
end;
$$;

revoke all on function public.lms_get_standing_board(uuid) from public;
grant execute on function public.lms_get_standing_board(uuid) to authenticated;

comment on function public.lms_get_standing_board(uuid) is
  'Between-gameweek Standing: competition pool + every player''s completed-GW picks/results in one call.';
