/**
 * Fetch race_days for a competition via competition_race_days bridge.
 * Races are derived from races + horses tables (single source of truth).
 */
import { buildRacesForRaceDays } from './buildRacesFromTables';

export async function fetchRaceDaysForCompetition<T = { id: string; race_date: string; races: unknown }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  competitionId: string,
  selectCols = 'id, race_date, races'
): Promise<T[]> {
  const { data: links } = await supabase
    .from('competition_race_days')
    .select('race_day_id')
    .eq('competition_id', competitionId);
  const ids = (links ?? []).map((l) => l.race_day_id).filter(Boolean);
  if (ids.length === 0) return [];

  const needsRaces = selectCols.includes('races');
  const dbCols = needsRaces ? 'id, race_date, course, first_race_utc' : selectCols;

  const { data } = await supabase
    .from('race_days')
    .select(dbCols)
    .in('id', ids)
    .order('race_date');

  const rows = (data ?? []) as Record<string, unknown>[];
  if (!needsRaces) return rows as T[];

  try {
    const racesMap = await buildRacesForRaceDays(supabase, ids);
    for (const row of rows) {
      const id = row.id as string;
      row.races = racesMap.get(id) ?? [];
    }
  } catch (e) {
    console.error('buildRacesForRaceDays failed:', e);
    for (const row of rows) {
      row.races = [];
    }
  }
  return rows as T[];
}
