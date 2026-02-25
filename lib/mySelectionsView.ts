/**
 * Fetch all of the user's selections for the "My selections" view-only list.
 * Returns items sorted by race time: meeting (course), race time, runner name.
 * Can use preloaded bulk data from selectionsBulkCache to avoid DB calls.
 */
import type { Race, RaceResult } from '@/types/races';
import { fetchRaceDaysForCompetition } from './raceDaysForCompetition';
import type { SelectionsBulkData } from './selectionsBulkCache';

export type MySelectionItem = {
  meeting: string;
  raceTimeUtc: string;
  runnerName: string;
  jockey?: string;
  competitionId: string;
  competitionName: string;
  raceId: string;
  raceDate: string;
  raceName: string;
  runnerId: string;
  positionLabel?: 'won' | 'place' | 'lost';
};

type SelectionRow = {
  competition_id: string;
  race_date: string;
  selections: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }> | null;
};

type RaceDayWithRaces = { id: string; race_date: string; course: string; first_race_utc?: string; races: Race[] };

const SELECTION_CLOSE_HOURS_BEFORE_FIRST = 1;

function isDeadlinePassed(firstRaceUtc: string | undefined, raceDate: string): boolean {
  const utc = firstRaceUtc ?? `${raceDate}T12:00:00.000Z`;
  const deadlineMs = new Date(utc).getTime() - SELECTION_CLOSE_HOURS_BEFORE_FIRST * 60 * 60 * 1000;
  return Date.now() >= deadlineMs;
}

export async function fetchMySelectionsView(
  supabase: Parameters<typeof fetchRaceDaysForCompetition>[0],
  userId: string,
  competitionIds: string[],
  compNames?: Map<string, string>
): Promise<MySelectionItem[]> {
  if (!competitionIds.length) return [];

  const { data: compRows } = await supabase.from('competitions').select('id, name').in('id', competitionIds);
  const names = compNames ?? new Map((compRows ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));

  const { data: selectionRows } = await supabase
    .from('daily_selections')
    .select('competition_id, race_date, selections')
    .eq('user_id', userId)
    .in('competition_id', competitionIds);

  const selectionByCompDate = new Map<string, Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>>();
  for (const row of (selectionRows ?? []) as SelectionRow[]) {
    selectionByCompDate.set(`${row.competition_id}:${row.race_date}`, row.selections ?? {});
  }

  const items: MySelectionItem[] = [];

  const daysPerComp = await Promise.all(
    competitionIds.map((compId) =>
      fetchRaceDaysForCompetition(supabase, compId, 'id, race_date, course, first_race_utc, races')
    )
  );
  competitionIds.forEach((compId, i) => {
    const days = daysPerComp[i] as RaceDayWithRaces[];
    const competitionName = names.get(compId) ?? 'Competition';

    for (const day of days) {
      const selections = selectionByCompDate.get(`${compId}:${day.race_date}`) ?? {};
      const deadlinePassed = isDeadlinePassed(day.first_race_utc, day.race_date);
      const course = day.course ?? 'Meeting';
      const races = day.races ?? [];

      for (const race of races) {
        const sel = selections[race.id];
        let runnerName: string;
        let runnerId: string;
        if (sel?.runnerName) {
          runnerName = sel.runnerName;
          runnerId = sel.runnerId ?? '';
        } else if (deadlinePassed) {
          runnerName = 'FAV';
          runnerId = 'FAV';
        } else {
          continue;
        }

        const runner = race.runners?.find((r: { id: string }) => r.id === runnerId) as { jockey?: string } | undefined;
        const result = race.results?.[runnerId] as RaceResult | undefined;
        items.push({
          meeting: course,
          raceTimeUtc: race.scheduledTimeUtc,
          runnerName,
          jockey: runner?.jockey,
          competitionId: compId,
          competitionName,
          raceId: race.id,
          raceDate: day.race_date,
          raceName: race.name ?? 'Race',
          runnerId,
          positionLabel: result?.positionLabel,
        });
      }
    }
  });

  items.sort((a, b) => a.raceTimeUtc.localeCompare(b.raceTimeUtc));
  return items;
}

/**
 * Compute MySelectionItem[] from preloaded bulk data (no DB calls).
 * Includes races where the user has made a selection, or where the deadline has passed
 * (shows FAV so they're aware of who they're on).
 */
