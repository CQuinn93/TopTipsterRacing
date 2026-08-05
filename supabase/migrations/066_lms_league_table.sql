-- =============================================================================
-- LMS: Premier League table derived from finished lms_fixtures (no external API)
-- =============================================================================
-- Columns: played (GP), won, drawn, lost, gf, ga, gd, points
-- Sorted: points → gd → gf → name
-- All clubs in lms_teams are included (0s until they have finished matches).
-- =============================================================================

create or replace function public.lms_get_league_table(p_season text default '2026/27')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  with finished as (
    select
      f.home_team_id,
      f.away_team_id,
      f.home_goals,
      f.away_goals
    from public.lms_fixtures f
    join public.lms_gameweeks g on g.id = f.gameweek_id
    where g.season = p_season
      and f.status = 'finished'
      and f.home_goals is not null
      and f.away_goals is not null
  ),
  home_rows as (
    select
      home_team_id as team_id,
      1 as played,
      case when home_goals > away_goals then 1 else 0 end as won,
      case when home_goals = away_goals then 1 else 0 end as drawn,
      case when home_goals < away_goals then 1 else 0 end as lost,
      home_goals as gf,
      away_goals as ga,
      case
        when home_goals > away_goals then 3
        when home_goals = away_goals then 1
        else 0
      end as points
    from finished
  ),
  away_rows as (
    select
      away_team_id as team_id,
      1 as played,
      case when away_goals > home_goals then 1 else 0 end as won,
      case when away_goals = home_goals then 1 else 0 end as drawn,
      case when away_goals < home_goals then 1 else 0 end as lost,
      away_goals as gf,
      home_goals as ga,
      case
        when away_goals > home_goals then 3
        when away_goals = home_goals then 1
        else 0
      end as points
    from finished
  ),
  combined as (
    select * from home_rows
    union all
    select * from away_rows
  ),
  totals as (
    select
      team_id,
      coalesce(sum(played), 0)::int as played,
      coalesce(sum(won), 0)::int as won,
      coalesce(sum(drawn), 0)::int as drawn,
      coalesce(sum(lost), 0)::int as lost,
      coalesce(sum(gf), 0)::int as gf,
      coalesce(sum(ga), 0)::int as ga,
      coalesce(sum(points), 0)::int as points
    from combined
    group by team_id
  ),
  ranked as (
    select
      t.id as team_id,
      t.name,
      t.short_name,
      t.slug,
      coalesce(x.played, 0) as played,
      coalesce(x.won, 0) as won,
      coalesce(x.drawn, 0) as drawn,
      coalesce(x.lost, 0) as lost,
      coalesce(x.gf, 0) as gf,
      coalesce(x.ga, 0) as ga,
      (coalesce(x.gf, 0) - coalesce(x.ga, 0)) as gd,
      coalesce(x.points, 0) as points
    from public.lms_teams t
    left join totals x on x.team_id = t.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'position', pos.ord,
        'team_id', pos.team_id,
        'name', pos.name,
        'short_name', pos.short_name,
        'slug', pos.slug,
        'played', pos.played,
        'won', pos.won,
        'drawn', pos.drawn,
        'lost', pos.lost,
        'gf', pos.gf,
        'ga', pos.ga,
        'gd', pos.gd,
        'points', pos.points
      )
      order by pos.ord
    ),
    '[]'::jsonb
  )
  into v_rows
  from (
    select
      row_number() over (
        order by r.points desc, r.gd desc, r.gf desc, r.name asc
      )::int as ord,
      r.*
    from ranked r
  ) pos;

  return jsonb_build_object(
    'success', true,
    'season', p_season,
    'computed_at', now(),
    'rows', v_rows
  );
end;
$$;

revoke all on function public.lms_get_league_table(text) from public;
grant execute on function public.lms_get_league_table(text) to authenticated;

comment on function public.lms_get_league_table(text) is
  'Premier League table (GP/W/D/L/GD/PTS) derived from finished lms_fixtures for a season.';
