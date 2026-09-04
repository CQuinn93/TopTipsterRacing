-- Persist Gamemaster quotes (onboarding + requests) and Owner admin views.

create table if not exists public.gamemaster_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('onboarding', 'request')),
  status text not null check (status in (
    'requested',
    'pending_payment',
    'paid_active',
    'paid_complete'
  )),
  payload jsonb not null default '{}'::jsonb,
  season_total numeric,
  hub_deposit_total numeric,
  hub_monthly_total numeric,
  due_today numeric,
  assumed_season_weeks int not null default 8,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz
);

create index if not exists gamemaster_quotes_user_id_idx
  on public.gamemaster_quotes (user_id, created_at desc);

create index if not exists gamemaster_quotes_status_idx
  on public.gamemaster_quotes (status, created_at desc);

comment on table public.gamemaster_quotes is
  'Club package quotes attached on Gamemaster promotion, or requested later by the club.';

alter table public.gamemaster_quotes enable row level security;

-- Helper: convert a quote row into the JSON shape the app expects.
create or replace function public.gamemaster_quote_to_json(q public.gamemaster_quotes)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', q.id,
    'user_id', q.user_id,
    'kind', q.kind,
    'status', q.status,
    'payload', q.payload,
    'season_total', q.season_total,
    'hub_deposit_total', q.hub_deposit_total,
    'hub_monthly_total', q.hub_monthly_total,
    'due_today', q.due_today,
    'assumed_season_weeks', q.assumed_season_weeks,
    'notes', q.notes,
    'created_at', q.created_at,
    'updated_at', q.updated_at,
    'issued_at', q.issued_at,
    'paid_at', q.paid_at,
    'completed_at', q.completed_at
  );
$$;

create or replace function public.gamemaster_quote_payload_ok(p_payload jsonb)
returns boolean
language sql
immutable
as $$
  select
    p_payload is not null
    and jsonb_typeof(p_payload) = 'object'
    and jsonb_typeof(p_payload->'competitions') = 'array'
    and jsonb_array_length(p_payload->'competitions') >= 1
    and jsonb_array_length(p_payload->'competitions') <= 4;
$$;

-- Promote + attach the first (onboarding) quote.
-- Note: this replaces the simpler owner_register_gamemaster from migration 113.
drop function if exists public.owner_register_gamemaster(uuid, text, text, int);
drop function if exists public.owner_register_gamemaster(uuid, text, text, int, jsonb);

create or replace function public.owner_register_gamemaster(
  p_user_id uuid,
  p_club_name text default null,
  p_club_logo_url text default null,
  p_kiosk_licenses int default 1,
  p_quote jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_licenses int := greatest(coalesce(p_kiosk_licenses, 1), 1);
  v_payload jsonb;
  v_quote public.gamemaster_quotes;
  v_i int;
  v_have int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_required');
  end if;

  v_payload := coalesce(p_quote->'payload', p_quote);
  if not public.gamemaster_quote_payload_ok(v_payload) then
    return jsonb_build_object('success', false, 'error', 'quote_required');
  end if;

  select role into v_role from public.profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  if v_role = 'Owner' then
    return jsonb_build_object('success', false, 'error', 'cannot_convert_owner');
  end if;

  update public.profiles
  set
    lifetime_creator_tier = 'gamemaster',
    club_setup_complete = false,
    club_name = nullif(trim(coalesce(p_club_name, '')), ''),
    club_logo_url = nullif(trim(coalesce(p_club_logo_url, '')), ''),
    club_payment_url = null,
    kiosk_licenses_count = greatest(coalesce(kiosk_licenses_count, 0), v_licenses),
    updated_at = now()
  where id = p_user_id;

  select count(*)::int into v_have
  from public.kiosk_licenses
  where user_id = p_user_id and revoked_at is null;

  for v_i in 1..(v_licenses - coalesce(v_have, 0)) loop
    insert into public.kiosk_licenses (user_id)
    values (p_user_id);
  end loop;

  insert into public.gamemaster_quotes (
    user_id,
    kind,
    status,
    payload,
    season_total,
    hub_deposit_total,
    hub_monthly_total,
    due_today,
    assumed_season_weeks,
    issued_at
  )
  values (
    p_user_id,
    'onboarding',
    'pending_payment',
    v_payload,
    nullif(p_quote->>'season_total', '')::numeric,
    nullif(p_quote->>'hub_deposit_total', '')::numeric,
    nullif(p_quote->>'hub_monthly_total', '')::numeric,
    nullif(p_quote->>'due_today', '')::numeric,
    coalesce(nullif(p_quote->>'assumed_season_weeks', '')::int, 8),
    now()
  )
  returning * into v_quote;

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'creator_tier', 'gamemaster',
    'club_setup_complete', false,
    'kiosk_licenses', v_licenses,
    'quote_id', v_quote.id
  );