export function computeMySelectionsFromBulk(
  bulk: SelectionsBulkData,
  userId: string,
  compNames: Map<string, string>
): MySelectionItem[] {
  const items: MySelectionItem[] = [];

  for (const compId of bulk.competitionIds) {
    const days = bulk.raceDaysByComp[compId] ?? [];
    const competitionName = compNames.get(compId) ?? 'Competition';

    for (const day of days) {
      const userRow = bulk.selections.find(
        (r) => r.user_id === userId && r.competition_id === compId && r.race_date === day.race_date
      );
      const selections = userRow?.selections ?? {};
      const deadlinePassed = isDeadlinePassed(day.first_race_utc, day.race_date);
      const course = day.course ?? 'Meeting';
      const races = day.races ?? [];

      for (const race of races) {
        const sel = selections[race.id];
        let runnerName: string;
        let runnerId: string;
        if (sel?.runnerName) {
          runnerName = sel.runnerName;
          runnerId = sel.runnerId ?? '';
        } else if (deadlinePassed) {
          runnerName = 'FAV';
          runnerId = 'FAV';
        } else {
          continue;
        }

        const runner = race.runners?.find((r: { id: string }) => r.id === runnerId) as { jockey?: string } | undefined;
        const result = race.results?.[runnerId] as RaceResult | undefined;
        items.push({
          meeting: course,
          raceTimeUtc: race.scheduledTimeUtc,
          runnerName,
          jockey: runner?.jockey,
          competitionId: compId,
          competitionName,
          raceId: race.id,
          raceDate: day.race_date,
          raceName: race.name ?? 'Race',
          runnerId,
          positionLabel: result?.positionLabel,
        });
      }
    }
  }

  items.sort((a, b) => a.raceTimeUtc.localeCompare(b.raceTimeUtc));
  return items;
}

export type OtherUserSelection = {
  displayName: string;
  runnerName: string;
  runnerId: string;
  isCurrentUser: boolean;
  positionLabel?: 'won' | 'place' | 'lost';
};

/**
 * Compute OtherUserSelection[] from preloaded bulk data (no DB calls).
 * Includes positionLabel (won/place/lost) when race results exist in bulk.
 */
export function computeOtherUsersSelectionsFromBulk(
  bulk: SelectionsBulkData,
  competitionId: string,
  raceDate: string,
  raceId: string,
  currentUserId: string
): OtherUserSelection[] {
  const displayByUser = new Map(
    bulk.participants.filter((p) => p.competition_id === competitionId).map((p) => [p.user_id, p.display_name ?? 'Unknown'])
  );

  const days = bulk.raceDaysByComp[competitionId] ?? [];
  const day = days.find((d) => d.race_date === raceDate);
  const race = day?.races?.find((r) => r.id === raceId);

  const out: OtherUserSelection[] = [];
  for (const row of bulk.selections) {
    if (row.competition_id !== competitionId || row.race_date !== raceDate) continue;
    const sel = row.selections?.[raceId];
    if (!sel?.runnerName) continue;
    const runnerId = sel.runnerId ?? '';
    const result = race?.results?.[runnerId] as { positionLabel?: 'won' | 'place' | 'lost' } | undefined;
    out.push({
      displayName: displayByUser.get(row.user_id) ?? 'Unknown',
      runnerName: sel.runnerName,
      runnerId,
      isCurrentUser: row.user_id === currentUserId,
      positionLabel: result?.positionLabel,
    });
  }
  out.sort((a, b) => (a.isCurrentUser ? -1 : b.isCurrentUser ? 1 : a.displayName.localeCompare(b.displayName)));
  return out;
}

export async function fetchOtherUsersSelectionsForRace(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  competitionId: string,
  raceDate: string,
  raceId: string,
  currentUserId: string
): Promise<OtherUserSelection[]> {
  const { data: selRows } = await supabase
    .from('daily_selections')
    .select('user_id, selections')
    .eq('competition_id', competitionId)
    .eq('race_date', raceDate);

  const userIds = [...new Set((selRows ?? []).map((r: { user_id: string }) => r.user_id))];
  if (userIds.length === 0) return [];

  const { data: parts } = await supabase
    .from('competition_participants')
    .select('user_id, display_name')
    .eq('competition_id', competitionId)
    .in('user_id', userIds);

  const displayByUser = new Map((parts ?? []).map((p: { user_id: string; display_name: string }) => [p.user_id, p.display_name ?? 'Unknown']));

  const out: OtherUserSelection[] = [];

  for (const row of selRows ?? []) {
    const sel = row.selections as Record<string, { runnerName?: string; runnerId?: string }> | null;
    const pick = sel?.[raceId];
    if (!pick?.runnerName) continue;
    const isCurrentUser = row.user_id === currentUserId;
    out.push({
      displayName: displayByUser.get(row.user_id) ?? 'Unknown',
      runnerName: pick.runnerName,
      runnerId: pick.runnerId ?? '',
      isCurrentUser,
      positionLabel: undefined,
    });
  }

  out.sort((a, b) => (a.isCurrentUser ? -1 : b.isCurrentUser ? 1 : a.displayName.localeCompare(b.displayName)));
  return out;
}
