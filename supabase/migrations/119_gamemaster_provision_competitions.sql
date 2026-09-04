-- When a Gamemaster quote becomes paid_active, provision the quoted competitions.
-- Also: transfer ownership, and stop inserting Gamemasters as playing participants.

alter table public.f2t_competitions
  add column if not exists gamemaster_quote_id uuid
    references public.gamemaster_quotes (id) on delete set null;

create index if not exists idx_f2t_competitions_quote
  on public.f2t_competitions (gamemaster_quote_id)
  where gamemaster_quote_id is not null;

-- ---------------------------------------------------------------------------
-- Helper: next open gameweek for a season
-- ---------------------------------------------------------------------------

create or replace function public.gamemaster_default_start_gameweek_id(p_season text default '2026/27')
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select gw.id
  from public.lms_gameweeks gw
  where gw.season = coalesce(nullif(trim(p_season), ''), '2026/27')
    and gw.status <> 'complete'
  order by gw.number asc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Provision competitions from a paid quote payload
-- ---------------------------------------------------------------------------

create or replace function public.gamemaster_provision_quote_competitions(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.gamemaster_quotes%rowtype;
  v_club text;
  v_comp jsonb;
  v_idx int := 0;
  v_mode text;
  v_name text;
  v_max int;
  v_cont text;
  v_gw uuid;
  v_comp_id uuid;
  v_access char(6);
  v_attempts int;
  v_created jsonb := '[]'::jsonb;
  v_existing int;
  v_lms_existing int;
  v_f2t_existing int;
begin
  if p_quote_id is null then
    return jsonb_build_object('success', false, 'error', 'quote_required');
  end if;

  select * into v_quote from public.gamemaster_quotes where id = p_quote_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'quote_not_found');
  end if;

  -- Owner can provision any quote; Gamemaster only their own paid package.
  if not public.is_owner() and auth.uid() is distinct from v_quote.user_id then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if not public.is_owner() and v_quote.status is distinct from 'paid_active' then
    return jsonb_build_object('success', false, 'error', 'quote_not_active');
  end if;

  if v_quote.status not in ('paid_active', 'pending_payment') then
    return jsonb_build_object('success', false, 'error', 'quote_not_active');
  end if;

  select nullif(trim(club_name), '') into v_club
  from public.profiles
  where id = v_quote.user_id;

  v_gw := public.gamemaster_default_start_gameweek_id('2026/27');
  if v_gw is null then
    return jsonb_build_object('success', false, 'error', 'no_open_gameweek');
  end if;

  select count(*)::int into v_lms_existing
  from public.lms_competitions
  where gamemaster_quote_id = p_quote_id;

  select count(*)::int into v_f2t_existing
  from public.f2t_competitions
  where gamemaster_quote_id = p_quote_id;

  v_existing := coalesce(v_lms_existing, 0) + coalesce(v_f2t_existing, 0);

  -- Already provisioned enough rows for this quote.
  if v_existing >= coalesce(jsonb_array_length(v_quote.payload->'competitions'), 0) then
    return jsonb_build_object(
      'success', true,
      'created', '[]'::jsonb,
      'skipped', true,
      'existing_count', v_existing
    );
  end if;

  for v_comp in
    select value
    from jsonb_array_elements(coalesce(v_quote.payload->'competitions', '[]'::jsonb))
  loop
    v_idx := v_idx + 1;
    if v_idx <= v_existing then
      continue;
    end if;

    v_mode := lower(coalesce(v_comp->>'footballMode', 'lms'));
    v_max := greatest(coalesce(nullif(v_comp->>'maxPlayers', '')::int, 30), 2);

    if v_mode = 'tipster20' then
      v_name := coalesce(v_club, 'Club') || ' Tipster20';
      if v_idx > 1 then
        v_name := v_name || ' ' || v_idx::text;
      end if;

      insert into public.f2t_competitions (
        name, season, status, created_by_user_id, start_gameweek_id,
        sport_category, max_participants, gamemaster_quote_id
      )
      values (
        v_name, '2026/27', 'open', v_quote.user_id, v_gw,
        'football', v_max, p_quote_id
      )
      returning id into v_comp_id;

      v_attempts := 0;
      loop
        v_access := public.lms_generate_access_code();
        begin
          insert into public.f2t_access_codes (competition_id, code, type, created_by_user_id)
          values (v_comp_id, v_access, 'join', v_quote.user_id);
          exit;
        exception when unique_violation then
          v_attempts := v_attempts + 1;
          if v_attempts > 20 then
            return jsonb_build_object('success', false, 'error', 'code_generation_failed');
          end if;
        end;
      end loop;

      v_created := v_created || jsonb_build_array(jsonb_build_object(
        'sport', 'f2t',
        'id', v_comp_id,
        'name', v_name,
        'join_code', v_access
      ));
    else
      v_cont := coalesce(nullif(trim(v_comp->>'lmsContinuation'), ''), 'full_rollover');
      if v_cont not in ('none', 'full_rollover', 'mass_wipeout_revive') then
        v_cont := 'full_rollover';
      end if;

      v_name := coalesce(v_club, 'Club') || ' LMS';
      if v_idx > 1 then
        v_name := v_name || ' ' || v_idx::text;
      end if;

      insert into public.lms_competitions (
        name, season, status, created_by_user_id, start_gameweek_id, extra_lives,
        sport_category, max_participants, continuation_mode, gamemaster_quote_id
      )
      values (
        v_name, '2026/27', 'open', v_quote.user_id, v_gw, 0,
        'football', v_max, v_cont, p_quote_id
      )
      returning id into v_comp_id;

      insert into public.lms_competition_teams (competition_id, team_id)
      select v_comp_id, t.id from public.lms_teams t
      on conflict do nothing;

      -- Do NOT add the Gamemaster as a playing participant.

      v_attempts := 0;
      loop
        v_access := public.lms_generate_access_code();
        begin
          insert into public.lms_access_codes (competition_id, code, type, created_by_user_id)
          values (v_comp_id, v_access, 'join', v_quote.user_id);
          exit;
        exception when unique_violation then
          v_attempts := v_attempts + 1;
          if v_attempts > 20 then
            return jsonb_build_object('success', false, 'error', 'code_generation_failed');
          end if;
        end;
      end loop;

      v_created := v_created || jsonb_build_array(jsonb_build_object(
        'sport', 'lms',
        'id', v_comp_id,
        'name', v_name,
        'join_code', v_access
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'created', v_created,
    'existing_count', v_existing
  );
end;
$$;

revoke all on function public.gamemaster_provision_quote_competitions(uuid) from public;
grant execute on function public.gamemaster_provision_quote_competitions(uuid) to authenticated;
grant execute on function public.gamemaster_provision_quote_competitions(uuid) to service_role;

-- Owner mark paid → provision competitions
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
  v_quote public.gamemaster_quotes;
  v_status text := nullif(trim(p_status), '');
  v_provision jsonb;
begin
  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if v_status not in ('pending_payment', 'paid_active', 'paid_complete') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  select * into v_quote from public.gamemaster_quotes where id = p_quote_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'quote_not_found');
  end if;

  if v_quote.status = 'requested' then
    return jsonb_build_object('success', false, 'error', 'issue_request_first');
  end if;

  update public.gamemaster_quotes
  set
    status = v_status,
    paid_at = case when v_status in ('paid_active', 'paid_complete') then coalesce(paid_at, now()) else null end,
    completed_at = case when v_status = 'paid_complete' then coalesce(completed_at, now()) else null end,
    updated_at = now()
  where id = p_quote_id
  returning * into v_quote;

  if v_status = 'paid_active' then
    v_provision := public.gamemaster_provision_quote_competitions(p_quote_id);
  end if;

  return jsonb_build_object(
    'success', true,
    'quote', public.gamemaster_quote_to_json(v_quote),
    'provision', v_provision
  );
