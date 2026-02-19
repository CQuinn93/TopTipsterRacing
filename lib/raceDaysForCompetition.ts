/**
 * Fetch race_days for a competition via competition_race_days bridge.
 * Race days are independent; competition_race_days links them.
 */
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
  const { data } = await supabase
    .from('race_days')
    .select(selectCols)
    .in('id', ids)
    .order('race_date');
  return (data ?? []) as T[];
}
