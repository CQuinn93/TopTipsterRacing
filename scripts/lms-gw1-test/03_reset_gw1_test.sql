-- =============================================================================
-- LMS TEST RESET — Clear mock scores / deadline / settlement side-effects
-- =============================================================================
-- Restores fixture scores, GW1 deadline/status, undoes eliminations.
-- Removes picks that were created by the deadline auto-assign script (00).
-- Keeps original manual GW1 picks (results reset to pending).
-- =============================================================================

-- Older test runs created the fixture backup without kickoff_at
do $$
begin
  if to_regclass('public._lms_gw1_test_fixture_backup') is not null then
    alter table public._lms_gw1_test_fixture_backup
      add column if not exists kickoff_at timestamptz;
  end if;
end $$;

do $$
declare
  v_gw1_id uuid;
  v_gw2_id uuid;
begin
  select id into v_gw1_id
  from public.lms_gameweeks
  where season = '2026/27' and number = 1
  limit 1;

  select id into v_gw2_id
  from public.lms_gameweeks
  where season = '2026/27' and number = 2
  limit 1;

  -- Fixtures: restore backup or clear scores
  if to_regclass('public._lms_gw1_test_fixture_backup') is not null then
    update public.lms_fixtures f
    set
      status = b.status,
      home_goals = b.home_goals,
      away_goals = b.away_goals,
      kickoff_at = coalesce(b.kickoff_at, f.kickoff_at)
    from public._lms_gw1_test_fixture_backup b
    where f.id = b.fixture_id;
  elsif v_gw1_id is not null then
    update public.lms_fixtures
    set status = 'scheduled', home_goals = null, away_goals = null
    where gameweek_id = v_gw1_id;
  end if;

  -- Gameweek deadline / status
  if to_regclass('public._lms_gw1_test_gameweek_backup') is not null then
    update public.lms_gameweeks g
    set
      starts_at = b.starts_at,
      deadline_at = b.deadline_at,
      status = b.status
    from public._lms_gw1_test_gameweek_backup b
    where g.id = b.gameweek_id;
  elsif v_gw1_id is not null then
    update public.lms_gameweeks
    set status = case when status = 'complete' then 'upcoming' else status end
    where id = v_gw1_id;
  end if;

  -- Remove auto-assigned picks (created after script 00 backup)
  if v_gw1_id is not null and to_regclass('public._lms_gw1_test_pick_backup') is not null then
    delete from public.lms_used_teams u
    using public.lms_picks pk
    where pk.gameweek_id = v_gw1_id
      and pk.id not in (select pick_id from public._lms_gw1_test_pick_backup)
      and u.competition_id = pk.competition_id
      and u.user_id = pk.user_id
      and u.team_id = pk.team_id
      and u.gameweek_id = pk.gameweek_id;

    delete from public.lms_picks pk
    where pk.gameweek_id = v_gw1_id
      and pk.id not in (select pick_id from public._lms_gw1_test_pick_backup);
  end if;

  if v_gw1_id is not null then
    update public.lms_picks
    set result = 'pending', updated_at = now()
    where gameweek_id = v_gw1_id;

    update public.lms_participants
    set status = 'active', eliminated_gameweek_id = null
    where eliminated_gameweek_id = v_gw1_id;
  end if;

  update public.lms_participants p
  set status = 'active'
  from public.lms_competitions c
  where p.competition_id = c.id
    and c.season = '2026/27'
    and p.status = 'winner';

  update public.lms_competitions
  set status = 'active', updated_at = now()
  where season = '2026/27'
    and status = 'completed';

  if v_gw2_id is not null then
    update public.lms_access_codes
    set is_active = false, voided_at = coalesce(voided_at, now())
    where type = 'rejoin'
      and valid_for_gameweek_id = v_gw2_id
      and is_active = true;
  end if;

  drop table if exists public._lms_gw1_test_fixture_backup;
  drop table if exists public._lms_gw1_test_gameweek_backup;
  drop table if exists public._lms_gw1_test_pick_backup;

  raise notice 'LMS test reset complete.';
end $$;

select number as gw, status, deadline_at,
       case when now() >= deadline_at then 'PICKS CLOSED' else 'PICKS OPEN' end as pick_gate
from public.lms_gameweeks
where season = '2026/27' and number in (1, 2)
order by number;

select f.status, count(*)::int as fixtures
from public.lms_fixtures f
join public.lms_gameweeks g on g.id = f.gameweek_id
where g.season = '2026/27' and g.number = 1
group by f.status
order by f.status;
