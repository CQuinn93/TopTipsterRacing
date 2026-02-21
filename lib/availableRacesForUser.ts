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
  /** First race start time (ISO). Deadline for selections = firstRaceUtc - 1 hour */
  firstRaceUtc: string;
  /** Last race start time (ISO). Used for cache invalidation. */
  lastRaceUtc: string;
  /** User has made all picks for this day */
  hasAllPicks: boolean;
  /** User has locked in (early lock or past deadline) */
  isLocked: boolean;
  /** daily_selections id for lock RPC */
  selectionId: string | null;
};

export async function fetchAvailableRacesForUser(
  supabase: Parameters<typeof fetchRaceDaysForCompetition>[0],
  userId: string,
  competitionIds: string[],
  competitionsByName: Map<string, string>
): Promise<AvailableRaceDay[]> {
  if (!competitionIds.length) return [];

  const allRaceDays: { compId: string; compName: string; day: { id: string; race_date: string; course?: string; first_race_utc?: string; races: Race[] } }[] = [];
  for (const compId of competitionIds) {
    const days = await fetchRaceDaysForCompetition(supabase, compId, 'id, race_date, course, first_race_utc, races');
    const compName = competitionsByName.get(compId) ?? 'Competition';
    for (const d of days as { id: string; race_date: string; course?: string; first_race_utc?: string; races: Race[] }[]) {
      if (d.races?.length) allRaceDays.push({ compId, compName, day: d });
    }
  }

  const { data: selectionsRows } = await supabase
    .from('daily_selections')
    .select('id, competition_id, race_date, selections, locked_at')
    .eq('user_id', userId)
    .in('competition_id', competitionIds);

  type SelRow = {
    id: string;
    competition_id: string;
    race_date: string;
    selections: Record<string, unknown> | null;
    locked_at: string | null;
  };
  const selectionsByCompDate = new Map<string, { selections: Record<string, unknown>; locked_at: string | null; id: string }>();
  for (const row of (selectionsRows ?? []) as SelRow[]) {
    selectionsByCompDate.set(`${row.competition_id}:${row.race_date}`, {
      selections: row.selections ?? {},
      locked_at: row.locked_at,
      id: row.id,
    });
  }

  const result: AvailableRaceDay[] = [];
  for (const { compId, compName, day } of allRaceDays) {
    const firstRaceUtc = day.first_race_utc ?? `${day.race_date}T12:00:00.000Z`;
    const races = day.races ?? [];
    const lastRaceUtc =
      races.length > 0
        ? races.reduce((max, r) => (r.scheduledTimeUtc > max ? r.scheduledTimeUtc : max), races[0].scheduledTimeUtc)
        : firstRaceUtc;
    const sel = selectionsByCompDate.get(`${compId}:${day.race_date}`);
    const selections = sel?.selections ?? {};
    const lockedAt = sel?.locked_at ?? null;
    const selectionId = sel?.id ?? null;
    const pendingCount = races.filter((r) => !(r.id in selections)).length;
    const hasAllPicks = pendingCount === 0;
    const deadlineMs = new Date(firstRaceUtc).getTime() - 60 * 60 * 1000;
    const beforeDeadline = Date.now() < deadlineMs;
    const isLocked = lockedAt != null || !beforeDeadline;

    if (beforeDeadline) {
      result.push({
        competitionId: compId,
        competitionName: compName,
        course: day.course ?? 'Races',
        raceDate: day.race_date,
        raceDayId: day.id,
        pendingCount,
        firstRaceUtc,
        lastRaceUtc,
        hasAllPicks,
        isLocked,
        selectionId,
      });
    }
  }
  result.sort((a, b) => a.raceDate.localeCompare(b.raceDate) || a.competitionName.localeCompare(b.competitionName));
  return result;
}
