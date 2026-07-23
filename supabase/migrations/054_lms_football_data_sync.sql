-- =============================================================================
-- LMS: football-data.org sync support
-- =============================================================================
-- - external_id on teams/fixtures for stable upserts from football-data.org
-- - service-role settle helper (no tablet code) for automated settlement
-- =============================================================================

alter table public.lms_teams
  add column if not exists external_id int;

alter table public.lms_fixtures
  add column if not exists external_id int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lms_teams_external_id_key'
  ) then
    alter table public.lms_teams
      add constraint lms_teams_external_id_key unique (external_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'lms_fixtures_external_id_key'
  ) then
    alter table public.lms_fixtures
      add constraint lms_fixtures_external_id_key unique (external_id);
  end if;
end $$;

create unique index if not exists idx_lms_fixtures_gw_home_away
  on public.lms_fixtures(gameweek_id, home_team_id, away_team_id);

comment on column public.lms_teams.external_id is 'football-data.org team id';
comment on column public.lms_fixtures.external_id is 'football-data.org match id';

-- Internal settle used by admin RPC and by sync scripts (service_role).
-- Mirrors lms_settle_gameweek body without tablet-code auth.
create or replace function public.lms_settle_gameweek_internal(p_gameweek_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unfinished int;
  v_comp record;
  v_active_count int;
  v_next_gw_id uuid;
  v_access char(6);
  v_attempts int;
  v_pick record;
  v_fixture public.lms_fixtures%rowtype;
  v_won boolean;
  v_summary jsonb := '[]'::jsonb;
  v_settle public.lms_gameweeks%rowtype;
begin
  select * into v_settle from public.lms_gameweeks where id = p_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_gameweek');
  end if;

  if v_settle.status = 'complete' then
    return jsonb_build_object('success', true, 'results', '[]'::jsonb, 'already_complete', true);
  end if;

  select count(*)::int into v_unfinished
  from public.lms_fixtures
  where gameweek_id = p_gameweek_id and status <> 'finished';

  if v_unfinished > 0 then
    return jsonb_build_object('success', false, 'error', 'fixtures_incomplete', 'remaining', v_unfinished);
  end if;

  if not exists (select 1 from public.lms_fixtures where gameweek_id = p_gameweek_id) then
    return jsonb_build_object('success', false, 'error', 'no_fixtures');
  end if;

  for v_pick in
    select pk.*
    from public.lms_picks pk
    join public.lms_competitions c on c.id = pk.competition_id
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    where pk.gameweek_id = p_gameweek_id
      and pk.result = 'pending'
      and c.status in ('open', 'active')
      and (
        c.start_gameweek_id is null
        or (sg.season = v_settle.season and sg.number <= v_settle.number)
      )
  loop
    select f.* into v_fixture
    from public.lms_fixtures f
    where f.gameweek_id = p_gameweek_id
      and (f.home_team_id = v_pick.team_id or f.away_team_id = v_pick.team_id)
    limit 1;

    v_won := public.lms_team_won_fixture(v_fixture, v_pick.team_id);

    update public.lms_picks
    set result = case when v_won then 'correct' else 'incorrect' end,
        updated_at = now()
    where id = v_pick.id;

    if not v_won then
      update public.lms_participants
      set status = 'eliminated',
          eliminated_gameweek_id = p_gameweek_id
      where competition_id = v_pick.competition_id
        and user_id = v_pick.user_id
        and status = 'active';
    end if;
  end loop;

  update public.lms_participants p
  set status = 'eliminated',
      eliminated_gameweek_id = p_gameweek_id
  from public.lms_competitions c
  left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
  where p.competition_id = c.id
    and p.status = 'active'
    and c.status in ('open', 'active')
    and (
      c.start_gameweek_id is null
      or (sg.season = v_settle.season and sg.number <= v_settle.number)
    )
    and not exists (
      select 1 from public.lms_picks pk
      where pk.competition_id = p.competition_id
        and pk.user_id = p.user_id
        and pk.gameweek_id = p_gameweek_id
    );

  select gw.id into v_next_gw_id
  from public.lms_gameweeks gw
  where gw.season = v_settle.season
    and gw.number = v_settle.number + 1
  limit 1;

  for v_comp in
    select c.*
    from public.lms_competitions c
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    where c.status in ('open', 'active')
      and exists (
        select 1 from public.lms_participants p where p.competition_id = c.id
      )
      and (
        c.start_gameweek_id is null
        or (sg.season = v_settle.season and sg.number <= v_settle.number)
      )
  loop
    select count(*)::int into v_active_count
    from public.lms_participants
    where competition_id = v_comp.id and status = 'active';

    if v_active_count = 1 then
      update public.lms_participants
      set status = 'winner'
      where competition_id = v_comp.id and status = 'active';

      update public.lms_competitions
      set status = 'completed', updated_at = now()
      where id = v_comp.id;

      v_summary := v_summary || jsonb_build_array(jsonb_build_object(
        'competition_id', v_comp.id,
        'outcome', 'winner'
      ));

    elsif v_active_count = 0 then
      delete from public.lms_used_teams where competition_id = v_comp.id;
      delete from public.lms_picks where competition_id = v_comp.id;

      update public.lms_access_codes
      set is_active = false, voided_at = coalesce(voided_at, now())
      where competition_id = v_comp.id and type = 'rejoin' and is_active = true;

      if v_next_gw_id is not null then
        v_attempts := 0;
        loop
          v_access := public.lms_generate_access_code();
          begin
            insert into public.lms_access_codes (
              competition_id, code, type, valid_for_gameweek_id, created_by_user_id
            ) values (v_comp.id, v_access, 'rejoin', v_next_gw_id, null);
            exit;
          exception when unique_violation then
            v_attempts := v_attempts + 1;
            if v_attempts > 20 then
              v_access := null;
              exit;
            end if;
          end;
        end loop;
      else
        v_access := null;
      end if;

      update public.lms_competitions
      set status = 'open', updated_at = now()
      where id = v_comp.id;

      v_summary := v_summary || jsonb_build_array(jsonb_build_object(
        'competition_id', v_comp.id,
        'outcome', 'rollover',
        'rejoin_code', v_access,
        'valid_for_gameweek_id', v_next_gw_id
      ));

    else
      v_summary := v_summary || jsonb_build_array(jsonb_build_object(
        'competition_id', v_comp.id,
        'outcome', 'continue',
        'active_count', v_active_count
      ));
    end if;
  end loop;

  update public.lms_gameweeks
  set status = 'complete'
  where id = p_gameweek_id;

  return jsonb_build_object('success', true, 'results', v_summary);
end;
$$;

-- Admin settle now delegates to internal helper
create or replace function public.lms_settle_gameweek(p_code text, p_gameweek_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  return public.lms_settle_gameweek_internal(p_gameweek_id);
end;
$$;

revoke all on function public.lms_settle_gameweek_internal(uuid) from public;
grant execute on function public.lms_settle_gameweek_internal(uuid) to service_role;
grant execute on function public.lms_settle_gameweek(text, uuid) to authenticated;
