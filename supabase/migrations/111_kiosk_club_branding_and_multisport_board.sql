-- Club branding on profiles + multi-sport kiosk display board.

alter table public.profiles
  add column if not exists club_name text,
  add column if not exists club_logo_url text;

comment on column public.profiles.club_name is
  'Public club / venue name for Gamemaster hubs and competition branding.';
comment on column public.profiles.club_logo_url is
  'HTTPS URL for club logo shown on Competition Hub tablets.';

-- Drop single-arg overload from 110, replace with sport-aware board.
drop function if exists public.kiosk_get_display_board(uuid);

create or replace function public.kiosk_get_display_board(
  p_competition_id uuid,
  p_sport text default 'lms'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sport text := lower(trim(coalesce(p_sport, 'lms')));
  v_creator uuid;
  v_club_name text;
  v_club_logo text;
  v_comp_name text;
  v_comp_status text;
  v_season text;
  v_lms public.lms_competitions%rowtype;
  v_f2t public.f2t_competitions%rowtype;
  v_racing public.competitions%rowtype;
  v_participants jsonb := '[]'::jsonb;
  v_pool jsonb := '[]'::jsonb;
  v_picks jsonb := '[]'::jsonb;
  v_elim jsonb := null;
  v_stats jsonb := '[]'::jsonb;
  v_race_days jsonb := '[]'::jsonb;
  v_alive int := 0;
  v_total int := 0;
  v_start_gw public.lms_gameweeks%rowtype;
begin
  if p_competition_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if v_sport not in ('lms', 'f2t', 'racing') then
    return jsonb_build_object('success', false, 'error', 'invalid_sport');
  end if;

  -------------------------------------------------------------------------
  -- LMS
  -------------------------------------------------------------------------
  if v_sport = 'lms' then
    select * into v_lms from public.lms_competitions where id = p_competition_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'invalid_competition');
    end if;
    v_creator := v_lms.created_by_user_id;
    v_comp_name := v_lms.name;
    v_comp_status := v_lms.status;
    v_season := v_lms.season;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'competition_id', p.competition_id,
          'user_id', p.user_id,
          'status', p.status,
          'eliminated_gameweek_id', p.eliminated_gameweek_id,
          'joined_at', p.joined_at,
          'rollover_count', coalesce(p.rollover_count, 0),
          'lives_remaining', p.lives_remaining,
          'username', pr.username,
          'display_name', pr.username,
          'score', null
        )
        order by
          case p.status when 'winner' then 0 when 'active' then 1 else 2 end,
          lower(coalesce(pr.username, p.user_id::text))
      ),
      '[]'::jsonb
    )
    into v_participants
    from public.lms_participants p
    left join public.profiles pr on pr.id = p.user_id
    where p.competition_id = p_competition_id;

    select count(*)::int into v_total from public.lms_participants where competition_id = p_competition_id;
    select count(*)::int into v_alive
    from public.lms_participants
    where competition_id = p_competition_id and status in ('active', 'winner');

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'name', t.name, 'short_name', t.short_name, 'slug', t.slug
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
            'id', t.id, 'name', t.name, 'short_name', t.short_name, 'slug', t.slug
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
      and gw.season = v_lms.season
      and gw.status = 'complete';

    select jsonb_build_object(
      'success', true,
      'season', v_lms.season,
      'competition_id', p_competition_id,
      'still_standing', v_alive,
      'gameweeks', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'gameweek_id', gw.id,
              'gameweek_number', gw.number,
              'eliminated_count', coalesce(ec.cnt, 0),
              'entrants_count', coalesce(ent.cnt, 0),
              'survival_pct', case
                when coalesce(ent.cnt, 0) > 0 then round(
                  ((ent.cnt - coalesce(ec.cnt, 0))::numeric * 100.0) / ent.cnt, 0
                )
                else 100
              end
            )
            order by gw.number asc
          )
          from public.lms_gameweeks gw
          left join lateral (
            select count(*)::int as cnt
            from public.lms_participants p
            where p.eliminated_gameweek_id = gw.id and p.competition_id = p_competition_id
          ) ec on true
          left join lateral (
            select count(*)::int as cnt
            from public.lms_participants p
            left join public.lms_gameweeks eg on eg.id = p.eliminated_gameweek_id
            where p.competition_id = p_competition_id
              and (p.status in ('active', 'winner') or eg.number >= gw.number)
          ) ent on true
          where gw.season = v_lms.season
            and gw.status = 'complete'
            and exists (
              select 1 from public.lms_participants p2
              where p2.competition_id = p_competition_id
                and p2.eliminated_gameweek_id = gw.id
            )
        ),
        '[]'::jsonb
      )
    )
    into v_elim;

  -------------------------------------------------------------------------
  -- Tipster20 (F2T)
  -------------------------------------------------------------------------
  elsif v_sport = 'f2t' then
    select * into v_f2t from public.f2t_competitions where id = p_competition_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'invalid_competition');
    end if;
    v_creator := v_f2t.created_by_user_id;
    v_comp_name := v_f2t.name;
    v_comp_status := v_f2t.status;
    v_season := v_f2t.season;

    select * into v_start_gw from public.lms_gameweeks where id = v_f2t.start_gameweek_id;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'competition_id', p.competition_id,
          'user_id', p.user_id,
          'status', p.status,
          'joined_at', p.joined_at,
          'username', pr.username,
          'display_name', coalesce(pr.username, left(p.user_id::text, 8)),
          'score', (
            select count(*)::int
            from public.f2t_selections s
            where s.competition_id = p.competition_id
              and s.user_id = p.user_id
              and s.scored_at is not null
          )
        )
        order by
          case when p.status = 'winner' then 0 else 1 end,
          (
            select count(*) from public.f2t_selections s
            where s.competition_id = p.competition_id
              and s.user_id = p.user_id
              and s.scored_at is not null
          ) desc,
          lower(coalesce(pr.username, p.user_id::text))
      ),
      '[]'::jsonb
    )
    into v_participants
    from public.f2t_participants p
    left join public.profiles pr on pr.id = p.user_id
    where p.competition_id = p_competition_id;

    select count(*)::int into v_total from public.f2t_participants where competition_id = p_competition_id;
    select count(*)::int into v_alive
    from public.f2t_participants
    where competition_id = p_competition_id and status in ('active', 'winner');

    -- Selections per user (player pool for bottom-right)
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', s.user_id,
          'slot', s.slot,
          'player_id', s.player_id,
          'display_name', fp.display_name,
          'team_short_name', t.short_name,
          'team_slug', t.slug,
          'scored', s.scored_at is not null,
          'scored_gameweek_number', gw.number
        )
        order by s.user_id, s.slot
      ),
      '[]'::jsonb
    )
    into v_picks
    from public.f2t_selections s
    join public.football_players fp on fp.id = s.player_id
    left join public.lms_teams t on t.id = fp.team_id
    left join public.lms_gameweeks gw on gw.id = s.scored_gameweek_id
    where s.competition_id = p_competition_id;

    -- Goalscorers + how many users held them
    select coalesce(
      jsonb_agg(row_json order by (row_json->>'holder_count')::int desc, row_json->>'display_name'),
      '[]'::jsonb
    )
    into v_stats
    from (
      select jsonb_build_object(
        'player_id', fp.id,
        'display_name', fp.display_name,
        'team_short_name', t.short_name,
        'team_slug', t.slug,
        'goals', coalesce(g.goals_total, 0),
        'holder_count', coalesce(h.holders, 0)
      ) as row_json
      from public.football_players fp
      left join public.lms_teams t on t.id = fp.team_id
      join lateral (
        select sum(g.goals)::int as goals_total
        from public.football_player_gameweek_goals g
        join public.lms_gameweeks gw on gw.id = g.gameweek_id
        where g.player_id = fp.id
          and gw.season = v_f2t.season
          and (v_start_gw.number is null or gw.number >= v_start_gw.number)
      ) g on coalesce(g.goals_total, 0) > 0
      left join lateral (
        select count(distinct s.user_id)::int as holders
        from public.f2t_selections s
        where s.competition_id = p_competition_id
          and s.player_id = fp.id
      ) h on true
      where exists (
        select 1 from public.f2t_selections s
        where s.competition_id = p_competition_id and s.player_id = fp.id
      )
    ) x;

  -------------------------------------------------------------------------
  -- Racing
  -------------------------------------------------------------------------
  else
    select * into v_racing from public.competitions where id = p_competition_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'invalid_competition');
    end if;
    v_creator := v_racing.created_by_user_id;
    v_comp_name := v_racing.name;
    v_comp_status := 'active';
    v_season := null;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', cp.user_id,
          'competition_id', cp.competition_id,
          'user_id', cp.user_id,
          'status', 'active',
          'username', pr.username,
          'display_name', coalesce(nullif(trim(cp.display_name), ''), pr.username, left(cp.user_id::text, 8)),
          'score', null
        )
        order by lower(coalesce(nullif(trim(cp.display_name), ''), pr.username, cp.user_id::text))
      ),
      '[]'::jsonb
    )
    into v_participants
    from public.competition_participants cp
    left join public.profiles pr on pr.id = cp.user_id
    where cp.competition_id = p_competition_id;

    select count(*)::int into v_total
    from public.competition_participants where competition_id = p_competition_id;
    v_alive := v_total;

    -- Flattened selections for pool view
    select coalesce(jsonb_agg(sel order by sel->>'user_id', sel->>'race_date', sel->>'race_name'), '[]'::jsonb)
    into v_picks
    from (
      select jsonb_build_object(
        'user_id', ds.user_id,
        'race_date', ds.race_date,
        'race_name', coalesce(r.name, ent.key),
        'horse_name', coalesce(ent.value->>'runnerName', ent.value->>'runner_name', 'Selection'),
        'runner_id', coalesce(ent.value->>'runnerId', ent.value->>'runner_id'),
        'points', coalesce(h.pos_points, 0) + coalesce(h.sp_points, 0)
      ) as sel
      from public.daily_selections ds
      cross join lateral jsonb_each(coalesce(ds.selections, '{}'::jsonb)) as ent(key, value)
      left join public.races r
        on r.api_race_id = ent.key
       and r.race_day_id in (
         select crd.race_day_id from public.competition_race_days crd where crd.competition_id = p_competition_id
       )
      left join public.horses h
        on h.race_id = r.id
       and (
         h.api_horse_id = coalesce(ent.value->>'runnerId', ent.value->>'runner_id')
         or lower(h.name) = lower(coalesce(ent.value->>'runnerName', ent.value->>'runner_name', ''))
       )
      where ds.competition_id = p_competition_id
    ) flat;

    -- Race days with place-getters (points > 0), max 4 per race
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'race_day_id', d.race_day_id,
          'race_date', d.race_date,
          'day_label', 'Day ' || d.day_num::text,
          'races', d.races
        )
        order by d.race_date
      ),
      '[]'::jsonb
    )
    into v_race_days
    from (
      select
        rd.id as race_day_id,
        rd.race_date,
        row_number() over (order by rd.race_date) as day_num,
        coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'race_id', r.id,
              'name', r.name,
              'scheduled_time_utc', r.scheduled_time_utc,
              'horses', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'name', hx.name,
                    'position', hx.position,
                    'points', coalesce(hx.pos_points, 0) + coalesce(hx.sp_points, 0)
                  )
                  order by hx.position nulls last,
                    (coalesce(hx.pos_points, 0) + coalesce(hx.sp_points, 0)) desc
                )
                from (
                  select h2.*
                  from public.horses h2
                  where h2.race_id = r.id
                    and coalesce(h2.pos_points, 0) + coalesce(h2.sp_points, 0) > 0
                    and coalesce(h2.api_horse_id, '') <> 'FAV'
                  order by h2.position nulls last,
                    (coalesce(h2.pos_points, 0) + coalesce(h2.sp_points, 0)) desc
                  limit 4
                ) hx
              ), '[]'::jsonb)
            )
            order by r.scheduled_time_utc nulls last, r.name
          )
          from public.races r
          where r.race_day_id = rd.id
        ), '[]'::jsonb) as races
      from public.competition_race_days crd
      join public.race_days rd on rd.id = crd.race_day_id
      where crd.competition_id = p_competition_id
    ) d;
  end if;

  if v_creator is not null then
    select nullif(trim(club_name), ''), nullif(trim(club_logo_url), '')
    into v_club_name, v_club_logo
    from public.profiles
    where id = v_creator;
  end if;

  return jsonb_build_object(
    'success', true,
    'sport', v_sport,
    'competition_id', p_competition_id,
    'competition_name', v_comp_name,
    'season', v_season,
    'status', v_comp_status,
    'club_name', v_club_name,
    'club_logo_url', v_club_logo,
    'alive_count', v_alive,
    'total_count', v_total,
    'participants', v_participants,
    'pool_teams', v_pool,
    'picks', v_picks,
    'elimination', v_elim,
    'goalscorers', v_stats,
    'race_days', v_race_days
  );
end;
$$;

revoke all on function public.kiosk_get_display_board(uuid, text) from public;
grant execute on function public.kiosk_get_display_board(uuid, text) to anon, authenticated;

comment on function public.kiosk_get_display_board(uuid, text) is
  'Venue hub display board for LMS / Tipster20 / Racing (no session required).';