end;
$$;

revoke all on function public.owner_register_gamemaster(uuid, text, text, int, jsonb) from public;
grant execute on function public.owner_register_gamemaster(uuid, text, text, int, jsonb) to authenticated;

-- Gamemasters request a new quote (no price totals yet).
create or replace function public.gamemaster_request_quote(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator public.creator_tier;
  v_quote public.gamemaster_quotes;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  v_creator := public.subscription_effective_creator_tier(v_uid);
  if v_creator is distinct from 'gamemaster' and not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'not_gamemaster');
  end if;

  if not public.gamemaster_quote_payload_ok(p_payload) then
    return jsonb_build_object('success', false, 'error', 'quote_required');
  end if;

  insert into public.gamemaster_quotes (
    user_id,
    kind,
    status,
    payload
  )
  values (
    v_uid,
    'request',
    'requested',
    p_payload
  )
  returning * into v_quote;

  return jsonb_build_object(
    'success', true,
    'quote', public.gamemaster_quote_to_json(v_quote)
  );
end;
$$;

revoke all on function public.gamemaster_request_quote(jsonb) from public;
grant execute on function public.gamemaster_request_quote(jsonb) to authenticated;

-- Gamemasters list their own quotes.
create or replace function public.gamemaster_list_my_quotes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator public.creator_tier;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  v_creator := public.subscription_effective_creator_tier(v_uid);
  if v_creator is distinct from 'gamemaster' and not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'not_gamemaster');
  end if;

  return jsonb_build_object(
    'success', true,
    'quotes', coalesce(
      (
        select jsonb_agg(public.gamemaster_quote_to_json(q) order by q.created_at desc)
        from public.gamemaster_quotes q
        where q.user_id = v_uid
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.gamemaster_list_my_quotes() from public;
grant execute on function public.gamemaster_list_my_quotes() to authenticated;

-- Owner: list all gamemaster accounts with request/current counts.
create or replace function public.owner_list_gamemasters()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_owner() then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(row_data order by lower(coalesce(club_name, username, email, '')))
      from (
        select
          p.club_name,
          p.username,
          u.email,
          jsonb_build_object(
            'id', p.id,
            'username', p.username,
            'email', u.email,
            'club_name', p.club_name,
            'club_logo_url', p.club_logo_url,
            'club_payment_url', p.club_payment_url,
            'club_setup_complete', coalesce(p.club_setup_complete, false),
            'kiosk_licenses_count', (
              select count(*)::int
              from public.kiosk_licenses kl
              where kl.user_id = p.id and kl.revoked_at is null
            ),
            'created_at', p.created_at,
            'banned_at', p.banned_at,
            'request_count', (
              select count(*)::int
              from public.gamemaster_quotes q
              where q.user_id = p.id and q.status = 'requested'
            ),
            'current_count', (
              select count(*)::int
              from public.gamemaster_quotes q
              where q.user_id = p.id
                and q.status in ('pending_payment', 'paid_active', 'paid_complete')
            )
          ) as row_data
        from public.profiles p
        left join auth.users u on u.id = p.id
        where p.lifetime_creator_tier = 'gamemaster'
          and coalesce(p.role, 'User') is distinct from 'Owner'
      ) listed
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.owner_list_gamemasters() from public;
grant execute on function public.owner_list_gamemasters() to authenticated;

-- Owner: detailed read-only view of a gamemaster account.
create or replace function public.owner_get_gamemaster_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_profile jsonb;
  v_quotes jsonb;
  v_comps jsonb;
begin
  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_required');
  end if;

  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'email', u.email,
    'club_name', p.club_name,
    'club_logo_url', p.club_logo_url,
    'club_payment_url', p.club_payment_url,
    'club_setup_complete', coalesce(p.club_setup_complete, false),
    'kiosk_licenses_count', (
      select count(*)::int
      from public.kiosk_licenses kl
      where kl.user_id = p.id and kl.revoked_at is null
    ),
    'created_at', p.created_at,
    'banned_at', p.banned_at,
    'lifetime_creator_tier', p.lifetime_creator_tier::text
  )
  into v_profile
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = p_user_id
    and p.lifetime_creator_tier = 'gamemaster';

  if v_profile is null then
    return jsonb_build_object('success', false, 'error', 'not_gamemaster');
  end if;

  select coalesce(
    jsonb_agg(public.gamemaster_quote_to_json(q) order by q.created_at desc),
    '[]'::jsonb
  )
  into v_quotes
  from public.gamemaster_quotes q
  where q.user_id = p_user_id;

  -- Include club-created competitions (so admin can see actual quota usage).
  select coalesce(jsonb_agg(comp), '[]'::jsonb)
  into v_comps
  from (
    select jsonb_build_object(
      'sport', 'lms',
      'id', c.id,
      'name', c.name,
      'status', c.status,
      'join_code', (
        select ac.code from public.lms_access_codes ac
        where ac.competition_id = c.id and ac.type = 'join' and ac.is_active = true
        order by ac.created_at asc
        limit 1
      ),
      'participant_count', (
        select count(*)::int from public.lms_participants lp where lp.competition_id = c.id
      ),
      'active_count', (
        select count(*)::int from public.lms_participants lp
        where lp.competition_id = c.id and lp.status = 'active'
      )
    ) as comp
    from public.lms_competitions c
    where c.created_by_user_id = p_user_id

    union all

    select jsonb_build_object(
      'sport', 'f2t',
      'id', c.id,
      'name', c.name,
      'status', c.status,
      'join_code', (
        select ac.code from public.f2t_access_codes ac
        where ac.competition_id = c.id and ac.type = 'join' and ac.is_active = true
        order by ac.created_at asc
        limit 1
      ),
      'participant_count', (
        select count(*)::int from public.f2t_participants fp where fp.competition_id = c.id
      ),
      'active_count', (
        select count(*)::int from public.f2t_participants fp
        where fp.competition_id = c.id and fp.status = 'active'
      )
    )
    from public.f2t_competitions c
    where c.created_by_user_id = p_user_id

    union all

    select jsonb_build_object(
      'sport', 'racing',
      'id', c.id,
      'name', c.name,
      'status', case
        when current_date < c.festival_start_date then 'upcoming'
        when current_date >= c.festival_start_date and current_date <= c.festival_end_date then 'live'
        else 'complete'
      end,
      'join_code', c.access_code,
      'participant_count', (
        select count(*)::int from public.competition_participants cp
        where cp.competition_id = c.id
      ),
      'active_count', (
        select count(*)::int from public.competition_participants cp
        where cp.competition_id = c.id
      )
    )
    from public.competitions c
    where c.created_by_user_id = p_user_id
  ) comps;

  return jsonb_build_object(
    'success', true,
    'profile', v_profile,
    'quotes', v_quotes,
    'competitions', v_comps
  );
end;
$$;

revoke all on function public.owner_get_gamemaster_account(uuid) from public;
grant execute on function public.owner_get_gamemaster_account(uuid) to authenticated;

-- Owner: issue a requested quote (fills totals manually later in app).
create or replace function public.owner_issue_gamemaster_quote(
  p_quote_id uuid,
  p_totals jsonb default null
)
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

  if v_quote.status is distinct from 'requested' then
    return jsonb_build_object('success', false, 'error', 'not_a_request');
  end if;

  update public.gamemaster_quotes
  set
    status = 'pending_payment',
    season_total = coalesce(nullif(p_totals->>'season_total', '')::numeric, season_total),
    hub_deposit_total = coalesce(nullif(p_totals->>'hub_deposit_total', '')::numeric, hub_deposit_total),
    hub_monthly_total = coalesce(nullif(p_totals->>'hub_monthly_total', '')::numeric, hub_monthly_total),
    due_today = coalesce(nullif(p_totals->>'due_today', '')::numeric, due_today),
    assumed_season_weeks = coalesce(nullif(p_totals->>'assumed_season_weeks', '')::int, assumed_season_weeks),
    issued_at = now(),
    updated_at = now()
  where id = p_quote_id
  returning * into v_quote;

  return jsonb_build_object('success', true, 'quote', public.gamemaster_quote_to_json(v_quote));
end;
$$;

revoke all on function public.owner_issue_gamemaster_quote(uuid, jsonb) from public;
grant execute on function public.owner_issue_gamemaster_quote(uuid, jsonb) to authenticated;

-- Owner: set quote payment status (pending_payment -> paid_active -> paid_complete).
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

  return jsonb_build_object('success', true, 'quote', public.gamemaster_quote_to_json(v_quote));
end;
$$;

revoke all on function public.owner_set_gamemaster_quote_status(uuid, text) from public;
grant execute on function public.owner_set_gamemaster_quote_status(uuid, text) to authenticated;

