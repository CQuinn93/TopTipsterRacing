-- Enrich F2T competition selections with scored GW number + team's next fixture.
-- Based on 099_f2t_owner_manage_all (Owner/manager observer access preserved).

create or replace function public.f2t_get_competition(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.f2t_competitions%rowtype;
  v_part public.f2t_participants%rowtype;
  v_sg public.lms_gameweeks%rowtype;
  v_selections jsonb;
  v_leaderboard jsonb;
  v_unscored int := 0;
  v_completed_gws int := 0;
  v_sub_eligible_regular boolean := false;
  v_join_open boolean;
  v_has_part boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_comp from public.f2t_competitions where id = p_competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if not (
    public.f2t_is_competition_member(p_competition_id)
    or public.f2t_can_handle_joins(p_competition_id)
  ) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select * into v_part
  from public.f2t_participants
  where competition_id = p_competition_id and user_id = v_uid;
  v_has_part := found;

  select * into v_sg from public.lms_gameweeks where id = v_comp.start_gameweek_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slot', s.slot,
        'player_id', s.player_id,
        'display_name', fp.display_name,
        'team_id', fp.team_id,
        'team_name', t.name,
        'team_short_name', t.short_name,
        'team_slug', t.slug,
        'scored_at', s.scored_at,
        'scored_gameweek_id', s.scored_gameweek_id,
        'scored_gameweek_number', scored_gw.number,
        'owner_flagged', fp.owner_flagged,
        'next_match', (
          select jsonb_build_object(
            'kickoff_at', f.kickoff_at,
            'is_home', (f.home_team_id = fp.team_id),
            'opponent_short_name', ot.short_name,
            'opponent_name', ot.name,
            'opponent_slug', ot.slug,
            'gameweek_number', fx_gw.number
          )
          from public.lms_fixtures f
          join public.lms_gameweeks fx_gw on fx_gw.id = f.gameweek_id
          join public.lms_teams ot
            on ot.id = case
              when f.home_team_id = fp.team_id then f.away_team_id
              else f.home_team_id
            end
          where (f.home_team_id = fp.team_id or f.away_team_id = fp.team_id)
            and fx_gw.season = v_comp.season
            and f.status in ('scheduled', 'live')
            and f.kickoff_at >= (now() - interval '3 hours')
          order by f.kickoff_at asc
          limit 1
        )
      )
      order by s.slot
    ),
    '[]'::jsonb
  )
  into v_selections
  from public.f2t_selections s
  join public.football_players fp on fp.id = s.player_id
  join public.lms_teams t on t.id = fp.team_id
  left join public.lms_gameweeks scored_gw on scored_gw.id = s.scored_gameweek_id
  where s.competition_id = p_competition_id and s.user_id = v_uid;

  select count(*)::int into v_unscored
  from public.f2t_selections s
  where s.competition_id = p_competition_id
    and s.user_id = v_uid
    and s.scored_at is null;

  select count(*)::int into v_completed_gws
  from public.lms_gameweeks gw
  where gw.season = v_comp.season
    and gw.number >= coalesce(v_sg.number, 1)
    and gw.status = 'complete';

  v_sub_eligible_regular := (
    v_has_part
    and v_part.status = 'active'
    and not coalesce(v_part.regular_sub_used, false)
    and v_completed_gws >= 3
    and v_unscored > 3
  );

  v_join_open := public.f2t_competition_join_open(p_competition_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', p.user_id,
        'username', pr.username,
        'status', p.status,
        'scored_count', (
          select count(*)::int
          from public.f2t_selections s
          where s.competition_id = p.competition_id
            and s.user_id = p.user_id
            and s.scored_at is not null
        ),
        'completed_at', p.completed_at
      )
      order by
        case when p.status = 'winner' then 0 else 1 end,
        (
          select count(*)::int
          from public.f2t_selections s
          where s.competition_id = p.competition_id
            and s.user_id = p.user_id
            and s.scored_at is not null
        ) desc,
        p.completed_at nulls last
    ),
    '[]'::jsonb
  )
  into v_leaderboard
  from public.f2t_participants p
  left join public.profiles pr on pr.id = p.user_id
  where p.competition_id = p_competition_id;

  return jsonb_build_object(
    'success', true,
    'competition', jsonb_build_object(
      'id', v_comp.id,
      'name', v_comp.name,
      'season', v_comp.season,
      'status', v_comp.status,
      'entry', v_comp.entry,
      'start_gameweek_id', v_comp.start_gameweek_id,
      'start_gameweek_number', v_sg.number,
      'start_gameweek_deadline', v_sg.deadline_at,
      'join_open', v_join_open
    ),
    'participant', case
      when v_has_part then jsonb_build_object(
        'status', v_part.status,
        'regular_sub_used', v_part.regular_sub_used,
        'completed_at', v_part.completed_at,
        'scored_count', (
          select count(*)::int
          from public.f2t_selections s
          where s.competition_id = p_competition_id
            and s.user_id = v_uid
            and s.scored_at is not null
        ),
        'unscored_count', v_unscored,
        'selection_count', jsonb_array_length(v_selections),
        'sub_eligible_regular', v_sub_eligible_regular
      )
      else null
    end,
    'selections', v_selections,
    'leaderboard', v_leaderboard,
    'permissions', public.f2t_can_manage_competition_rpc(p_competition_id)
  );
end;
$$;
