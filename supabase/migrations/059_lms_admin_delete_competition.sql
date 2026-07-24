-- =============================================================================
-- LMS: profile-admin delete competition
-- =============================================================================

create or replace function public.lms_admin_delete_competition(p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.lms_is_profile_admin() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select name into v_name from public.lms_competitions where id = p_competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  -- Child rows cascade (participants, picks, used_teams, access_codes, join requests, pool)
  delete from public.lms_competitions where id = p_competition_id;

  return jsonb_build_object('success', true, 'name', v_name);
end;
$$;

revoke all on function public.lms_admin_delete_competition(uuid) from public;
grant execute on function public.lms_admin_delete_competition(uuid) to authenticated;
