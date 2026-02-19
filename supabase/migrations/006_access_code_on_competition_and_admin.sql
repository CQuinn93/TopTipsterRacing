-- 1) Add access_code to competitions (one code per competition; unique so we can look up by code)
alter table public.competitions
  add column if not exists access_code char(6) unique;

comment on column public.competitions.access_code is 'Single access code for this competition; users enter it to request to join (admin approves).';

-- 2) Join requests: users submit a request; admin approves or rejects
create table if not exists public.competition_join_requests (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null,
  display_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique(competition_id, user_id)
);

create index if not exists idx_join_requests_status on public.competition_join_requests(status);
create index if not exists idx_join_requests_competition on public.competition_join_requests(competition_id);

alter table public.competition_join_requests enable row level security;

-- Users can insert their own request and update it (e.g. resubmit with new display name)
create policy "Join requests insert own" on public.competition_join_requests
  for insert with check (auth.uid() = user_id);
create policy "Join requests update own" on public.competition_join_requests
  for update using (auth.uid() = user_id);

-- 3) Drop old access_codes table (replaced by competitions.access_code)
drop table if exists public.access_codes;

-- 4) Admin RPCs (accessed with code 777777 from tablet mode)
-- List pending join requests (admin code required)
create or replace function public.admin_list_pending(p_admin_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(p_admin_code) <> '777777' then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'competition_id', r.competition_id,
      'competition_name', c.name,
      'user_id', r.user_id,
      'display_name', r.display_name,
      'created_at', r.created_at
    ) order by r.created_at desc), '[]'::jsonb)
    from competition_join_requests r
    join competitions c on c.id = r.competition_id
    where r.status = 'pending'
  );
end;
$$;

-- Approve: add to participants, mark request approved
create or replace function public.admin_approve_request(p_admin_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req competition_join_requests%rowtype;
begin
  if trim(p_admin_code) <> '777777' then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  select * into v_req from competition_join_requests where id = p_request_id and status = 'pending';
  if v_req.id is null then
    return jsonb_build_object('success', false, 'error', 'request_not_found');
  end if;
  insert into competition_participants (competition_id, user_id, display_name)
  values (v_req.competition_id, v_req.user_id, v_req.display_name)
  on conflict (competition_id, user_id) do update set display_name = excluded.display_name;
  update competition_join_requests set status = 'approved', reviewed_at = now() where id = p_request_id;
  return jsonb_build_object('success', true);
end;
$$;

-- Reject: mark request rejected
create or replace function public.admin_reject_request(p_admin_code text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(p_admin_code) <> '777777' then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  update competition_join_requests set status = 'rejected', reviewed_at = now() where id = p_request_id and status = 'pending';
  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.admin_list_pending(text) to anon, authenticated;
grant execute on function public.admin_approve_request(text, uuid) to anon, authenticated;
grant execute on function public.admin_reject_request(text, uuid) to anon, authenticated;
