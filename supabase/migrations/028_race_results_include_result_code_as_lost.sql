-- Include horses with result_code (PU, U, F, etc.) in race results and set positionLabel to 'lost'.
-- Non-runners are handled by update-race-results (selection replaced with FAV); they are not in results.

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
                when h.position is not null then 'lost'
                when h.result_code is not null and trim(coalesce(h.result_code, '')) <> '' then 'lost'
                else null
              end,
              'sp', coalesce(h.sp, 0),
              'resultCode', h.result_code
            )
          )
          from horses h
          where h.race_id = r.id
            and (h.position is not null or (h.result_code is not null and trim(coalesce(h.result_code, '')) <> ''))
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
