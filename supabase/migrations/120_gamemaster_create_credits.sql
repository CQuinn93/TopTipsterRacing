-- Gamemaster create credits: stop auto-bulk provision; allow manual create that
-- consumes a quote slot (LMS / Tipster20) with remaining checks.

-- ---------------------------------------------------------------------------
-- Credits summary for the signed-in Gamemaster
-- ---------------------------------------------------------------------------
create or replace function public.gamemaster_list_create_credits()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lms_quoted int := 0;
  v_f2t_quoted int := 0;
  v_lms_used int := 0;
  v_f2t_used int := 0;
  v_lms_quote_id uuid;
  v_f2t_quote_id uuid;
  v_q record;
  v_comp jsonb;
  v_mode text;
  v_q_lms int;
  v_q_f2t int;
  v_q_lms_used int;
  v_q_f2t_used int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if public.subscription_effective_creator_tier(v_uid) is distinct from 'gamemaster'
     and not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  for v_q in
    select id, payload
    from public.gamemaster_quotes
    where user_id = v_uid
      and status = 'paid_active'
    order by coalesce(paid_at, issued_at, created_at) asc
  loop
    v_q_lms := 0;
    v_q_f2t := 0;
    for v_comp in
      select value from jsonb_array_elements(coalesce(v_q.payload->'competitions', '[]'::jsonb))
    loop
      v_mode := lower(coalesce(v_comp->>'footballMode', 'lms'));
      if v_mode = 'tipster20' then
        v_q_f2t := v_q_f2t + 1;
      else
        v_q_lms := v_q_lms + 1;
      end if;
    end loop;

    select count(*)::int into v_q_lms_used
    from public.lms_competitions c
    where c.gamemaster_quote_id = v_q.id;

    select count(*)::int into v_q_f2t_used
    from public.f2t_competitions c
    where c.gamemaster_quote_id = v_q.id;

    v_lms_quoted := v_lms_quoted + v_q_lms;
    v_f2t_quoted := v_f2t_quoted + v_q_f2t;
    v_lms_used := v_lms_used + least(v_q_lms_used, v_q_lms);
    v_f2t_used := v_f2t_used + least(v_q_f2t_used, v_q_f2t);

    if v_lms_quote_id is null and v_q_lms_used < v_q_lms then
      v_lms_quote_id := v_q.id;
    end if;
    if v_f2t_quote_id is null and v_q_f2t_used < v_q_f2t then
      v_f2t_quote_id := v_q.id;
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'total_remaining', greatest(v_lms_quoted - v_lms_used, 0) + greatest(v_f2t_quoted - v_f2t_used, 0),
    'modes', jsonb_build_array(
      jsonb_build_object(
        'mode', 'lms',
        'label', 'Last Man Standing',
        'quoted', v_lms_quoted,
        'used', v_lms_used,
        'remaining', greatest(v_lms_quoted - v_lms_used, 0),
        'quote_id', v_lms_quote_id
      ),
      jsonb_build_object(
        'mode', 'f2t',
        'label', 'First2 Twenty',
        'quoted', v_f2t_quoted,
        'used', v_f2t_used,
        'remaining', greatest(v_f2t_quoted - v_f2t_used, 0),
        'quote_id', v_f2t_quote_id
      ),
      jsonb_build_object(
        'mode', 'racing',
        'label', 'Top Tipster Racing',
        'quoted', 0,
        'used', 0,
        'remaining', 0,
        'quote_id', null
      ),
      jsonb_build_object(
        'mode', 'f2t6',
        'label', 'First2 6',
        'quoted', 0,
        'used', 0,
        'remaining', 0,
        'quote_id', null
      )
    )
  );
end;
$$;

revoke all on function public.gamemaster_list_create_credits() from public;
grant execute on function public.gamemaster_list_create_credits() to authenticated;
grant execute on function public.gamemaster_list_create_credits() to service_role;

