-- Drop every push subscription for the signed-in user (sign out of all devices).

create or replace function public.web_push_unbind_all_devices()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n int;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  delete from public.web_push_subscriptions
  where user_id = v_uid;
  get diagnostics v_n = row_count;

  return jsonb_build_object('success', true, 'removed', v_n);
end;
$$;

revoke all on function public.web_push_unbind_all_devices() from public;
grant execute on function public.web_push_unbind_all_devices() to authenticated;
