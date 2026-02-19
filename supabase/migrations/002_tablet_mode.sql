-- Tablet mode: 6-digit code per user for making selections on another device without logging in.

-- One row per user; code is unique across all users
create table if not exists public.user_tablet_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  code char(6) not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_tablet_codes_code on public.user_tablet_codes(code);

alter table public.user_tablet_codes enable row level security;

-- Users can read/insert/update their own row only
create policy "User tablet codes own read" on public.user_tablet_codes
  for select using (auth.uid() = user_id);
create policy "User tablet codes own insert" on public.user_tablet_codes
  for insert with check (auth.uid() = user_id);
create policy "User tablet codes own update" on public.user_tablet_codes
  for update using (auth.uid() = user_id);

-- RPC: tablet mode – get data for a 6-digit code (anon can call; returns data only if code valid)
create or replace function public.tablet_get_data(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_comps jsonb;
  v_race_days jsonb;
  v_selections jsonb;
begin
  if length(trim(p_code)) <> 6 then
    return jsonb_build_object('error', 'invalid_code');
  end if;

  select user_id into v_user_id
  from public.user_tablet_codes
  where code = trim(p_code);

  if v_user_id is null then
    return jsonb_build_object('error', 'invalid_code');
  end if;

  -- Competitions user is in
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'status', c.status
  )), '[]'::jsonb) into v_comps
  from public.competition_participants cp
  join public.competitions c on c.id = cp.competition_id
  where cp.user_id = v_user_id;

  -- Race days for those competitions (all, we filter by comp in app)
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rd.id,
    'competition_id', rd.competition_id,
    'race_date', rd.race_date,
    'first_race_utc', rd.first_race_utc,
    'races', rd.races
  ) order by rd.competition_id, rd.race_date), '[]'::jsonb) into v_race_days
  from public.race_days rd
  where rd.competition_id in (
    select competition_id from public.competition_participants where user_id = v_user_id
  );

  -- Current daily selections for this user
  select coalesce(jsonb_agg(jsonb_build_object(
    'competition_id', ds.competition_id,
    'race_date', ds.race_date,
    'selections', ds.selections
  )), '[]'::jsonb) into v_selections
  from public.daily_selections ds
  where ds.user_id = v_user_id;

  return jsonb_build_object(
    'user_id', v_user_id,
    'competitions', v_comps,
    'race_days', v_race_days,
    'selections', v_selections
  );
end;
$$;

-- RPC: tablet mode – submit selections (anon can call; writes only if code valid)
create or replace function public.tablet_submit_selections(
  p_code text,
  p_competition_id uuid,
  p_race_date date,
  p_selections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if length(trim(p_code)) <> 6 then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  select user_id into v_user_id
  from public.user_tablet_codes
  where code = trim(p_code);

  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  -- Ensure user is in this competition
  if not exists (
    select 1 from public.competition_participants
    where user_id = v_user_id and competition_id = p_competition_id
  ) then
    return jsonb_build_object('success', false, 'error', 'not_participant');
  end if;

  insert into public.daily_selections (competition_id, user_id, race_date, selections, updated_at)
  values (p_competition_id, v_user_id, p_race_date, p_selections, now())
  on conflict (competition_id, user_id, race_date)
  do update set selections = p_selections, updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

-- Allow anon to call these RPCs (they are security definer and validate code inside)
grant execute on function public.tablet_get_data(text) to anon;
grant execute on function public.tablet_submit_selections(text, uuid, date, jsonb) to anon;
