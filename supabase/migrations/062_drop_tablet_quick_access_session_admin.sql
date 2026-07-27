-- Remove Quick Access (tablet mode) and gate admin RPCs on the signed-in Admin session.
-- Legacy p_code args on admin RPCs are ignored; auth.uid() + profiles.role = 'Admin' is required.

create or replace function public.tablet_code_admin_user_id(p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- p_code retained for call-site compatibility; no longer used.
  if v_uid is null then
    return null;
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id = v_uid and p.role = 'Admin'
  ) then
    return v_uid;
  end if;
  return null;
end;
$$;

revoke all on function public.tablet_code_admin_user_id(text) from public;
revoke all on function public.tablet_code_admin_user_id(text) from anon;
grant execute on function public.tablet_code_admin_user_id(text) to authenticated;

-- Quick-access RPCs (no longer used by the app)
drop function if exists public.tablet_get_data(text);
drop function if exists public.tablet_submit_selections(text, uuid, date, jsonb);

-- Quick-access codes table
drop table if exists public.user_tablet_codes cascade;
