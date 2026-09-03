-- Competition Hub kiosk mode: payment method on join requests + fundraiser URL.

-- ---------------------------------------------------------------------------
-- 1) Payment method on pending joins
-- ---------------------------------------------------------------------------

alter table public.lms_join_requests
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('cash', 'online')),
  add column if not exists payment_note text;

alter table public.f2t_join_requests
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('cash', 'online')),
  add column if not exists payment_note text;

alter table public.competition_join_requests
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('cash', 'online')),
  add column if not exists payment_note text;

comment on column public.lms_join_requests.payment_method is
  'Kiosk / venue join: cash at collection point, or online via club payment link.';
comment on column public.f2t_join_requests.payment_method is
  'Kiosk / venue join: cash at collection point, or online via club payment link.';
comment on column public.competition_join_requests.payment_method is
  'Kiosk / venue join: cash at collection point, or online via club payment link.';

-- ---------------------------------------------------------------------------
-- 2) Club charity / payment URL (displayed as QR / open link on kiosk)
-- ---------------------------------------------------------------------------

alter table public.lms_competitions
  add column if not exists fundraiser_payment_url text;

alter table public.f2t_competitions
  add column if not exists fundraiser_payment_url text;

alter table public.competitions
  add column if not exists fundraiser_payment_url text;

-- ---------------------------------------------------------------------------
-- 3) Gate: can this user run a competition hub kiosk?
-- ---------------------------------------------------------------------------

create or replace function public.kiosk_can_setup()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ent jsonb;
  v_creator public.creator_tier;
  v_allowed boolean := false;
  v_licenses int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  v_ent := public.get_my_entitlements();
  v_allowed := coalesce((v_ent->>'kiosk_purchase_allowed')::boolean, false)
    or coalesce((v_ent->>'is_owner')::boolean, false);
  v_licenses := coalesce((v_ent->>'kiosk_licenses_count')::int, 0);
  v_creator := public.subscription_effective_creator_tier(v_uid);

  if not v_allowed then
    return jsonb_build_object(
      'success', false,
      'error', 'kiosk_not_allowed',
      'message', 'Competition Hub kiosk requires a Gamemaster plan (or Owner).'
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'is_owner', coalesce((v_ent->>'is_owner')::boolean, false),
    'creator_tier', v_creator,
    'kiosk_licenses_count', v_licenses,
    'fundraiser_settings_allowed', coalesce((v_ent->>'fundraiser_settings_allowed')::boolean, false)
  );
end;
$$;

revoke all on function public.kiosk_can_setup() from public;
grant execute on function public.kiosk_can_setup() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) List competitions this organiser can lock a hub tablet to
-- ---------------------------------------------------------------------------

create or replace function public.kiosk_list_my_competitions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_gate jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated', 'competitions', '[]'::jsonb);
  end if;

  v_gate := public.kiosk_can_setup();
  if coalesce((v_gate->>'success')::boolean, false) is not true then
    return jsonb_build_object(
      'success', false,
      'error', coalesce(v_gate->>'error', 'kiosk_not_allowed'),
      'competitions', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(x.row_json order by x.sort_name), '[]'::jsonb)
  into v_rows
  from (
    select
      lower(c.name) as sort_name,
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'sport', 'lms',
        'status', c.status,
        'entry', c.entry,
        'fundraiser_payment_url', c.fundraiser_payment_url,
        'join_code', (
          select ac.code
          from public.lms_access_codes ac
          where ac.competition_id = c.id
            and ac.type = 'join'
            and ac.is_active = true
          order by ac.created_at desc nulls last
          limit 1
        )
      ) as row_json
    from public.lms_competitions c
    where c.created_by_user_id = v_uid
      and c.status in ('open', 'active')

    union all

    select
      lower(c.name),
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'sport', 'f2t',
        'status', c.status,
        'entry', c.entry,
        'fundraiser_payment_url', c.fundraiser_payment_url,
        'join_code', (
          select ac.code
          from public.f2t_access_codes ac
          where ac.competition_id = c.id
            and ac.type = 'join'
            and ac.is_active = true
          order by ac.created_at desc nulls last
          limit 1
        )
      )
    from public.f2t_competitions c
    where c.created_by_user_id = v_uid
      and c.status in ('open', 'active')

    union all

    select
      lower(c.name),
      jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'sport', 'racing',
        'status', case
          when c.festival_end_date < current_date then 'complete'
          when c.festival_start_date > current_date then 'upcoming'
          else 'live'
        end,
        'entry', null,
        'fundraiser_payment_url', c.fundraiser_payment_url,
        'join_code', nullif(trim(c.access_code), '')
      )
    from public.competitions c
    where c.created_by_user_id = v_uid
      and c.festival_end_date >= current_date
  ) x;

  return jsonb_build_object('success', true, 'competitions', coalesce(v_rows, '[]'::jsonb));
end;
$$;

revoke all on function public.kiosk_list_my_competitions() from public;
grant execute on function public.kiosk_list_my_competitions() to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Save / clear fundraiser payment URL (Gamemaster / Owner / creator of comp)
-- ---------------------------------------------------------------------------