end;
$$;

-- Owner can re-run provisioning for an already-active quote (repair)
create or replace function public.owner_provision_gamemaster_quote(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.gamemaster_quotes;
begin
  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select * into v_quote from public.gamemaster_quotes where id = p_quote_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'quote_not_found');
  end if;

  if v_quote.status not in ('paid_active', 'pending_payment') then
    return jsonb_build_object('success', false, 'error', 'quote_not_active');
  end if;

  -- Ensure paid_active so Gamemaster can manage immediately.
  if v_quote.status = 'pending_payment' then
    update public.gamemaster_quotes
    set status = 'paid_active',
        paid_at = coalesce(paid_at, now()),
        updated_at = now()
    where id = p_quote_id;
  end if;

  return public.gamemaster_provision_quote_competitions(p_quote_id);
end;
$$;

revoke all on function public.owner_provision_gamemaster_quote(uuid) from public;
grant execute on function public.owner_provision_gamemaster_quote(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Transfer competition ownership to a Gamemaster (Owner-only)
-- ---------------------------------------------------------------------------

create or replace function public.owner_transfer_competition(
  p_sport text,
  p_competition_id uuid,
  p_to_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sport text := lower(trim(coalesce(p_sport, '')));
  v_tier public.creator_tier;
begin
  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_competition_id is null or p_to_user_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_args');
  end if;

  v_tier := public.subscription_effective_creator_tier(p_to_user_id);
  if v_tier is distinct from 'gamemaster' then
    return jsonb_build_object('success', false, 'error', 'target_not_gamemaster');
  end if;

  if v_sport = 'lms' then
    update public.lms_competitions
    set created_by_user_id = p_to_user_id, updated_at = now()
    where id = p_competition_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'competition_not_found');
    end if;
  elsif v_sport = 'f2t' then
    update public.f2t_competitions
    set created_by_user_id = p_to_user_id, updated_at = now()
    where id = p_competition_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'competition_not_found');
    end if;
  elsif v_sport = 'racing' then
    update public.competitions
    set created_by_user_id = p_to_user_id
    where id = p_competition_id;
    if not found then
      return jsonb_build_object('success', false, 'error', 'competition_not_found');
    end if;
  else
    return jsonb_build_object('success', false, 'error', 'invalid_sport');
  end if;

  return jsonb_build_object(
    'success', true,
    'sport', v_sport,
    'competition_id', p_competition_id,
    'created_by_user_id', p_to_user_id
  );
end;
$$;

revoke all on function public.owner_transfer_competition(text, uuid, uuid) from public;
grant execute on function public.owner_transfer_competition(text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- LMS create: do not force Gamemaster into the player table
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

  v_creator := public.subscription_effective_creator_tier(v_admin);
  -- Club Gamemasters manage competitions; they are not players in their own leagues.
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
    'gamemaster_quote_id', p_gamemaster_quote_id
  );
end;
$$;

-- One-shot: provision any already paid_active quotes that have no comps yet
do $$
declare
  r record;
begin
  for r in
    select q.id
    from public.gamemaster_quotes q
    where q.status = 'paid_active'
      and coalesce(jsonb_array_length(q.payload->'competitions'), 0) > 0
      and not exists (
        select 1 from public.lms_competitions c where c.gamemaster_quote_id = q.id
      )
      and not exists (
        select 1 from public.f2t_competitions c where c.gamemaster_quote_id = q.id
      )
  loop
    perform public.gamemaster_provision_quote_competitions(r.id);
  end loop;
end $$;
