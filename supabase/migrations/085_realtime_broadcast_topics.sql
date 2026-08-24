-- =============================================================================
-- Realtime: Broadcast from DB (no table replication / compute upgrade)
-- =============================================================================
-- Replaces Postgres Changes (Database → Replication) for:
--   - public.lms_fixtures  → topic "lms_fixtures"
--   - public.races         → topic "races"
--
-- Clients subscribe with private Broadcast channels + supabase.realtime.setAuth().
-- Authenticated users may SELECT (receive) on those topics via realtime.messages RLS.
-- =============================================================================

-- Allow signed-in clients to receive Broadcast on our app topics
drop policy if exists "authenticated can receive app broadcasts" on realtime.messages;
create policy "authenticated can receive app broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() in ('lms_fixtures', 'races')
);

-- -----------------------------------------------------------------------------
-- lms_fixtures → topic "lms_fixtures"
-- -----------------------------------------------------------------------------
create or replace function public.lms_fixtures_broadcast_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'lms_fixtures',
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists lms_fixtures_broadcast_changes_trigger on public.lms_fixtures;
create trigger lms_fixtures_broadcast_changes_trigger
after update on public.lms_fixtures
for each row
execute function public.lms_fixtures_broadcast_changes();

comment on function public.lms_fixtures_broadcast_changes() is
  'Broadcasts lms_fixtures UPDATEs on private topic lms_fixtures (Realtime Broadcast from DB).';

-- -----------------------------------------------------------------------------
-- races → topic "races"
-- -----------------------------------------------------------------------------
create or replace function public.races_broadcast_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'races',
    tg_op,
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

drop trigger if exists races_broadcast_changes_trigger on public.races;
create trigger races_broadcast_changes_trigger
after update on public.races
for each row
execute function public.races_broadcast_changes();

comment on function public.races_broadcast_changes() is
  'Broadcasts races UPDATEs on private topic races (Realtime Broadcast from DB).';
