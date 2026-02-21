-- RPC for user to lock in selections early (so they can view others' picks before deadline).
create or replace function public.lock_selections(
  p_competition_id uuid,
  p_race_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.daily_selections
  set locked_at = now(), updated_at = now()
  where competition_id = p_competition_id
    and race_date = p_race_date
    and user_id = auth.uid()
    and locked_at is null;

  if not found then
    return jsonb_build_object('success', false, 'error', 'selection_not_found_or_already_locked');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.lock_selections(uuid, date) to authenticated;
