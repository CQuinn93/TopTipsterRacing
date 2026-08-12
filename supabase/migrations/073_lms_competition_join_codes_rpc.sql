-- =============================================================================
-- Let competition managers read join / rejoin codes for their league.
-- =============================================================================

create or replace function public.lms_get_competition_join_codes(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_join text;
  v_rejoin text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if not exists (select 1 from public.lms_competitions c where c.id = p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  select ac.code into v_join
  from public.lms_access_codes ac
  where ac.competition_id = p_competition_id
    and ac.type = 'join'
    and ac.is_active = true
  order by ac.created_at asc
  limit 1;

  select ac.code into v_rejoin
  from public.lms_access_codes ac
  where ac.competition_id = p_competition_id
    and ac.type = 'rejoin'
    and ac.is_active = true
  order by ac.created_at desc
  limit 1;

  return jsonb_build_object(
    'success', true,
    'join_code', v_join,
    'active_rejoin_code', v_rejoin
  );
end;
$$;

revoke all on function public.lms_get_competition_join_codes(uuid) from public;
grant execute on function public.lms_get_competition_join_codes(uuid) to authenticated;
