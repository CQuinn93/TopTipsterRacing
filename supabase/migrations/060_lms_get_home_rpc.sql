-- =============================================================================
-- LMS: single home-screen RPC (competitions + pending + next up)
-- =============================================================================
-- Replaces N+1 client fan-out on /(lms) with one round-trip.
-- =============================================================================

create or replace function public.lms_get_home(p_season text default '2026/27')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_season text := coalesce(nullif(trim(p_season), ''), '2026/27');
  v_next_gw public.lms_gameweeks%rowtype;
  v_competitions jsonb := '[]'::jsonb;
  v_pending jsonb := '[]'::jsonb;
  v_fixtures jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object(
      'competitions', '[]'::jsonb,
      'pending', '[]'::jsonb,
      'next_up', jsonb_build_object('gameweek', null, 'fixtures', '[]'::jsonb)
    );
  end if;

  -- My competitions with remain counts + current-GW pick status
  select coalesce(
    jsonb_agg(q.row_json order by q.joined_at desc),
    '[]'::jsonb
  )
  into v_competitions
  from (
    select
      p.joined_at,
      jsonb_build_object(
      'competition_id', c.id,
      'name', c.name,
      'season', c.season,
      'competition_status', c.status,
      'participant_status', p.status,
      'joined_at', p.joined_at,
      'rollover_count', p.rollover_count,
      'start_gameweek_id', c.start_gameweek_id,
      'start_gameweek_number', sg.number,
      'total_count', (
        select count(*)::int
        from public.lms_participants xp
        where xp.competition_id = c.id
      ),
      'alive_count', (
        select count(*)::int
        from public.lms_participants xp
        where xp.competition_id = c.id
          and xp.status in ('active', 'winner')
      ),
      'current_gameweek_number', cgw.number,
      'pick_team', case
        when pk.team_id is null then null
        else jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'short_name', t.short_name,
          'slug', t.slug
        )
      end,
      'pick_available', (
        p.status = 'active'
        and cgw.id is not null
        and pk.id is null
      )
    ) as row_json
    from public.lms_participants p
    join public.lms_competitions c on c.id = p.competition_id
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    left join lateral (
      select gw.*
      from public.lms_gameweeks gw
      where gw.season = c.season
        and gw.number >= coalesce(sg.number, 1)
        and gw.status <> 'complete'
      order by gw.number asc
      limit 1
    ) cgw on true
    left join public.lms_picks pk
      on pk.competition_id = c.id
     and pk.user_id = v_uid
     and pk.gameweek_id = cgw.id
    left join public.lms_teams t on t.id = pk.team_id
    where p.user_id = v_uid
  ) q;

  -- Pending join requests
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'competition_id', c.id,
        'name', c.name,
        'season', c.season,
        'requested_at', jr.created_at
      )
      order by jr.created_at desc
    ),
    '[]'::jsonb
  )
  into v_pending
  from public.lms_join_requests jr
  join public.lms_competitions c on c.id = jr.competition_id
  where jr.user_id = v_uid
    and jr.status = 'pending';

  -- Season "Next up" gameweek + slim fixtures
  select * into v_next_gw
  from public.lms_gameweeks gw
  where gw.season = v_season
    and gw.status <> 'complete'
  order by gw.number asc
  limit 1;

  if found then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'gameweek_id', f.gameweek_id,
          'kickoff_at', f.kickoff_at,
          'status', f.status,
          'excluded_from_lms', coalesce(f.excluded_from_lms, false),
          'home_team_id', f.home_team_id,
          'away_team_id', f.away_team_id,
          'home_team', jsonb_build_object(
            'id', ht.id,
            'name', ht.name,
            'short_name', ht.short_name,
            'slug', ht.slug
          ),
          'away_team', jsonb_build_object(
            'id', at.id,
            'name', at.name,
            'short_name', at.short_name,
            'slug', at.slug
          )
        )
        order by f.kickoff_at asc
      ),
      '[]'::jsonb
    )
    into v_fixtures
    from public.lms_fixtures f
    join public.lms_teams ht on ht.id = f.home_team_id
    join public.lms_teams at on at.id = f.away_team_id
    where f.gameweek_id = v_next_gw.id;
  end if;

  return jsonb_build_object(
    'competitions', v_competitions,
    'pending', v_pending,
    'next_up', jsonb_build_object(
      'gameweek', case
        when v_next_gw.id is null then null
        else jsonb_build_object(
          'id', v_next_gw.id,
          'season', v_next_gw.season,
          'number', v_next_gw.number,
          'deadline_at', v_next_gw.deadline_at,
          'starts_at', v_next_gw.starts_at,
          'status', v_next_gw.status
        )
      end,
      'fixtures', coalesce(v_fixtures, '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.lms_get_home(text) from public;
grant execute on function public.lms_get_home(text) to authenticated;
