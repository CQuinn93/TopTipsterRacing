-- RPC: replace user selections that picked a non-runner with FAV for a given race.
-- Uses app.allow_backfill so the "selections locked" trigger allows the update (same bypass as backfill).
-- Called by update-race-results script after it has updated horses.non_runner from the API.

create or replace function public.replace_non_runner_selections_with_fav(p_race_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_race_day_id uuid;
  v_api_race_id text;
  v_race_date date;
  v_nr_api_ids text[];
  v_nr_names text[];
  v_comp_ids uuid[];
  v_row record;
  v_selections jsonb;
  v_race_sel jsonb;
  v_runner_id text;
  v_runner_name text;
  v_is_nr boolean;
  v_new_sel jsonb;
  v_fav jsonb := '{"runnerId":"FAV","runnerName":"FAV","oddsDecimal":0}'::jsonb;
  v_updated int := 0;
begin
  select race_day_id, api_race_id into v_race_day_id, v_api_race_id
  from public.races where id = p_race_id;
  if v_race_day_id is null or v_api_race_id is null then
    return 0;
  end if;

  select race_date into v_race_date from public.race_days where id = v_race_day_id;
  if v_race_date is null then
    return 0;
  end if;

  select array_agg(trim(api_horse_id)), array_agg(trim(lower(name)))
  into v_nr_api_ids, v_nr_names
  from public.horses
  where race_id = p_race_id and non_runner = '1' and api_horse_id is not null and name is not null;

  if v_nr_api_ids is null and v_nr_names is null then
    return 0;
  end if;

  select array_agg(distinct competition_id) into v_comp_ids
  from public.competition_race_days where race_day_id = v_race_day_id;
  if v_comp_ids is null then
    return 0;
  end if;

  perform set_config('app.allow_backfill', 'true', true);

  for v_row in
    select id, selections
    from public.daily_selections
    where race_date = v_race_date and competition_id = any(v_comp_ids)
  loop
    v_selections := coalesce(v_row.selections, '{}'::jsonb);
    v_race_sel := v_selections -> v_api_race_id;
    if v_race_sel is null or v_race_sel = 'null'::jsonb then
      continue;
    end if;
    v_runner_id := trim(coalesce(v_race_sel->>'runnerId', ''));
    v_runner_name := trim(lower(coalesce(v_race_sel->>'runnerName', '')));
    v_is_nr := false;
    if v_runner_id <> '' and v_nr_api_ids is not null and v_runner_id = any(v_nr_api_ids) then
      v_is_nr := true;
    end if;
    if not v_is_nr and v_runner_name <> '' and v_nr_names is not null and v_runner_name = any(v_nr_names) then
      v_is_nr := true;
    end if;
    if v_is_nr then
      v_new_sel := v_selections || jsonb_build_object(v_api_race_id, v_fav);
      update public.daily_selections
      set selections = v_new_sel, updated_at = now()
      where id = v_row.id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  perform set_config('app.allow_backfill', '', true);
  return v_updated;
end;
$$;

comment on function public.replace_non_runner_selections_with_fav(uuid) is
  'Replaces daily_selections entries that picked a non-runner for this race with FAV. Uses app.allow_backfill to bypass selections lock. Call after updating horses.non_runner.';

grant execute on function public.replace_non_runner_selections_with_fav(uuid) to service_role;
grant execute on function public.replace_non_runner_selections_with_fav(uuid) to authenticated;
