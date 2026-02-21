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

type RaceDayWithRaces = { id: string; race_date: string; course: string; races: Race[] };

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

  const rows = (selectionRows ?? []) as SelectionRow[];
  const items: MySelectionItem[] = [];

  for (const row of rows) {
    const selections = row.selections ?? {};
    if (Object.keys(selections).length === 0) continue;

    const days = await fetchRaceDaysForCompetition(supabase, row.competition_id, 'id, race_date, course, races');
    const day = days.find((d: { race_date: string }) => d.race_date === row.race_date) as RaceDayWithRaces | undefined;
    if (!day?.races?.length) continue;

    const course = day.course ?? 'Meeting';
    const competitionName = names.get(row.competition_id) ?? 'Competition';

    for (const [raceId, sel] of Object.entries(selections)) {
      const race = day.races.find((r) => r.id === raceId);
      if (!race) continue;
      const result = race.results?.[sel.runnerId ?? ''] as RaceResult | undefined;
      const positionLabel = result?.positionLabel;
      items.push({
        meeting: course,
        raceTimeUtc: race.scheduledTimeUtc,
        runnerName: sel.runnerName ?? '—',
        competitionId: row.competition_id,
        competitionName,
        raceId,
        raceDate: row.race_date,
        raceName: race.name ?? 'Race',
        runnerId: sel.runnerId ?? '',
        positionLabel,
      });
    }
  }

  items.sort((a, b) => a.raceTimeUtc.localeCompare(b.raceTimeUtc));
  return items;
}

/**
 * Compute MySelectionItem[] from preloaded bulk data (no DB calls).
 */
export function computeMySelectionsFromBulk(
  bulk: SelectionsBulkData,
  userId: string,
  compNames: Map<string, string>
): MySelectionItem[] {
  const items: MySelectionItem[] = [];
  const userRows = bulk.selections.filter((r) => r.user_id === userId);

  for (const row of userRows) {
    const selections = row.selections ?? {};
    if (Object.keys(selections).length === 0) continue;

    const days = bulk.raceDaysByComp[row.competition_id] ?? [];
    const day = days.find((d) => d.race_date === row.race_date);
    if (!day?.races?.length) continue;

    const course = day.course ?? 'Meeting';
    const competitionName = compNames.get(row.competition_id) ?? 'Competition';

    for (const [raceId, sel] of Object.entries(selections)) {
      const race = day.races.find((r) => r.id === raceId);
      if (!race) continue;
      const result = race.results?.[sel.runnerId ?? ''] as RaceResult | undefined;
      items.push({
        meeting: course,
        raceTimeUtc: race.scheduledTimeUtc,
        runnerName: sel.runnerName ?? '—',
        competitionId: row.competition_id,
        competitionName,
        raceId,
        raceDate: row.race_date,
        raceName: race.name ?? 'Race',
        runnerId: sel.runnerId ?? '',
        positionLabel: result?.positionLabel,
      });
    }
  }

  items.sort((a, b) => a.raceTimeUtc.localeCompare(b.raceTimeUtc));
  return items;
}

export type OtherUserSelection = { displayName: string; runnerName: string; isCurrentUser: boolean };

/**
 * Compute OtherUserSelection[] from preloaded bulk data (no DB calls).
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

  const out: OtherUserSelection[] = [];
  for (const row of bulk.selections) {
    if (row.competition_id !== competitionId || row.race_date !== raceDate) continue;
    const pick = row.selections?.[raceId]?.runnerName;
    if (!pick) continue;
    out.push({
      displayName: displayByUser.get(row.user_id) ?? 'Unknown',
      runnerName: pick,
      isCurrentUser: row.user_id === currentUserId,
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
    const sel = row.selections as Record<string, { runnerName?: string }> | null;
    const pick = sel?.[raceId]?.runnerName;
    if (!pick) continue;
    const isCurrentUser = row.user_id === currentUserId;
    out.push({
      displayName: displayByUser.get(row.user_id) ?? 'Unknown',
      runnerName: pick,
      isCurrentUser,
    });
  }

  out.sort((a, b) => (a.isCurrentUser ? -1 : b.isCurrentUser ? 1 : a.displayName.localeCompare(b.displayName)));
  return out;
}
