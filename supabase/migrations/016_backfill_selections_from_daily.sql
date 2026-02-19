-- Backfill public.selections from daily_selections JSON.
-- Maps (competition_id, user_id, race_date, selections{raceId->{runnerId, oddsDecimal}})
-- to (user_id, competition_id, race_id, horse_id, odds_decimal) by resolving race_id and horse_id.

insert into public.selections (user_id, competition_id, race_id, horse_id, odds_decimal, created_at, updated_at)
select
  ds.user_id,
  ds.competition_id,
  r.id as race_id,
  h.id as horse_id,
  (v->>'oddsDecimal')::numeric as odds_decimal,
  ds.submitted_at,
  ds.updated_at
from public.daily_selections ds
cross join lateral jsonb_each(ds.selections) as j(race_id_key, v)
join public.competition_race_days crd on crd.competition_id = ds.competition_id
join public.race_days rd on rd.id = crd.race_day_id and rd.race_date = ds.race_date
join public.races r on r.race_day_id = rd.id and r.api_race_id = j.race_id_key
join public.horses h on h.race_id = r.id and h.api_horse_id = (v->>'runnerId')
where ds.selections is not null and jsonb_typeof(ds.selections) = 'object'
  and (v->>'oddsDecimal') is not null
on conflict (user_id, competition_id, race_id) do update set
  horse_id = excluded.horse_id,
  odds_decimal = excluded.odds_decimal,
  updated_at = excluded.updated_at;
