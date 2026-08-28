-- Hub game mode visibility (Owner-controlled). All modes remain accessible to Owner.
insert into public.app_config (key, value)
values (
  'hub_game_modes',
  '{"lms": true, "f2t": false, "f2t6": false, "racing": false}'::jsonb
)
on conflict (key) do nothing;

create or replace function public.get_hub_game_modes()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_config where key = 'hub_game_modes'),
    '{"lms": true, "f2t": false, "f2t6": false, "racing": false}'::jsonb
  );
$$;

revoke all on function public.get_hub_game_modes() from public;
grant execute on function public.get_hub_game_modes() to authenticated;
grant execute on function public.get_hub_game_modes() to anon;

create or replace function public.owner_set_hub_game_modes(p_modes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merged jsonb;
begin
  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_modes is null or jsonb_typeof(p_modes) <> 'object' then
    return jsonb_build_object('success', false, 'error', 'invalid_modes');
  end if;

  v_merged := jsonb_build_object(
    'lms', coalesce((p_modes->>'lms')::boolean, false),
    'f2t', coalesce((p_modes->>'f2t')::boolean, false),
    'f2t6', coalesce((p_modes->>'f2t6')::boolean, false),
    'racing', coalesce((p_modes->>'racing')::boolean, false)
  );

  insert into public.app_config (key, value, updated_at)
  values ('hub_game_modes', v_merged, now())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at;

  return jsonb_build_object('success', true, 'modes', v_merged);
end;
$$;

revoke all on function public.owner_set_hub_game_modes(jsonb) from public;
grant execute on function public.owner_set_hub_game_modes(jsonb) to authenticated;
