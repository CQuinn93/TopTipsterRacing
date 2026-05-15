-- Ante-post submission lock + admin reopen / override (migration 050).

create table if not exists wc2026.ante_post_submissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  submitted_at timestamptz,
  admin_reopened boolean not null default false,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id),
  reopen_note text,
  updated_at timestamptz not null default now()
);

alter table wc2026.ante_post_submissions enable row level security;

drop policy if exists "wc2026_read_own_ante_post_submission" on wc2026.ante_post_submissions;
create policy "wc2026_read_own_ante_post_submission" on wc2026.ante_post_submissions
  for select to authenticated
  using (auth.uid() = user_id);

-- Backfill submitted_at from existing final (match 104) ante-post picks.
insert into wc2026.ante_post_submissions (user_id, submitted_at, updated_at)
select
  pr.user_id,
  max(pr.updated_at),
  now()
from wc2026.predictions pr
where pr.prediction_type = 'ante_post'
  and pr.match_number = 104
  and pr.home_score is not null
  and pr.away_score is not null
group by pr.user_id
on conflict (user_id) do update
set submitted_at = coalesce(wc2026.ante_post_submissions.submitted_at, excluded.submitted_at),
    updated_at = now();

create or replace function public.wc_ante_post_lock_status(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
stable
as $$
declare
  v_caller uuid := auth.uid();
  v_uid uuid := coalesce(p_user_id, v_caller);
  v_submitted_at timestamptz;
  v_admin_reopened boolean := false;
  v_legacy_submitted timestamptz;
begin
  if v_caller is null or v_uid is null then
    return jsonb_build_object('locked', false, 'submitted', false, 'admin_reopened', false);
  end if;

  if v_uid <> v_caller
     and not exists (select 1 from public.profiles where id = v_caller and role = 'Admin') then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select s.submitted_at, s.admin_reopened
  into v_submitted_at, v_admin_reopened
  from wc2026.ante_post_submissions s
  where s.user_id = v_uid;

  if v_submitted_at is null then
    select max(pr.updated_at)
    into v_legacy_submitted
    from wc2026.predictions pr
    where pr.user_id = v_uid
      and pr.prediction_type = 'ante_post'
      and pr.match_number = 104
      and pr.home_score is not null
      and pr.away_score is not null;

    if v_legacy_submitted is not null then
      insert into wc2026.ante_post_submissions (user_id, submitted_at, updated_at)
      values (v_uid, v_legacy_submitted, now())
      on conflict (user_id) do update
      set submitted_at = coalesce(wc2026.ante_post_submissions.submitted_at, excluded.submitted_at),
          updated_at = now();
      v_submitted_at := v_legacy_submitted;
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'locked', v_submitted_at is not null and not coalesce(v_admin_reopened, false),
    'submitted', v_submitted_at is not null,
    'admin_reopened', coalesce(v_admin_reopened, false),
    'submitted_at', v_submitted_at
  );
end;
$$;

