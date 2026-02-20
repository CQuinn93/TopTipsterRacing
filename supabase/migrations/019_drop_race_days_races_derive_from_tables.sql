-- Derive races from races + horses tables; drop race_days.races column.
-- tablet_get_data builds races via get_races_for_race_day().

create or replace function public.get_races_for_race_day(p_race_day_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_agg(
      jsonb_build_object(
        'id', r.api_race_id,
        'name', r.name,
        'scheduledTimeUtc', r.scheduled_time_utc,
        'distance', r.distance,
        'runners', (
          coalesce(
            (select jsonb_agg(
              jsonb_build_object(
                'id', h.api_horse_id,
                'name', h.name,
                'oddsDecimal', coalesce(h.odds_decimal, 0),
                'number', case when h.number ~ '^\d+$' then (h.number)::int else null end
              )
              order by h.name
            )
            from horses h
            where h.race_id = r.id
          ),
          '[]'::jsonb
        ) || '[{"id":"FAV","name":"FAV","oddsDecimal":0}]'::jsonb,
        'results', coalesce(
          (select jsonb_object_agg(
            h.api_horse_id,
            jsonb_build_object(
              'position', h.position,
              'positionLabel', case
                when h.position = 1 then 'won'
                when h.position in (2, 3) then 'place'
                else 'lost'
              end,
              'sp', coalesce(h.sp, 0)
            )
          )
          from horses h
          where h.race_id = r.id and h.position is not null
          ),
          '{}'::jsonb
        )
      )
      order by r.scheduled_time_utc
    )
    from races r
    where r.race_day_id = p_race_day_id
    ),
    '[]'::jsonb
  );
$$;

create or replace function public.tablet_get_data(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_comps jsonb;
  v_race_days jsonb;
  v_selections jsonb;
begin
  if length(trim(p_code)) <> 6 then
    return jsonb_build_object('error', 'invalid_code');
  end if;

  select user_id into v_user_id
  from public.user_tablet_codes
  where code = trim(p_code);

  if v_user_id is null then
    return jsonb_build_object('error', 'invalid_code');
  end if;

  -- Competitions user is in
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'status', c.status
  )), '[]'::jsonb) into v_comps
  from public.competition_participants cp
  join public.competitions c on c.id = cp.competition_id
  where cp.user_id = v_user_id;

  -- Race days via competition_race_days; races derived from races + horses
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rd.id,
    'competition_id', crd.competition_id,
    'race_date', rd.race_date,
    'first_race_utc', rd.first_race_utc,
    'races', public.get_races_for_race_day(rd.id)
  ) order by crd.competition_id, rd.race_date), '[]'::jsonb) into v_race_days
  from public.competition_race_days crd
  join public.race_days rd on rd.id = crd.race_day_id
  where crd.competition_id in (
    select competition_id from public.competition_participants where user_id = v_user_id
  );

  -- Current daily selections for this user
  select coalesce(jsonb_agg(jsonb_build_object(
    'competition_id', ds.competition_id,
    'race_date', ds.race_date,
    'selections', ds.selections
  )), '[]'::jsonb) into v_selections
  from public.daily_selections ds
  where ds.user_id = v_user_id;

  return jsonb_build_object(
    'user_id', v_user_id,
    'competitions', v_comps,
    'race_days', v_race_days,
    'selections', v_selections
  );
end;
$$;

-- Drop race_days.races (single source of truth is races + horses)
alter table public.race_days drop column if exists races;
