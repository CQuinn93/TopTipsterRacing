-- Automate LMS competition end based on continuation mode, and auto-complete
-- linked Gamemaster quotes when every linked competition is finished.
--
-- End rules:
--   1 active player  → winner + competition completed (unchanged)
--   0 active + continuation_mode = 'none' → competition completed (no rollover)
--   0 active + full_rollover / mass_wipeout_revive → existing rollover path
--     (mass wipeout revive semantics can be refined later; for now it keeps going)

alter table public.lms_competitions
  add column if not exists continuation_mode text not null default 'full_rollover'
    check (continuation_mode in ('none', 'full_rollover', 'mass_wipeout_revive'));

alter table public.lms_competitions
  add column if not exists gamemaster_quote_id uuid
    references public.gamemaster_quotes (id) on delete set null;

create index if not exists idx_lms_competitions_quote
  on public.lms_competitions (gamemaster_quote_id)
  where gamemaster_quote_id is not null;

comment on column public.lms_competitions.continuation_mode is
  'How wipeouts are handled: none ends the competition; full_rollover / mass_wipeout_revive keep it going.';

comment on column public.lms_competitions.gamemaster_quote_id is
  'Optional link to the Gamemaster package quote that authorised this competition.';

-- When all LMS competitions for a quote are completed, mark the quote paid_complete.
create or replace function public.maybe_complete_gamemaster_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.gamemaster_quotes%rowtype;
  v_total int;
  v_done int;
begin
  if p_quote_id is null then
    return;
  end if;

  select * into v_quote from public.gamemaster_quotes where id = p_quote_id;
  if not found then
    return;
  end if;

  if v_quote.status is distinct from 'paid_active' then
    return;
  end if;

  select count(*)::int into v_total
  from public.lms_competitions
  where gamemaster_quote_id = p_quote_id;

  if v_total < 1 then
    return;
  end if;

  select count(*)::int into v_done
  from public.lms_competitions
  where gamemaster_quote_id = p_quote_id
    and status = 'completed';

  if v_done = v_total then
    update public.gamemaster_quotes
    set
      status = 'paid_complete',
      completed_at = coalesce(completed_at, now()),
      paid_at = coalesce(paid_at, now()),
      notes = coalesce(notes, 'Season complete — all linked competitions finished.'),
      updated_at = now()
    where id = p_quote_id
      and status = 'paid_active';
  end if;
end;
$$;

revoke all on function public.maybe_complete_gamemaster_quote(uuid) from public;
grant execute on function public.maybe_complete_gamemaster_quote(uuid) to authenticated;

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
  v_summary jsonb := '[]'::jsonb;
  v_settle public.lms_gameweeks%rowtype;
  v_apply jsonb;
  v_mode text;
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
  where gameweek_id = p_gameweek_id
    and coalesce(excluded_from_lms, false) = false
    and status <> 'finished';

  if v_unfinished > 0 then
    return jsonb_build_object('success', false, 'error', 'fixtures_incomplete', 'remaining', v_unfinished);
  end if;

  if not exists (
    select 1 from public.lms_fixtures
    where gameweek_id = p_gameweek_id and coalesce(excluded_from_lms, false) = false
  ) then
    return jsonb_build_object('success', false, 'error', 'no_fixtures');
  end if;

  perform public.lms_auto_assign_missed_picks(p_gameweek_id);

  v_apply := public.lms_apply_finished_pick_results(p_gameweek_id);

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
    update public.lms_picks
    set result = 'incorrect', updated_at = now()
    where id = v_pick.id;

    perform public.lms_consume_participant_life(
      v_pick.competition_id,
      v_pick.user_id,
      p_gameweek_id
    );
  end loop;

  -- No pick at all for this gameweek → still instant eliminate
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

    v_mode := coalesce(v_comp.continuation_mode, 'full_rollover');

    if v_active_count = 1 then
      update public.lms_participants
      set status = 'winner'
      where competition_id = v_comp.id and status = 'active';

      update public.lms_competitions
      set status = 'completed', updated_at = now()
      where id = v_comp.id;

      perform public.maybe_complete_gamemaster_quote(v_comp.gamemaster_quote_id);

      v_summary := v_summary || jsonb_build_array(jsonb_build_object(
        'competition_id', v_comp.id,
        'outcome', 'winner'
      ));

    elsif v_active_count = 0 and v_mode = 'none' then
      -- No continuation: field wiped out with no sole survivor → season over.
      update public.lms_competitions
      set status = 'completed', updated_at = now()
      where id = v_comp.id;

      update public.lms_access_codes
      set is_active = false, voided_at = coalesce(voided_at, now())
      where competition_id = v_comp.id and type = 'rejoin' and is_active = true;

      perform public.maybe_complete_gamemaster_quote(v_comp.gamemaster_quote_id);

      v_summary := v_summary || jsonb_build_array(jsonb_build_object(
        'competition_id', v_comp.id,
        'outcome', 'ended_no_survivors',
        'continuation_mode', v_mode
      ));

    elsif v_active_count = 0 then
      -- Continuation selected (full_rollover / mass_wipeout_revive): keep going.
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
        'continuation_mode', v_mode,
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

  return jsonb_build_object(
    'success', true,
    'results', v_summary,
    'apply', v_apply
  );
