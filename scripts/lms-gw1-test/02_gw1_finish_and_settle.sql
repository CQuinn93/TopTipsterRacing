-- =============================================================================
-- LMS TEST 2 — Finish remaining GW1 fixtures + settle week
-- =============================================================================
-- Mimics the API finishing the last games, then end-of-week settle:
--   winner / rollover / no-picks, GW status = complete → GW2 selectable.
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
  v_settle jsonb;
  v_remaining int;
begin
  select id into v_gw_id
  from public.lms_gameweeks
  where season = '2026/27' and number = 1
  limit 1;

  if v_gw_id is null then
    raise exception 'GW1 for season 2026/27 not found';
  end if;

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

  insert into public._lms_gw1_test_gameweek_backup (gameweek_id, starts_at, deadline_at, status)
  select id, starts_at, deadline_at, status
  from public.lms_gameweeks
  where id = v_gw_id
  on conflict (gameweek_id) do nothing;

  with ranked as (
    select
      f.id,
      row_number() over (order by f.kickoff_at asc, f.id asc) as rn
    from public.lms_fixtures f
    where f.gameweek_id = v_gw_id
      and coalesce(f.excluded_from_lms, false) = false
      and f.status <> 'finished'
  )
  update public.lms_fixtures f
  set
    status = 'finished',
    home_goals = case (r.rn % 3)
      when 1 then 2
      when 2 then 1
      else 0
    end,
    away_goals = case (r.rn % 3)
      when 1 then 1
      when 2 then 1
      else 1
    end
  from ranked r
  where f.id = r.id;

  select count(*)::int into v_remaining
  from public.lms_fixtures
  where gameweek_id = v_gw_id
    and coalesce(excluded_from_lms, false) = false
    and status <> 'finished';

  if v_remaining > 0 then
    raise exception 'Still % unfinished GW1 fixtures', v_remaining;
  end if;

  v_settle := public.lms_settle_gameweek_internal(v_gw_id);
  raise notice 'Settle: %', v_settle;

  if coalesce((v_settle->>'success')::boolean, false) is not true then
    raise exception 'Settle failed: %', v_settle;
  end if;
end $$;

select number as gw, status from public.lms_gameweeks
where season = '2026/27' and number in (1, 2)
order by number;

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
