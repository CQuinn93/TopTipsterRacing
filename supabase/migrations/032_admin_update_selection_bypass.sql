-- Allow admin to update selections even after the deadline (same bypass as backfill / non-runner RPC).
create or replace function public.admin_update_selection(
  p_admin_code text,
  p_selection_id uuid,
  p_selections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(p_admin_code) <> '777777' then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  perform set_config('app.allow_backfill', 'true', true);

  update public.daily_selections
  set selections = p_selections, updated_at = now()
  where id = p_selection_id;

  perform set_config('app.allow_backfill', '', true);

  if not found then
    return jsonb_build_object('success', false, 'error', 'selection_not_found');
  end if;
  return jsonb_build_object('success', true);
end;
$$;

comment on function public.admin_update_selection(text, uuid, jsonb) is
  'Admin can edit any user selection. Uses app.allow_backfill to bypass selections lock.';
