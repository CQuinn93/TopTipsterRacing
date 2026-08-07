-- =============================================================================
-- LMS TEST 1 — Midweek results (first 5 existing fixtures)
-- =============================================================================
-- Mimics the API: update existing lms_fixtures with scores + status=finished,
-- then run progressive apply (eliminate draw/loss picks immediately).
-- Does NOT change kick-off times. Does NOT settle the week (GW2 stays locked).
--
-- Prep: players have GW1 picks; pause LMS sync; migration 067 applied.
-- =============================================================================

create table if not exists public._lms_gw1_test_fixture_backup (
  fixture_id uuid primary key,
  status text not null,
  home_goals int,
  away_goals int
);

do $$
declare
  v_gw_id uuid;
  v_fx_count int;
begin
  select id into v_gw_id
  from public.lms_gameweeks
  where season = '2026/27' and number = 1
  limit 1;

  if v_gw_id is null then
    raise exception 'GW1 for season 2026/27 not found';
  end if;

  select count(*)::int into v_fx_count
  from public.lms_fixtures
  where gameweek_id = v_gw_id
    and coalesce(excluded_from_lms, false) = false;

  if v_fx_count < 2 then
    raise exception 'GW1 needs fixtures first (run sync). Found %', v_fx_count;
  end if;

  insert into public._lms_gw1_test_fixture_backup (fixture_id, status, home_goals, away_goals)
  select id, status, home_goals, away_goals
  from public.lms_fixtures
  where gameweek_id = v_gw_id
  on conflict (fixture_id) do nothing;

  -- First 5 by kick-off: mock FT scores (same as API would write)
  with ranked as (
    select
      f.id,
      row_number() over (order by f.kickoff_at asc, f.id asc) as rn
    from public.lms_fixtures f
    where f.gameweek_id = v_gw_id
      and coalesce(f.excluded_from_lms, false) = false
  )
  update public.lms_fixtures f
  set
    status = 'finished',
    home_goals = case r.rn
      when 1 then 2
      when 2 then 1
      when 3 then 0
      when 4 then 3
      when 5 then 1
      else f.home_goals
    end,
    away_goals = case r.rn
      when 1 then 0
      when 2 then 1
      when 3 then 2
      when 4 then 1
      when 5 then 1
      else f.away_goals
    end
  from ranked r
  where f.id = r.id
    and r.rn <= 5;

  perform public.lms_apply_finished_pick_results(v_gw_id);

  raise notice 'TEST 1: first 5 fixtures finished + progressive apply.';
end $$;

select pk.result, count(*)::int as picks
from public.lms_picks pk
join public.lms_gameweeks g on g.id = pk.gameweek_id
where g.season = '2026/27' and g.number = 1
group by pk.result
order by pk.result;

select p.status, count(*)::int as players
from public.lms_participants p
join public.lms_competitions c on c.id = p.competition_id
where c.season = '2026/27'
group by p.status
order by p.status;

select
  ht.short_name as home,
  f.home_goals,
  f.away_goals,
  at.short_name as away,
  f.status
from public.lms_fixtures f
join public.lms_gameweeks g on g.id = f.gameweek_id
join public.lms_teams ht on ht.id = f.home_team_id
join public.lms_teams at on at.id = f.away_team_id
where g.season = '2026/27' and g.number = 1
order by f.kickoff_at, f.id;