end;
$$;

-- Create competition: optional continuation mode + quote link (defaults preserve current behaviour).
drop function if exists public.lms_admin_create_competition(text, text, uuid, text, int);

create or replace function public.lms_admin_create_competition(
  p_code text,
  p_name text,
  p_start_gameweek_id uuid,
  p_season text default '2026/27',
  p_extra_lives int default 0,
  p_continuation_mode text default 'full_rollover',
  p_gamemaster_quote_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_comp_id uuid;
  v_access char(6);
  v_attempts int := 0;
  v_gw public.lms_gameweeks%rowtype;
  v_season text := coalesce(nullif(trim(p_season), ''), '2026/27');
  v_extra int := coalesce(p_extra_lives, 0);
  v_check jsonb;
  v_max_participants int;
  v_mode text := coalesce(nullif(trim(p_continuation_mode), ''), 'full_rollover');
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  v_check := public.subscription_check_can_create(v_admin, 'football');
  if not (v_check->>'ok')::boolean then
    return jsonb_build_object('success', false, 'error', v_check->>'error', 'details', v_check);
  end if;
  v_max_participants := (v_check->>'max_participants_per_competition')::int;

  if trim(coalesce(p_name, '')) = '' then
    return jsonb_build_object('success', false, 'error', 'name_required');
  end if;

  if p_start_gameweek_id is null then
    return jsonb_build_object('success', false, 'error', 'start_gameweek_required');
  end if;

  if v_extra < 0 or v_extra > 3 then
    return jsonb_build_object('success', false, 'error', 'invalid_extra_lives');
  end if;

  if v_mode not in ('none', 'full_rollover', 'mass_wipeout_revive') then
    return jsonb_build_object('success', false, 'error', 'invalid_continuation_mode');
  end if;

  select * into v_gw from public.lms_gameweeks where id = p_start_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_start_gameweek');
  end if;

  if v_gw.season <> v_season then
    return jsonb_build_object('success', false, 'error', 'start_gameweek_season_mismatch');
  end if;

  if p_gamemaster_quote_id is not null then
    if not exists (
      select 1 from public.gamemaster_quotes q
      where q.id = p_gamemaster_quote_id
        and q.user_id = v_admin
        and q.status in ('paid_active', 'pending_payment')
    ) and not public.is_owner() then
      return jsonb_build_object('success', false, 'error', 'invalid_quote');
    end if;
  end if;

  insert into public.lms_competitions (
    name, season, status, created_by_user_id, start_gameweek_id, extra_lives,
    sport_category, max_participants, continuation_mode, gamemaster_quote_id
  )
  values (
    trim(p_name), v_season, 'open', v_admin, p_start_gameweek_id, v_extra,
    'football', v_max_participants, v_mode, p_gamemaster_quote_id
  )
  returning id into v_comp_id;

  insert into public.lms_competition_teams (competition_id, team_id)
  select v_comp_id, t.id from public.lms_teams t
  on conflict do nothing;

  insert into public.lms_participants (
    competition_id, user_id, status, joined_at, lives_remaining
  )
  values (v_comp_id, v_admin, 'active', now(), v_extra)
  on conflict (competition_id, user_id) do nothing;

  loop
    v_access := public.lms_generate_access_code();
    begin
      insert into public.lms_access_codes (competition_id, code, type, created_by_user_id)
      values (v_comp_id, v_access, 'join', v_admin);
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 20 then
        return jsonb_build_object('success', false, 'error', 'code_generation_failed');
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'success', true,
    'competition_id', v_comp_id,
    'access_code', v_access,
    'start_gameweek_id', p_start_gameweek_id,
    'start_gameweek_number', v_gw.number,
    'extra_lives', v_extra,
    'max_participants', v_max_participants,
    'continuation_mode', v_mode,
    'gamemaster_quote_id', p_gamemaster_quote_id
  );
end;
$$;

revoke all on function public.lms_admin_create_competition(text, text, uuid, text, int, text, uuid) from public;
grant execute on function public.lms_admin_create_competition(text, text, uuid, text, int, text, uuid) to authenticated;
