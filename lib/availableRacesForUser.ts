/**
 * Fetch races available for a user to make selections (competitions they're in,
 * race_days within competition date range, excluding races they've already picked).
 */
import type { Race } from '@/types/races';
import { fetchRaceDaysForCompetition } from './raceDaysForCompetition';

export type AvailableRaceDay = {
  competitionId: string;
  competitionName: string;
  course: string;
  raceDate: string;
  raceDayId: string;
  pendingCount: number;
};

export async function fetchAvailableRacesForUser(
  supabase: Parameters<typeof fetchRaceDaysForCompetition>[0],
  userId: string,
  competitionIds: string[],
  competitionsByName: Map<string, string>
): Promise<AvailableRaceDay[]> {
  if (!competitionIds.length) return [];

  const allRaceDays: { compId: string; compName: string; day: { id: string; race_date: string; course?: string; races: Race[] } }[] = [];
  for (const compId of competitionIds) {
    const days = await fetchRaceDaysForCompetition(supabase, compId, 'id, race_date, course, races');
    const compName = competitionsByName.get(compId) ?? 'Competition';
    for (const d of days as { id: string; race_date: string; course?: string; races: Race[] }[]) {
      if (d.races?.length) allRaceDays.push({ compId, compName, day: d });
    }
  }

  const { data: selectionsRows } = await supabase
    .from('daily_selections')
    .select('competition_id, race_date, selections')
    .eq('user_id', userId)
    .in('competition_id', competitionIds);

  const selectionsByCompDate = new Map<string, Record<string, unknown>>();
  for (const row of (selectionsRows ?? []) as { competition_id: string; race_date: string; selections: Record<string, unknown> | null }[]) {
    selectionsByCompDate.set(`${row.competition_id}:${row.race_date}`, row.selections ?? {});
  }

  const result: AvailableRaceDay[] = [];
  for (const { compId, compName, day } of allRaceDays) {
    const selections = selectionsByCompDate.get(`${compId}:${day.race_date}`) ?? {};
    const pendingCount = (day.races ?? []).filter((r) => !(r.id in selections)).length;
    if (pendingCount > 0) {
      result.push({
        competitionId: compId,
        competitionName: compName,
        course: day.course ?? 'Races',
        raceDate: day.race_date,
        raceDayId: day.id,
        pendingCount,
      });
    }
  }
  result.sort((a, b) => a.raceDate.localeCompare(b.raceDate) || a.competitionName.localeCompare(b.competitionName));
  return result;
}