create or replace function public.kiosk_set_fundraiser_payment_url(
  p_competition_id uuid,
  p_sport text,
  p_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_url text := nullif(trim(p_url), '');
  v_sport text := lower(trim(coalesce(p_sport, '')));
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_competition_id is null or v_sport not in ('lms', 'f2t', 'racing') then
    return jsonb_build_object('success', false, 'error', 'invalid_args');
  end if;

  if v_url is not null and v_url !~* '^https?://' then
    return jsonb_build_object('success', false, 'error', 'invalid_url');
  end if;

  if v_sport = 'lms' then
    if not exists (
      select 1 from public.lms_competitions c
      where c.id = p_competition_id
        and (c.created_by_user_id = v_uid or public.is_owner())
    ) then
      return jsonb_build_object('success', false, 'error', 'unauthorized');
    end if;
    update public.lms_competitions
    set fundraiser_payment_url = v_url, updated_at = now()
    where id = p_competition_id;
  elsif v_sport = 'f2t' then
    if not exists (
      select 1 from public.f2t_competitions c
      where c.id = p_competition_id
        and (c.created_by_user_id = v_uid or public.is_owner())
    ) then
      return jsonb_build_object('success', false, 'error', 'unauthorized');
    end if;
    update public.f2t_competitions
    set fundraiser_payment_url = v_url, updated_at = now()
    where id = p_competition_id;
  else
    if not exists (
      select 1 from public.competitions c
      where c.id = p_competition_id
        and (c.created_by_user_id = v_uid or public.is_owner())
    ) then
      return jsonb_build_object('success', false, 'error', 'unauthorized');
    end if;
    update public.competitions
    set fundraiser_payment_url = v_url
    where id = p_competition_id;
  end if;

  return jsonb_build_object('success', true, 'fundraiser_payment_url', v_url);
end;
$$;

revoke all on function public.kiosk_set_fundraiser_payment_url(uuid, text, text) from public;
grant execute on function public.kiosk_set_fundraiser_payment_url(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Patron sets payment method on their own pending join request
-- ---------------------------------------------------------------------------

create or replace function public.kiosk_set_join_payment_method(
  p_request_id uuid,
  p_sport text,
  p_payment_method text,
  p_payment_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sport text := lower(trim(coalesce(p_sport, '')));
  v_method text := lower(trim(coalesce(p_payment_method, '')));
  v_note text := nullif(trim(coalesce(p_payment_note, '')), '');
  v_updated int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if v_method not in ('cash', 'online') then
    return jsonb_build_object('success', false, 'error', 'invalid_payment_method');
  end if;

  if v_sport = 'lms' then
    update public.lms_join_requests
    set payment_method = v_method,
        payment_note = v_note
    where id = p_request_id
      and user_id = v_uid
      and status = 'pending';
    get diagnostics v_updated = row_count;
  elsif v_sport = 'f2t' then
    update public.f2t_join_requests
    set payment_method = v_method,
        payment_note = v_note
    where id = p_request_id
      and user_id = v_uid
      and status = 'pending';
    get diagnostics v_updated = row_count;
  elsif v_sport = 'racing' then
    update public.competition_join_requests
    set payment_method = v_method,
        payment_note = v_note
    where id = p_request_id
      and user_id = v_uid
      and status = 'pending';
    get diagnostics v_updated = row_count;
  else
    return jsonb_build_object('success', false, 'error', 'invalid_sport');
  end if;

  if v_updated = 0 then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;

  return jsonb_build_object(
    'success', true,
    'payment_method', v_method,
    'payment_note', v_note
  );
end;
$$;

revoke all on function public.kiosk_set_join_payment_method(uuid, text, text, text) from public;
grant execute on function public.kiosk_set_join_payment_method(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Pending lists include payment_method for admin confirmation
-- ---------------------------------------------------------------------------

create or replace function public.lms_admin_list_pending_for_competition(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.lms_can_handle_joins(p_competition_id) then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'competition_id', r.competition_id,
          'competition_name', c.name,
          'user_id', r.user_id,
          'username', p.username,
          'code_type', ac.type,
          'created_at', r.created_at,
          'payment_method', r.payment_method,
          'payment_note', r.payment_note,
          'is_reentry', exists (
            select 1
            from public.lms_participants xp
            where xp.competition_id = r.competition_id
              and xp.user_id = r.user_id
          ),
          'request_kind', case
            when exists (
              select 1
              from public.lms_participants xp
              where xp.competition_id = r.competition_id
                and xp.user_id = r.user_id
            ) then 're_entry'
            else 'new'
          end
        )
        order by r.created_at asc
      ),
      '[]'::jsonb
    )
    from public.lms_join_requests r
    join public.lms_competitions c on c.id = r.competition_id
    join public.lms_access_codes ac on ac.id = r.access_code_id
    left join public.profiles p on p.id = r.user_id
    where r.competition_id = p_competition_id
      and r.status = 'pending'
  );
end;
$$;

create or replace function public.f2t_admin_list_pending_for_competition(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.f2t_can_handle_joins(p_competition_id) then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', jr.id,
          'competition_id', jr.competition_id,
          'user_id', jr.user_id,
          'username', pr.username,
          'created_at', jr.created_at,
          'payment_method', jr.payment_method,
          'payment_note', jr.payment_note
        )
        order by jr.created_at asc
      )
      from public.f2t_join_requests jr
      left join public.profiles pr on pr.id = jr.user_id
      where jr.competition_id = p_competition_id and jr.status = 'pending'
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.admin_list_pending_for_competition(p_code text, p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.tablet_code_admin_user_id(p_code) is null then
    return '[]'::jsonb;
  end if;

  if not public.racing_can_manage_competition(p_competition_id) then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'competition_id', r.competition_id,
      'competition_name', c.name,
      'user_id', r.user_id,
      'display_name', r.display_name,
      'created_at', r.created_at,
      'payment_method', r.payment_method,
      'payment_note', r.payment_note
    ) order by r.created_at desc), '[]'::jsonb)
    from public.competition_join_requests r
    join public.competitions c on c.id = r.competition_id
    where r.competition_id = p_competition_id
      and r.status = 'pending'
  );
end;
$$;
