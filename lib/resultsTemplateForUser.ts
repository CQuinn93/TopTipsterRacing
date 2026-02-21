/**
 * Fetch races for the user's competitions, grouped by meeting (course), for the Results section.
 * Includes ALL races from linked race days – when the user has no selection (e.g. locked/FAV backfill
 * not yet run), we show "FAV" and "Awaiting results". Each race is a template: race name, time,
 * user's selection, places 1–4, full result, and placed positions.
 */
import type { Race, RaceResult } from '@/types/races';
import { fetchRaceDaysForCompetition } from './raceDaysForCompetition';

export type ResultRow = {
  /** Numeric position 1,2,3... or null for resultCode (f/u/pu). */
  position: number | null;
  /** Display label: "1st", "2nd", "F", "U", "PU", etc. */
  label: string;
  name: string;
  sp: number;
  earnedPoints: boolean;
};

export type RaceResultTemplate = {
  raceId: string;
  raceTimeUtc: string;
  raceName: string;
  userSelection: string;
  place1: string | null;
  place2: string | null;
  place3: string | null;
  place4: string | null;
  /** All horses with results, sorted by position. For full result view. */
  fullResult: ResultRow[];
  /** Positions that earned points (place rules: handicap + runner count). */
  placedPositions: number[];
};

export type MeetingResults = {
  course: string;
  races: RaceResultTemplate[];
};

type RaceDayRow = { id: string; race_date: string; course: string; races: Race[] | null };
type SelectionRow = { competition_id: string; race_date: string; selections: Record<string, { runnerName?: string }> | null };

function getPlacedPositions(isHandicap: boolean, totalRunners: number): number[] {
  if (isHandicap) return totalRunners >= 16 ? [1, 2, 3, 4] : [1, 2, 3];
  if (totalRunners >= 15) return [1, 2, 3];
  if (totalRunners > 7) return [1, 2];
  if (totalRunners >= 4) return [1];
  return [];
}

function resultCodeLabel(code: string): string {
  const labels: Record<string, string> = { f: 'F', u: 'U', pu: 'PU', ur: 'UR', bd: 'BD', ro: 'RO', co: 'CO' };
  return labels[code.toLowerCase()] ?? code.toUpperCase();
}

function getPlaceNames(race: Race): { place1: string | null; place2: string | null; place3: string | null; place4: string | null } {
  const results = race.results;
  if (!results || typeof results !== 'object') {
    return { place1: null, place2: null, place3: null, place4: null };
  }
  const runners = race.runners ?? [];
  const byPosition: Record<number, string> = {};
  for (const r of runners) {
    const res = results[r.id] as RaceResult | undefined;
    const pos = res?.position;
    if (pos != null && pos >= 1 && pos <= 4) byPosition[pos] = r.name ?? '';
  }
  return {
    place1: byPosition[1] ?? null,
    place2: byPosition[2] ?? null,
    place3: byPosition[3] ?? null,
    place4: byPosition[4] ?? null,
  };
}

export async function fetchResultsTemplateForUser(
  supabase: Parameters<typeof fetchRaceDaysForCompetition>[0],
  userId: string,
  competitionIds: string[]
): Promise<MeetingResults[]> {
  if (!competitionIds.length) return [];

  const { data: selectionRows } = await supabase
    .from('daily_selections')
    .select('competition_id, race_date, selections')
    .eq('user_id', userId)
    .in('competition_id', competitionIds);

  const selectionsByCompDate = new Map<string, Record<string, string>>();
  for (const row of (selectionRows ?? []) as SelectionRow[]) {
    const sel = row.selections ?? {};
    const out: Record<string, string> = {};
    for (const [raceId, v] of Object.entries(sel)) {
      if (v?.runnerName != null) out[raceId] = v.runnerName;
    }
    selectionsByCompDate.set(`${row.competition_id}:${row.race_date}`, out);
  }

  const byCourse = new Map<string, RaceResultTemplate[]>();

  for (const compId of competitionIds) {
    const days = await fetchRaceDaysForCompetition(supabase, compId, 'id, race_date, course, races');
    for (const d of days as RaceDayRow[]) {
      const key = `${compId}:${d.race_date}`;
      const userSelections = selectionsByCompDate.get(key) ?? {};
      const races = d.races ?? [];
      const course = d.course ?? 'Meeting';

      for (const race of races) {
        const userSelection = userSelections[race.id] ?? 'FAV';

        const { place1, place2, place3, place4 } = getPlaceNames(race);
        const results = race.results ?? {};
        const runners = race.runners ?? [];
        const fullResult: ResultRow[] = [];
        for (const r of runners) {
          if (r.id === 'FAV') continue;
          const res = results[r.id] as RaceResult | undefined;
          if (!res) continue;
          if (res.position != null && res.position >= 1) {
            fullResult.push({
              position: res.position,
              label: res.position === 1 ? '1st' : res.position === 2 ? '2nd' : res.position === 3 ? '3rd' : `${res.position}th`,
              name: r.name ?? '',
              sp: res.sp ?? 0,
              earnedPoints: false,
            });
          } else if (res.resultCode) {
            fullResult.push({
              position: null,
              label: resultCodeLabel(res.resultCode),
              name: r.name ?? '',
              sp: res.sp ?? 0,
              earnedPoints: false,
            });
          }
        }
        // Sort: numeric positions first (1,2,3...), then result codes (f,u,pu) at end
        fullResult.sort((a, b) => {
          const pa = a.position ?? 999;
          const pb = b.position ?? 999;
          return pa - pb;
        });
        const totalRunners = fullResult.length;
        const isHandicap = race.isHandicap ?? false;
        const placedPositions = getPlacedPositions(isHandicap, totalRunners);
        for (const row of fullResult) {
          row.earnedPoints = row.position != null && placedPositions.includes(row.position);
        }

        const template: RaceResultTemplate = {
          raceId: race.id,
          raceTimeUtc: race.scheduledTimeUtc,
          raceName: race.name ?? 'Race',
          userSelection,
          place1,
          place2,
          place3,
          place4,
          fullResult,
          placedPositions,
        };

        if (!byCourse.has(course)) byCourse.set(course, []);
        const list = byCourse.get(course)!;
        const already = list.some((r) => r.raceId === race.id && r.raceTimeUtc === race.scheduledTimeUtc);
        if (!already) list.push(template);
      }
    }
  }

  const meetings: MeetingResults[] = [];
  for (const [course, races] of byCourse.entries()) {
    races.sort((a, b) => a.raceTimeUtc.localeCompare(b.raceTimeUtc));
    meetings.push({ course, races });
  }
  meetings.sort((a, b) => a.course.localeCompare(b.course));
  return meetings;
}
