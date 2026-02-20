/**
 * Fetch race results from the user's competitions for the home screen.
 * Returns races that have a winner, sorted by race time (most recent first).
 */
import type { Race, RaceResult } from '@/types/races';
import { fetchRaceDaysForCompetition } from './raceDaysForCompetition';

export type RaceResultItem = {
  course: string;
  raceDate: string;
  raceTimeUtc: string;
  raceName: string;
  winnerName: string;
};

type RaceDayRow = { id: string; race_date: string; course: string; races: Race[] | null };

function getWinnerName(race: Race): string | null {
  const results = race.results;
  if (!results || typeof results !== 'object') return null;
  const runners = race.runners ?? [];
  const winner = runners.find((r) => {
    const res = results[r.id] as RaceResult | undefined;
    return res?.position === 1 || res?.positionLabel === 'won';
  });
  return winner?.name ?? null;
}

export async function fetchRaceResultsForUser(
  supabase: Parameters<typeof fetchRaceDaysForCompetition>[0],
  competitionIds: string[],
  limit = 30
): Promise<RaceResultItem[]> {
  if (!competitionIds.length) return [];

  const items: RaceResultItem[] = [];

  for (const compId of competitionIds) {
    const days = await fetchRaceDaysForCompetition(supabase, compId, 'id, race_date, course, races');
    for (const d of days as RaceDayRow[]) {
      const races = d.races ?? [];
      const course = d.course ?? 'Meeting';
      for (const race of races) {
        const winnerName = getWinnerName(race);
        if (!winnerName) continue;
        items.push({
          course,
          raceDate: d.race_date,
          raceTimeUtc: race.scheduledTimeUtc,
          raceName: race.name ?? 'Race',
          winnerName,
        });
      }
    }
  }

  items.sort((a, b) => b.raceTimeUtc.localeCompare(a.raceTimeUtc));
  return items.slice(0, limit);
}
