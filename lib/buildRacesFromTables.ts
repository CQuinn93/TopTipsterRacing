/**
 * Build Race[] from races + horses tables (single source of truth).
 * Used instead of race_days.races JSONB.
 */
import type { Race, RaceResult, Runner } from '@/types/races';

type RaceRow = {
  id: string;
  race_day_id: string;
  api_race_id: string;
  name: string;
  scheduled_time_utc: string;
  distance: string | null;
  is_handicap: boolean;
};

type HorseRow = {
  race_id: string;
  api_horse_id: string;
  name: string;
  jockey: string | null;
  odds_decimal: number | null;
  number: string | null;
  position?: number | null;
  result_code?: string | null;
  sp: number | null;
  pos_points?: number | null;
  sp_points?: number | null;
};

function positionLabel(position: number): 'won' | 'place' | 'lost' {
  if (position === 1) return 'won';
  if (position === 2 || position === 3) return 'place';
  return 'lost';
}

/** Build Race shape from race row + horse rows. Adds FAV runner; results from horses with position. */
function buildRace(race: RaceRow, horses: HorseRow[]): Race {
  const runners: Runner[] = horses.map((h) => ({
    id: h.api_horse_id,
    name: h.name,
    oddsDecimal: h.odds_decimal != null && Number.isFinite(h.odds_decimal) ? h.odds_decimal : 0,
    number: h.number != null ? parseInt(h.number, 10) : undefined,
    jockey: h.jockey ?? undefined,
  }));
  runners.push({ id: 'FAV', name: 'FAV', oddsDecimal: 0 });

  const results: Record<string, RaceResult> = {};
  for (const h of horses) {
    if (h.position != null && h.position >= 1) {
      results[h.api_horse_id] = {
        position: h.position,
        positionLabel: positionLabel(h.position),
        sp: h.sp != null && Number.isFinite(h.sp) ? h.sp : 0,
        pos_points: h.pos_points != null && Number.isFinite(h.pos_points) ? h.pos_points : undefined,
        sp_points: h.sp_points != null && Number.isFinite(h.sp_points) ? h.sp_points : undefined,
      };
    } else if (h.result_code) {
      results[h.api_horse_id] = {
        position: null,
        sp: h.sp != null && Number.isFinite(h.sp) ? h.sp : 0,
        resultCode: h.result_code,
      };
    }
  }

  return {
    id: race.api_race_id,
    name: race.name,
    scheduledTimeUtc: race.scheduled_time_utc,
    distance: race.distance ?? undefined,
    isHandicap: race.is_handicap ?? false,
    runners,
    results: Object.keys(results).length ? results : undefined,
  };
}

/**
 * Fetch races + horses for given race_day_ids and return a map race_day_id -> Race[].
 */
export async function buildRacesForRaceDays(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  raceDayIds: string[]
): Promise<Map<string, Race[]>> {
  if (raceDayIds.length === 0) return new Map();

  const { data: raceRows } = await supabase
    .from('races')
    .select('id, race_day_id, api_race_id, name, scheduled_time_utc, distance, is_handicap')
    .in('race_day_id', raceDayIds)
    .order('scheduled_time_utc', { ascending: true });

  const races = (raceRows ?? []) as RaceRow[];
  if (races.length === 0) {
    const empty = new Map<string, Race[]>();
    for (const id of raceDayIds) empty.set(id, []);
    return empty;
  }

  const raceIds = races.map((r) => r.id);
  let horseSelect = 'race_id, api_horse_id, name, jockey, odds_decimal, number, sp, position, result_code, pos_points, sp_points';
  let { data: horseRows, error: horsesError } = await supabase
    .from('horses')
    .select(horseSelect)
    .in('race_id', raceIds);

  if (horsesError && /result_code|pos_points|sp_points|does not exist/i.test(String(horsesError.message || horsesError))) {
    horseSelect = 'race_id, api_horse_id, name, odds_decimal, number, sp, position';
    const fallback = await supabase.from('horses').select(horseSelect).in('race_id', raceIds);
    horseRows = fallback.data;
    horsesError = fallback.error;
  }
  if (horsesError && /position|does not exist/i.test(String(horsesError.message || horsesError))) {
    horseSelect = 'race_id, api_horse_id, name, odds_decimal, number, sp';
    const fallback2 = await supabase.from('horses').select(horseSelect).in('race_id', raceIds);
    horseRows = fallback2.data;
    horsesError = fallback2.error;
  }

  if (horsesError) {
    console.error('buildRacesForRaceDays horses fetch:', horsesError);
    const empty = new Map<string, Race[]>();
    for (const id of raceDayIds) empty.set(id, []);
    return empty;
  }

  const horses = (horseRows ?? []) as HorseRow[];
  const horsesByRace = new Map<string, HorseRow[]>();
  for (const h of horses) {
    const list = horsesByRace.get(h.race_id) ?? [];
    list.push(h);
    horsesByRace.set(h.race_id, list);
  }

  const racesByDay = new Map<string, RaceRow[]>();
  for (const r of races) {
    const dayId = r.race_day_id;
    if (!dayId) continue;
    const list = racesByDay.get(dayId) ?? [];
    list.push(r);
    racesByDay.set(dayId, list);
  }

  const result = new Map<string, Race[]>();
  for (const dayId of raceDayIds) {
    const dayRaces = racesByDay.get(dayId) ?? [];
    const built = dayRaces.map((r) => buildRace(r, horsesByRace.get(r.id) ?? []));
    result.set(dayId, built);
  }
  return result;
}
