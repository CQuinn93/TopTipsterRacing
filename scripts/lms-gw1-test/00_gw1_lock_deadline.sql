-- =============================================================================
-- LMS TEST 0 — Lock GW1 picks (deadline passed + auto-assign)
-- =============================================================================
-- How deadline works in the real app:
--   There is NO separate "closed" column.
--   `lms_gameweeks.deadline_at` is set to (first kick-off − 20 minutes).
--   The app compares now() to deadline_at:
--     - before → users can change picks
--     - after  → picks locked in UI; submit_pick RPC returns deadline_passed
--   On sync after the deadline, `lms_auto_assign_missed_picks` creates picks
--   for anyone who never chose a team.
--
-- This script simulates that by setting deadline_at in the past and running
-- auto-assign. Fixture kick-offs / scores are left alone.
-- =============================================================================

create table if not exists public._lms_gw1_test_gameweek_backup (
  gameweek_id uuid primary key,
  starts_at timestamptz not null,
  deadline_at timestamptz not null,
  status text not null
);

-- Existing picks before auto-assign (so reset can remove only newly assigned ones)
create table if not exists public._lms_gw1_test_pick_backup (
  pick_id uuid primary key
);

do $$
declare
  v_gw_id uuid;
  v_assign jsonb;
begin
  select id into v_gw_id
  from public.lms_gameweeks
  where season = '2026/27' and number = 1
  limit 1;

  if v_gw_id is null then
    raise exception 'GW1 for season 2026/27 not found';
  end if;

  insert into public._lms_gw1_test_gameweek_backup (gameweek_id, starts_at, deadline_at, status)
  select id, starts_at, deadline_at, status
  from public.lms_gameweeks
  where id = v_gw_id
  on conflict (gameweek_id) do nothing;

  insert into public._lms_gw1_test_pick_backup (pick_id)
  select pk.id
  from public.lms_picks pk
  where pk.gameweek_id = v_gw_id
  on conflict (pick_id) do nothing;

  -- Lock picks: deadline has passed (starts_at left alone so kick-offs stay real)
  update public.lms_gameweeks
  set deadline_at = now() - interval '1 minute'
  where id = v_gw_id;

  v_assign := public.lms_auto_assign_missed_picks(v_gw_id);
  raise notice 'LMS TEST 0 complete: %', v_assign;
end $$;

select
  number as gw,
  status,
  deadline_at,
  starts_at,
  case when now() >= deadline_at then 'PICKS CLOSED' else 'PICKS OPEN' end as pick_gate
from public.lms_gameweeks
where season = '2026/27' and number = 1;

select count(*)::int as gw1_picks
from public.lms_picks pk
join public.lms_gameweeks g on g.id = pk.gameweek_id
where g.season = '2026/27' and g.number = 1;
