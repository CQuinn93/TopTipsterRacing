-- =============================================================================
-- Web Push subscriptions + LMS pick-deadline reminder listing (with auto-assign
-- team preview) and send-dedupe log.
-- =============================================================================

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_push_subscriptions_endpoint_key unique (endpoint)
);

create index if not exists web_push_subscriptions_user_id_idx
  on public.web_push_subscriptions (user_id);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "web_push_subscriptions_select_own" on public.web_push_subscriptions;
create policy "web_push_subscriptions_select_own"
  on public.web_push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "web_push_subscriptions_insert_own" on public.web_push_subscriptions;
create policy "web_push_subscriptions_insert_own"
  on public.web_push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "web_push_subscriptions_update_own" on public.web_push_subscriptions;
create policy "web_push_subscriptions_update_own"
  on public.web_push_subscriptions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "web_push_subscriptions_delete_own" on public.web_push_subscriptions;
create policy "web_push_subscriptions_delete_own"
  on public.web_push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- Dedupe: one row per user/competition/gameweek/window ('2h' | '30m')
create table if not exists public.lms_pick_reminder_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  competition_id uuid not null references public.lms_competitions (id) on delete cascade,
  gameweek_id uuid not null references public.lms_gameweeks (id) on delete cascade,
  reminder_window text not null check (reminder_window in ('2h', '30m')),
  sent_at timestamptz not null default now(),
  constraint lms_pick_reminder_sent_unique
    unique (user_id, competition_id, gameweek_id, reminder_window)
);

create index if not exists lms_pick_reminder_sent_gw_idx
  on public.lms_pick_reminder_sent (gameweek_id);

alter table public.lms_pick_reminder_sent enable row level security;
-- No policies for authenticated: service role only writes/reads this table.

comment on table public.web_push_subscriptions is
  'Browser Web Push subscriptions for Home Screen / PWA notifications.';
comment on table public.lms_pick_reminder_sent is
  'Dedupe log for LMS deadline web-push reminders (service role only).';

-- -----------------------------------------------------------------------------
-- List users who need a deadline reminder now (service role / security definer).
-- Windows (relative to deadline_at):
--   2h  → deadline between now + 1h45m and now + 2h15m
--   30m → deadline between now + 15m and now + 45m
-- Predicted team matches lms_auto_assign_missed_picks (A–Z first unused pool team
-- playing a non-excluded fixture this GW).
-- -----------------------------------------------------------------------------
create or replace function public.lms_list_deadline_reminders()
returns table (
  user_id uuid,
  competition_id uuid,
  competition_name text,
  gameweek_id uuid,
  gameweek_number int,
  deadline_at timestamptz,
  predicted_team_name text,
  reminder_window text,
  endpoint text,
  p256dh text,
  auth text
)
language sql
security definer
set search_path = public
stable
as $$
  with windows as (
    select '2h'::text as reminder_window,
           now() + interval '1 hour 45 minutes' as win_start,
           now() + interval '2 hours 15 minutes' as win_end
    union all
    select '30m'::text,
           now() + interval '15 minutes',
           now() + interval '45 minutes'
  ),
  due_gameweeks as (
    select gw.*, w.reminder_window
    from windows w
    join public.lms_gameweeks gw
      on gw.deadline_at >= w.win_start
     and gw.deadline_at < w.win_end
    where gw.status is distinct from 'complete'
  ),
  candidates as (
    select
      p.user_id,
      p.competition_id,
      c.name as competition_name,
      gw.id as gameweek_id,
      gw.number as gameweek_number,
      gw.deadline_at,
      gw.reminder_window,
      (
        select t.name
        from public.lms_teams t
        where exists (
          select 1 from public.lms_competition_teams ct
          where ct.competition_id = p.competition_id and ct.team_id = t.id
        )
        and exists (
          select 1 from public.lms_fixtures f
          where f.gameweek_id = gw.id
            and coalesce(f.excluded_from_lms, false) = false
            and (f.home_team_id = t.id or f.away_team_id = t.id)
        )
        and not exists (
          select 1 from public.lms_used_teams u
          where u.competition_id = p.competition_id
            and u.user_id = p.user_id
            and u.team_id = t.id
        )
        order by lower(t.name) asc
        limit 1
      ) as predicted_team_name
    from due_gameweeks gw
    join public.lms_participants p on true
    join public.lms_competitions c on c.id = p.competition_id
    left join public.lms_gameweeks sg on sg.id = c.start_gameweek_id
    where p.status = 'active'
      and c.status in ('open', 'active')
      and c.season = gw.season
      and (
        c.start_gameweek_id is null
        or (sg.season = gw.season and sg.number <= gw.number)
      )
      and not exists (
        select 1 from public.lms_picks pk
        where pk.competition_id = p.competition_id
          and pk.user_id = p.user_id
          and pk.gameweek_id = gw.id
      )
      and not exists (
        select 1 from public.lms_pick_reminder_sent s
        where s.user_id = p.user_id
          and s.competition_id = p.competition_id
          and s.gameweek_id = gw.id
          and s.reminder_window = gw.reminder_window
      )
  )
  select
    cand.user_id,
    cand.competition_id,
    cand.competition_name,
    cand.gameweek_id,
    cand.gameweek_number,
    cand.deadline_at,
    cand.predicted_team_name,
    cand.reminder_window,
    sub.endpoint,
    sub.p256dh,
    sub.auth
  from candidates cand
  join public.web_push_subscriptions sub on sub.user_id = cand.user_id
  where cand.predicted_team_name is not null;
$$;

revoke all on function public.lms_list_deadline_reminders() from public;
revoke all on function public.lms_list_deadline_reminders() from authenticated;
grant execute on function public.lms_list_deadline_reminders() to service_role;

-- Mark a reminder as sent (service role)
create or replace function public.lms_mark_deadline_reminder_sent(
  p_user_id uuid,
  p_competition_id uuid,
  p_gameweek_id uuid,
  p_reminder_window text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_reminder_window not in ('2h', '30m') then
    raise exception 'invalid_reminder_window';
  end if;
  insert into public.lms_pick_reminder_sent (
    user_id, competition_id, gameweek_id, reminder_window
  ) values (
    p_user_id, p_competition_id, p_gameweek_id, p_reminder_window
  )
  on conflict (user_id, competition_id, gameweek_id, reminder_window) do nothing;
end;
$$;

revoke all on function public.lms_mark_deadline_reminder_sent(uuid, uuid, uuid, text) from public;
revoke all on function public.lms_mark_deadline_reminder_sent(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.lms_mark_deadline_reminder_sent(uuid, uuid, uuid, text) to service_role;
