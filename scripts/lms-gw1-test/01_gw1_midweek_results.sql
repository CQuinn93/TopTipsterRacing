-- =============================================================================
-- LMS TEST 1 — Midweek results (first 5 existing fixtures)
-- =============================================================================
-- Mimics the API: update existing lms_fixtures with scores + status=finished,
-- then run progressive apply (eliminate draw/loss picks immediately).
-- Does NOT settle the week (GW2 stays locked).
--
-- Also advances the earliest GW1 kick-off (and gameweek starts_at) to
-- now() - 5 minutes so leaderboard picks reveal in the app — same gate as
-- production (first non-excluded kick-off <= now()). Reset restores originals.
--
-- Prep: players have GW1 picks; pause LMS sync; migration 067 applied.
-- =============================================================================

create table if not exists public._lms_gw1_test_fixture_backup (
  fixture_id uuid primary key,
  status text not null,
  home_goals int,
  away_goals int,
  kickoff_at timestamptz
);

alter table public._lms_gw1_test_fixture_backup
  add column if not exists kickoff_at timestamptz;

create table if not exists public._lms_gw1_test_gameweek_backup (
  gameweek_id uuid primary key,
  starts_at timestamptz not null,
  deadline_at timestamptz not null,
  status text not null
);

do $$
declare
  v_gw_id uuid;
  v_fx_count int;
  v_first_fx uuid;
  v_reveal_at timestamptz := now() - interval '5 minutes';
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

  -- Snapshot originals once (kickoff included so reset can restore reveal gate)
  insert into public._lms_gw1_test_fixture_backup (
    fixture_id, status, home_goals, away_goals, kickoff_at
  )
  select id, status, home_goals, away_goals, kickoff_at
  from public.lms_fixtures
  where gameweek_id = v_gw_id
  on conflict (fixture_id) do update
    set kickoff_at = coalesce(
      public._lms_gw1_test_fixture_backup.kickoff_at,
      excluded.kickoff_at
    );

  insert into public._lms_gw1_test_gameweek_backup (
    gameweek_id, starts_at, deadline_at, status
  )
  select id, starts_at, deadline_at, status
  from public.lms_gameweeks
  where id = v_gw_id
  on conflict (gameweek_id) do nothing;

  -- Reveal picks: earliest kick-off must be in the past (app + pick-stats RPC)
  select f.id into v_first_fx
  from public.lms_fixtures f
  where f.gameweek_id = v_gw_id
    and coalesce(f.excluded_from_lms, false) = false
  order by f.kickoff_at asc, f.id asc
  limit 1;

  update public.lms_fixtures
  set kickoff_at = v_reveal_at
  where id = v_first_fx;

  update public.lms_gameweeks
  set starts_at = v_reveal_at
  where id = v_gw_id;

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

  raise notice 'TEST 1: first KO set to % (picks reveal); first 5 finished + progressive apply.', v_reveal_at;
end $$;

select
  case when exists (
    select 1
    from public.lms_fixtures f
    join public.lms_gameweeks g on g.id = f.gameweek_id
    where g.season = '2026/27' and g.number = 1
      and coalesce(f.excluded_from_lms, false) = false
      and f.kickoff_at <= now()
  ) then 'PICKS REVEALED' else 'PICKS HIDDEN' end as reveal_gate;

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
  f.status,
  f.kickoff_at
from public.lms_fixtures f
join public.lms_gameweeks g on g.id = f.gameweek_id
join public.lms_teams ht on ht.id = f.home_team_id
join public.lms_teams at on at.id = f.away_team_id
where g.season = '2026/27' and g.number = 1
order by f.kickoff_at, f.id;
