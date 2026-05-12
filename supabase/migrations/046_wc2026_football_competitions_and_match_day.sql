-- WC2026: football competitions (many per tournament), single entry per user per competition,
-- tournament flags for gating, live prediction columns for Match Day Tips.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists wc2026.football_competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  access_code char(6) not null unique,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table wc2026.football_competitions is 'World Cup football mini-leagues; one access code per competition.';

create table if not exists wc2026.football_competition_participants (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references wc2026.football_competitions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (competition_id, user_id)
);

create index if not exists idx_wc_football_participants_user on wc2026.football_competition_participants (user_id);
create index if not exists idx_wc_football_participants_comp on wc2026.football_competition_participants (competition_id);

create table if not exists wc2026.tournament_flags (
  flag_key text primary key,
  flag_value boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into wc2026.tournament_flags (flag_key, flag_value)
values
  ('knockout_ante_enabled', false),
  ('match_day_tips_unlocked', false)
on conflict (flag_key) do nothing;

-- Live / Match Day Tips fields (1X2, total goals in 90m, both teams to score)
alter table wc2026.predictions
  add column if not exists live_outcome text,
  add column if not exists live_total_goals int,
  add column if not exists live_btts boolean;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'wc2026' and t.relname = 'predictions' and c.conname = 'predictions_live_outcome_chk'
  ) then
    alter table wc2026.predictions
      add constraint predictions_live_outcome_chk
      check (live_outcome is null or live_outcome in ('H', 'D', 'A'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table wc2026.football_competitions enable row level security;
alter table wc2026.football_competition_participants enable row level security;
alter table wc2026.tournament_flags enable row level security;

drop policy if exists "wc_football_competitions_select" on wc2026.football_competitions;
create policy "wc_football_competitions_select"
  on wc2026.football_competitions
  for select
  to authenticated
  using (
    exists (
      select 1
      from wc2026.football_competition_participants p
      where p.competition_id = football_competitions.id
        and p.user_id = auth.uid()
    )
    or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'Admin')
  );

drop policy if exists "wc_football_participants_select_own" on wc2026.football_competition_participants;
create policy "wc_football_participants_select_own"
  on wc2026.football_competition_participants
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "wc_tournament_flags_read" on wc2026.tournament_flags;
create policy "wc_tournament_flags_read"
  on wc2026.tournament_flags
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- RPCs (public schema — call with root Supabase client)
-- ---------------------------------------------------------------------------

create or replace function public.wc_football_create_competition(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_id uuid;
  n int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'Admin') then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;
  if trim(coalesce(p_name, '')) = '' then
    return jsonb_build_object('success', false, 'error', 'empty_name');
  end if;

  for n in 1..30 loop
    v_code := upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));
    exit when not exists (select 1 from wc2026.football_competitions fc where fc.access_code = v_code);
  end loop;

  insert into wc2026.football_competitions (name, access_code, created_by)
  values (trim(p_name), v_code, v_uid)
  returning id into v_id;

  return jsonb_build_object('success', true, 'id', v_id, 'access_code', v_code, 'name', trim(p_name));
exception when unique_violation then
  return jsonb_build_object('success', false, 'error', 'code_collision');
end;
$$;

create or replace function public.wc_football_join_competition(p_access_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
as $$
declare
  v_uid uuid := auth.uid();
  v_comp wc2026.football_competitions%rowtype;
  v_norm text := upper(trim(coalesce(p_access_code, '')));
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;
  if length(v_norm) <> 6 then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_comp from wc2026.football_competitions where access_code = v_norm;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  insert into wc2026.football_competition_participants (competition_id, user_id)
  values (v_comp.id, v_uid)
  on conflict (competition_id, user_id) do nothing;

  return jsonb_build_object('success', true, 'competition_id', v_comp.id, 'name', v_comp.name);
end;
$$;

create or replace function public.wc_football_list_my_competitions()
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  return coalesce(
    (
      select jsonb_agg(x.obj order by x.sort_key desc)
      from (
        select
          jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'access_code', c.access_code,
            'joined_at', p.joined_at
          ) as obj,
          p.joined_at as sort_key
        from wc2026.football_competition_participants p
        join wc2026.football_competitions c on c.id = p.competition_id
        where p.user_id = v_uid
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.wc_football_list_participants(p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  if not exists (
    select 1 from wc2026.football_competition_participants me
    where me.competition_id = p_competition_id and me.user_id = v_uid
  )
  and not exists (select 1 from public.profiles where id = v_uid and role = 'Admin') then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(x.obj order by x.sort_key asc)
      from (
        select
          jsonb_build_object('user_id', p.user_id, 'joined_at', p.joined_at) as obj,
          p.joined_at as sort_key
        from wc2026.football_competition_participants p
        where p.competition_id = p_competition_id
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.wc_football_leaderboard(p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  if not exists (
    select 1 from wc2026.football_competition_participants me
    where me.competition_id = p_competition_id and me.user_id = v_uid
  )
  and not exists (select 1 from public.profiles where id = v_uid and role = 'Admin') then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(jsonb_build_object(
          'user_id', s.user_id,
          'total_points', s.total_points
        ))
      from (
        select
          p.user_id,
          coalesce(sum(pr.points_awarded), 0)::bigint as total_points
        from wc2026.football_competition_participants p
        left join wc2026.predictions pr on pr.user_id = p.user_id
        where p.competition_id = p_competition_id
        group by p.user_id
      ) s
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.wc_admin_set_tournament_flag(p_flag_key text, p_value boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'Admin') then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;

  update wc2026.tournament_flags
  set flag_value = p_value, updated_at = now()
  where flag_key = p_flag_key;

  if not found then
    return jsonb_build_object('success', false, 'error', 'unknown_flag');
  end if;

  return jsonb_build_object('success', true, 'flag_key', p_flag_key, 'flag_value', p_value);
end;
$$;

create or replace function public.wc_football_list_admin_competitions()
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'Admin') then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'access_code', c.access_code,
          'created_at', c.created_at,
          'created_by', c.created_by
        ))
      from wc2026.football_competitions c
    ),
    '[]'::jsonb
  );
end;
$$;

grant execute on function public.wc_football_create_competition(text) to authenticated;
grant execute on function public.wc_football_join_competition(text) to authenticated;
grant execute on function public.wc_football_list_my_competitions() to authenticated;
grant execute on function public.wc_football_list_participants(uuid) to authenticated;
grant execute on function public.wc_football_leaderboard(uuid) to authenticated;
grant execute on function public.wc_football_list_admin_competitions() to authenticated;
grant execute on function public.wc_admin_set_tournament_flag(text, boolean) to authenticated;