create or replace function public.wc_ante_post_mark_submitted()
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

  insert into wc2026.ante_post_submissions (user_id, submitted_at, admin_reopened, reopened_at, reopened_by, reopen_note, updated_at)
  values (v_uid, now(), false, null, null, null, now())
  on conflict (user_id) do update
  set submitted_at = now(),
      admin_reopened = false,
      reopened_at = null,
      reopened_by = null,
      reopen_note = null,
      updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.wc_admin_list_ante_post_entrants(
  p_competition_id uuid,
  p_search text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_q text := lower(trim(coalesce(p_search, '')));
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'Admin') then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(elem order by (elem->>'username'))
      from (
        select jsonb_build_object(
          'user_id', p.user_id,
          'username', coalesce(pr.username, 'Unknown'),
          'ante_prediction_count', coalesce(cnt.n, 0),
          'submitted', s.submitted_at is not null,
          'submitted_at', s.submitted_at,
          'admin_reopened', coalesce(s.admin_reopened, false),
          'locked', s.submitted_at is not null and not coalesce(s.admin_reopened, false),
          'reopen_note', s.reopen_note
        ) as elem
        from wc2026.football_competition_participants p
        join public.profiles pr on pr.id = p.user_id
        left join wc2026.ante_post_submissions s on s.user_id = p.user_id
        left join lateral (
          select count(*)::int as n
          from wc2026.predictions pred
          where pred.user_id = p.user_id
            and pred.prediction_type = 'ante_post'
        ) cnt on true
        where p.competition_id = p_competition_id
          and (
            v_q = ''
            or lower(pr.username) like '%' || v_q || '%'
          )
      ) rows
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.wc_admin_set_ante_post_reopen(
  p_target_user_id uuid,
  p_reopen boolean,
  p_note text default null
)
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
  if p_target_user_id is null then
    return jsonb_build_object('success', false, 'error', 'missing_user');
  end if;

  if p_reopen then
    insert into wc2026.ante_post_submissions (user_id, admin_reopened, reopened_at, reopened_by, reopen_note, updated_at)
    values (p_target_user_id, true, now(), v_uid, nullif(trim(p_note), ''), now())
    on conflict (user_id) do update
    set admin_reopened = true,
        reopened_at = now(),
        reopened_by = v_uid,
        reopen_note = nullif(trim(p_note), ''),
        updated_at = now();
  else
    update wc2026.ante_post_submissions
    set admin_reopened = false,
        reopen_note = null,
        updated_at = now()
    where user_id = p_target_user_id;

    if not found then
      insert into wc2026.ante_post_submissions (user_id, admin_reopened, updated_at)
      values (p_target_user_id, false, now())
      on conflict (user_id) do update
      set admin_reopened = false,
          reopen_note = null,
          updated_at = now();
    end if;
  end if;

  return jsonb_build_object('success', true, 'admin_reopened', p_reopen);
end;
$$;

create or replace function public.wc_admin_upsert_ante_post_prediction(
  p_target_user_id uuid,
  p_match_number int,
  p_home_score int,
  p_away_score int,
  p_predicted_winner_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
as $$
declare
  v_uid uuid := auth.uid();
  v_match_id uuid;
  v_winner uuid;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and role = 'Admin') then
    return jsonb_build_object('success', false, 'error', 'not_admin');
  end if;
  if p_target_user_id is null or p_match_number is null then
    return jsonb_build_object('success', false, 'error', 'invalid_args');
  end if;

  select m.id into v_match_id
  from wc2026.matches m
  where m.match_number = p_match_number;

  if v_match_id is null then
    return jsonb_build_object('success', false, 'error', 'unknown_match');
  end if;

  v_winner := p_predicted_winner_id;
  if v_winner is null and p_home_score is not null and p_away_score is not null then
    if p_home_score > p_away_score then
      select home_team_id into v_winner from wc2026.matches where id = v_match_id;
    elsif p_away_score > p_home_score then
      select away_team_id into v_winner from wc2026.matches where id = v_match_id;
    end if;
  end if;

  insert into wc2026.predictions (
    user_id,
    match_id,
    match_number,
    prediction_type,
    home_score,
    away_score,
    predicted_winner_id,
    updated_at
  )
  values (
    p_target_user_id,
    v_match_id,
    p_match_number,
    'ante_post',
    p_home_score,
    p_away_score,
    v_winner,
    now()
  )
  on conflict (user_id, match_number, prediction_type) do update
  set match_id = excluded.match_id,
      home_score = excluded.home_score,
      away_score = excluded.away_score,
      predicted_winner_id = excluded.predicted_winner_id,
      updated_at = now();

  return jsonb_build_object('success', true, 'match_number', p_match_number);
end;
$$;

grant execute on function public.wc_ante_post_lock_status(uuid) to authenticated;
grant execute on function public.wc_ante_post_mark_submitted() to authenticated;
grant execute on function public.wc_admin_list_ante_post_entrants(uuid, text) to authenticated;
grant execute on function public.wc_admin_set_ante_post_reopen(uuid, boolean, text) to authenticated;
grant execute on function public.wc_admin_upsert_ante_post_prediction(uuid, int, int, int, uuid) to authenticated;
