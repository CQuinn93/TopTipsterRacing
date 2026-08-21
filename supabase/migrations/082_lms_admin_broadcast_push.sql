-- =============================================================================
-- LMS: creator/Owner can broadcast a custom Web Push to competition players.
-- Competition managers cannot send broadcasts (same gate as remove player).
-- =============================================================================

create table if not exists public.lms_competition_broadcasts (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.lms_competitions (id) on delete cascade,
  sent_by uuid references auth.users (id) on delete set null,
  title text not null,
  body text not null,
  recipient_count int not null default 0,
  sent_at timestamptz not null default now()
);

create index if not exists lms_competition_broadcasts_comp_sent_idx
  on public.lms_competition_broadcasts (competition_id, sent_at desc);

alter table public.lms_competition_broadcasts enable row level security;

comment on table public.lms_competition_broadcasts is
  'Audit log for creator/Owner custom Web Push broadcasts to LMS competition players.';

-- Authorize + rate-limit; return participant user ids for the Edge Function to push.
create or replace function public.lms_admin_authorize_broadcast(
  p_competition_id uuid,
  p_title text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_name text;
  v_broadcast_id uuid;
  v_user_ids uuid[];
  v_recent int;
  v_day_count int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select c.name into v_name
  from public.lms_competitions c
  where c.id = p_competition_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  if length(v_title) < 1 or length(v_title) > 80 then
    return jsonb_build_object('success', false, 'error', 'invalid_title');
  end if;

  if length(v_body) < 1 or length(v_body) > 280 then
    return jsonb_build_object('success', false, 'error', 'invalid_body');
  end if;

  select count(*)::int into v_recent
  from public.lms_competition_broadcasts b
  where b.competition_id = p_competition_id
    and b.sent_at > now() - interval '3 minutes';

  if v_recent > 0 then
    return jsonb_build_object('success', false, 'error', 'rate_limited');
  end if;

  select count(*)::int into v_day_count
  from public.lms_competition_broadcasts b
  where b.competition_id = p_competition_id
    and b.sent_at > now() - interval '24 hours';

  if v_day_count >= 20 then
    return jsonb_build_object('success', false, 'error', 'daily_limit');
  end if;

  select coalesce(array_agg(part.user_id), '{}'::uuid[])
  into v_user_ids
  from public.lms_participants part
  where part.competition_id = p_competition_id;

  insert into public.lms_competition_broadcasts (
    competition_id, sent_by, title, body, recipient_count
  )
  values (
    p_competition_id, v_uid, v_title, v_body, coalesce(cardinality(v_user_ids), 0)
  )
  returning id into v_broadcast_id;

  return jsonb_build_object(
    'success', true,
    'broadcast_id', v_broadcast_id,
    'competition_id', p_competition_id,
    'competition_name', v_name,
    'title', v_title,
    'body', v_body,
    'user_ids', to_jsonb(coalesce(v_user_ids, '{}'::uuid[])),
    'recipient_count', coalesce(cardinality(v_user_ids), 0)
  );
end;
$$;

revoke all on function public.lms_admin_authorize_broadcast(uuid, text, text) from public;
grant execute on function public.lms_admin_authorize_broadcast(uuid, text, text) to authenticated;

comment on function public.lms_admin_authorize_broadcast(uuid, text, text) is
  'Creator/Owner authorizes a competition Web Push broadcast (rate-limited). Returns participant user ids for the Edge Function.';
