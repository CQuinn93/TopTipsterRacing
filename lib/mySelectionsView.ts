/**
 * Fetch all of the user's selections for the "My selections" view-only list.
 * Returns items sorted by race time: meeting (course), race time, runner name.
 */
import type { Race } from '@/types/races';
import { fetchRaceDaysForCompetition } from './raceDaysForCompetition';

export type MySelectionItem = {
  meeting: string;
  raceTimeUtc: string;
  runnerName: string;
};

type SelectionRow = {
  competition_id: string;
  race_date: string;
  selections: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }> | null;
};

type RaceDayWithRaces = { id: string; race_date: string; course: string; races: Race[] };

export async function fetchMySelectionsView(
  supabase: Parameters<typeof fetchRaceDaysForCompetition>[0],
  userId: string,
  competitionIds: string[]
): Promise<MySelectionItem[]> {
  if (!competitionIds.length) return [];

  const { data: selectionRows } = await supabase
    .from('daily_selections')
    .select('competition_id, race_date, selections')
    .eq('user_id', userId)
    .in('competition_id', competitionIds);

  const rows = (selectionRows ?? []) as SelectionRow[];
  const items: MySelectionItem[] = [];

  for (const row of rows) {
    const selections = row.selections ?? {};
    if (Object.keys(selections).length === 0) continue;

    const days = await fetchRaceDaysForCompetition(supabase, row.competition_id, 'id, race_date, course, races');
    const day = days.find((d: { race_date: string }) => d.race_date === row.race_date) as RaceDayWithRaces | undefined;
    if (!day?.races?.length) continue;

    const course = day.course ?? 'Meeting';

    for (const [raceId, sel] of Object.entries(selections)) {
      const race = day.races.find((r) => r.id === raceId);
      if (!race) continue;
      items.push({
        meeting: course,
        raceTimeUtc: race.scheduledTimeUtc,
        runnerName: sel.runnerName ?? '—',
      });
    }
  }

  items.sort((a, b) => a.raceTimeUtc.localeCompare(b.raceTimeUtc));
  return items;
}