-- ---------------------------------------------------------------------------
-- Claim next unused quote slot for a mode (lms | tipster20)
-- ---------------------------------------------------------------------------
create or replace function public.gamemaster_claim_quote_slot(
  p_user_id uuid,
  p_quote_id uuid,
  p_football_mode text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quote public.gamemaster_quotes%rowtype;
  v_mode text := lower(trim(coalesce(p_football_mode, '')));
  v_comp jsonb;
  v_idx int := 0;
  v_used int := 0;
  v_slot jsonb;
  v_slot_mode text;
begin
  if v_mode not in ('lms', 'tipster20') then
    return jsonb_build_object('ok', false, 'error', 'invalid_mode');
  end if;

  select * into v_quote from public.gamemaster_quotes where id = p_quote_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_quote');
  end if;

  if v_quote.user_id is distinct from p_user_id and not public.is_owner() then
    return jsonb_build_object('ok', false, 'error', 'invalid_quote');
  end if;

  if v_quote.status is distinct from 'paid_active' then
    return jsonb_build_object('ok', false, 'error', 'quote_not_active');
  end if;

  if v_mode = 'tipster20' then
    select count(*)::int into v_used
    from public.f2t_competitions where gamemaster_quote_id = p_quote_id;
  else
    select count(*)::int into v_used
    from public.lms_competitions where gamemaster_quote_id = p_quote_id;
  end if;

  for v_comp in
    select value from jsonb_array_elements(coalesce(v_quote.payload->'competitions', '[]'::jsonb))
  loop
    v_slot_mode := lower(coalesce(v_comp->>'footballMode', 'lms'));
    if v_slot_mode is distinct from v_mode then
      continue;
    end if;
    v_idx := v_idx + 1;
    if v_idx <= v_used then
      continue;
    end if;
    v_slot := v_comp;
    exit;
  end loop;

  if v_slot is null then
    return jsonb_build_object('ok', false, 'error', 'no_remaining_credits');
  end if;

  return jsonb_build_object(
    'ok', true,
    'quote_id', p_quote_id,
    'football_mode', v_mode,
    'max_players', greatest(coalesce(nullif(v_slot->>'maxPlayers', '')::int, 50), 2),
    'lms_continuation', coalesce(nullif(trim(v_slot->>'lmsContinuation'), ''), 'full_rollover'),
    'tipster20_continuation', coalesce(nullif(trim(v_slot->>'tipster20Continuation'), ''), 'none')
  );
end;
$$;

revoke all on function public.gamemaster_claim_quote_slot(uuid, uuid, text) from public;
grant execute on function public.gamemaster_claim_quote_slot(uuid, uuid, text) to authenticated;
grant execute on function public.gamemaster_claim_quote_slot(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Owner mark paid: do NOT auto-provision (Gamemaster creates manually)
-- ---------------------------------------------------------------------------
create or replace function public.owner_set_gamemaster_quote_status(
  p_quote_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if v_status not in ('pending_payment', 'paid_active', 'paid_complete') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  update public.gamemaster_quotes
  set
    status = v_status,
    paid_at = case when v_status in ('paid_active', 'paid_complete') then coalesce(paid_at, now()) else null end,
    completed_at = case when v_status = 'paid_complete' then coalesce(completed_at, now()) else null end,
    updated_at = now()
  where id = p_quote_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  return jsonb_build_object(
    'success', true,
    'status', v_status,
    'provision', null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- LMS create: Gamemasters must pass a quote with remaining LMS credit
-- ---------------------------------------------------------------------------
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
  v_creator public.creator_tier;
  v_slot jsonb;
  v_quote_id uuid := p_gamemaster_quote_id;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  v_creator := public.subscription_effective_creator_tier(v_admin);

  if v_creator = 'gamemaster' then
    if v_quote_id is null then
      return jsonb_build_object('success', false, 'error', 'quote_required');
    end if;
    v_slot := public.gamemaster_claim_quote_slot(v_admin, v_quote_id, 'lms');
    if not (v_slot->>'ok')::boolean then
      return jsonb_build_object('success', false, 'error', coalesce(v_slot->>'error', 'no_remaining_credits'));
    end if;
    v_max_participants := (v_slot->>'max_players')::int;
    v_mode := coalesce(nullif(trim(v_slot->>'lms_continuation'), ''), v_mode);
  else
    v_check := public.subscription_check_can_create(v_admin, 'football');
    if not (v_check->>'ok')::boolean then
      return jsonb_build_object('success', false, 'error', v_check->>'error', 'details', v_check);
    end if;
    v_max_participants := (v_check->>'max_participants_per_competition')::int;

    if v_quote_id is not null then
      v_slot := public.gamemaster_claim_quote_slot(v_admin, v_quote_id, 'lms');
      if not (v_slot->>'ok')::boolean and not public.is_owner() then
        return jsonb_build_object('success', false, 'error', coalesce(v_slot->>'error', 'invalid_quote'));
      end if;
      if (v_slot->>'ok')::boolean then
        v_max_participants := (v_slot->>'max_players')::int;
        v_mode := coalesce(nullif(trim(v_slot->>'lms_continuation'), ''), v_mode);
      end if;
    end if;
  end if;

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

  insert into public.lms_competitions (
    name, season, status, created_by_user_id, start_gameweek_id, extra_lives,
    sport_category, max_participants, continuation_mode, gamemaster_quote_id
  )
  values (
    trim(p_name), v_season, 'open', v_admin, p_start_gameweek_id, v_extra,
    'football', v_max_participants, v_mode, v_quote_id
  )
  returning id into v_comp_id;

  insert into public.lms_competition_teams (competition_id, team_id)
  select v_comp_id, t.id from public.lms_teams t
  on conflict do nothing;

  if v_creator is distinct from 'gamemaster' then
    insert into public.lms_participants (
      competition_id, user_id, status, joined_at, lives_remaining
    )
    values (v_comp_id, v_admin, 'active', now(), v_extra)
    on conflict (competition_id, user_id) do nothing;
  end if;

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
    'gamemaster_quote_id', v_quote_id
  );
end;
$$;

-- Drop prior overload if present (REVOKE fails when the signature is missing).
drop function if exists public.f2t_admin_create_competition(text, text, uuid, text, text);

create or replace function public.f2t_admin_create_competition(
  p_code text,
  p_name text,
  p_start_gameweek_id uuid,
  p_season text default '2026/27',
  p_entry text default null,
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
  v_check jsonb;
  v_max_participants int;
  v_creator public.creator_tier;
  v_slot jsonb;
  v_quote_id uuid := p_gamemaster_quote_id;
begin
  v_admin := public.tablet_code_admin_user_id(p_code);
  if v_admin is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  v_creator := public.subscription_effective_creator_tier(v_admin);

  if v_creator = 'gamemaster' then
    if v_quote_id is null then
      return jsonb_build_object('success', false, 'error', 'quote_required');
    end if;
    v_slot := public.gamemaster_claim_quote_slot(v_admin, v_quote_id, 'tipster20');
    if not (v_slot->>'ok')::boolean then
      return jsonb_build_object('success', false, 'error', coalesce(v_slot->>'error', 'no_remaining_credits'));
    end if;
    v_max_participants := (v_slot->>'max_players')::int;
  else
    v_check := public.subscription_check_can_create(v_admin, 'football');
    if not (v_check->>'ok')::boolean then
      return jsonb_build_object('success', false, 'error', v_check->>'error', 'details', v_check);
    end if;
    v_max_participants := (v_check->>'max_participants_per_competition')::int;

    if v_quote_id is not null then
      v_slot := public.gamemaster_claim_quote_slot(v_admin, v_quote_id, 'tipster20');
      if not (v_slot->>'ok')::boolean and not public.is_owner() then
        return jsonb_build_object('success', false, 'error', coalesce(v_slot->>'error', 'invalid_quote'));
      end if;
      if (v_slot->>'ok')::boolean then
        v_max_participants := (v_slot->>'max_players')::int;
      end if;
    end if;
  end if;

  if trim(coalesce(p_name, '')) = '' then
    return jsonb_build_object('success', false, 'error', 'name_required');
  end if;

  if p_start_gameweek_id is null then
    return jsonb_build_object('success', false, 'error', 'start_gameweek_required');
  end if;

  select * into v_gw from public.lms_gameweeks where id = p_start_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_start_gameweek');
  end if;

  if v_gw.season <> v_season then
    return jsonb_build_object('success', false, 'error', 'start_gameweek_season_mismatch');
  end if;

  insert into public.f2t_competitions (
    name, season, status, created_by_user_id, start_gameweek_id, entry,
    sport_category, max_participants, gamemaster_quote_id
  )
  values (
    trim(p_name), v_season, 'open', v_admin, p_start_gameweek_id,
    nullif(trim(coalesce(p_entry, '')), ''),
    'football', v_max_participants, v_quote_id
  )
  returning id into v_comp_id;

  -- Club Gamemasters manage competitions; they are not players in their own leagues.
  if v_creator is distinct from 'gamemaster' then
    insert into public.f2t_participants (competition_id, user_id, status, joined_at)
    values (v_comp_id, v_admin, 'active', now())
    on conflict (competition_id, user_id) do nothing;
  end if;

  loop
    v_access := public.lms_generate_access_code();
    begin
      insert into public.f2t_access_codes (competition_id, code, type, created_by_user_id)
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
    'max_participants', v_max_participants,
    'gamemaster_quote_id', v_quote_id
  );
end;
$$;

revoke all on function public.f2t_admin_create_competition(text, text, uuid, text, text, uuid) from public;
grant execute on function public.f2t_admin_create_competition(text, text, uuid, text, text, uuid) to authenticated;
grant execute on function public.f2t_admin_create_competition(text, text, uuid, text, text, uuid) to service_role;
