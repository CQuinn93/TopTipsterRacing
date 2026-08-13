-- =============================================================================
-- Bind a device push endpoint to the current user without wiping other devices.
-- Unique on endpoint: one phone → one account at a time; many phones per account.
-- =============================================================================

create or replace function public.web_push_bind_device(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;
  if p_endpoint is null or length(trim(p_endpoint)) < 8 then
    return jsonb_build_object('success', false, 'error', 'invalid_endpoint');
  end if;
  if p_p256dh is null or p_auth is null then
    return jsonb_build_object('success', false, 'error', 'invalid_keys');
  end if;

  insert into public.web_push_subscriptions (
    user_id, endpoint, p256dh, auth, user_agent, updated_at
  ) values (
    v_uid, trim(p_endpoint), p_p256dh, p_auth, p_user_agent, now()
  )
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        updated_at = now();

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.web_push_bind_device(text, text, text, text) from public;
grant execute on function public.web_push_bind_device(text, text, text, text) to authenticated;

-- Drop this device's row (logout / toggle off). Only the endpoint the client holds.
create or replace function public.web_push_unbind_device(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;
  if p_endpoint is null or length(trim(p_endpoint)) < 8 then
    return jsonb_build_object('success', false, 'error', 'invalid_endpoint');
  end if;

  delete from public.web_push_subscriptions
  where endpoint = trim(p_endpoint)
    and user_id = v_uid;

  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.web_push_unbind_device(text) from public;
grant execute on function public.web_push_unbind_device(text) to authenticated;
