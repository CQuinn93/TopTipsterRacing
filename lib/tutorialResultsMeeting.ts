import type { MeetingResults, RaceResultTemplate, ResultRow } from '@/lib/resultsTemplateForUser';
import type { Race, RaceResult } from '@/types/races';

function getPlacedPositions(isHandicap: boolean, totalRunners: number): number[] {
  if (isHandicap) return totalRunners >= 16 ? [1, 2, 3, 4] : [1, 2, 3];
  if (totalRunners >= 8) return [1, 2, 3];
  if (totalRunners >= 5) return [1, 2];
  if (totalRunners >= 1) return [1];
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

/** One synthetic “meeting” for the tutorial Results tab. */
export function buildTutorialMeetingResults(
  courseName: string,
  races: Race[],
  userSelectionNamesByRaceId: Record<string, string>
): MeetingResults[] {
  const raceTemplates: RaceResultTemplate[] = [];
  for (const race of races) {
    const userSelection = userSelectionNamesByRaceId[race.id] ?? '';
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
          label:
            res.position === 1 ? '1st' : res.position === 2 ? '2nd' : res.position === 3 ? '3rd' : `${res.position}th`,
          name: r.name ?? '',
          sp: res.sp ?? 0,
          earnedPoints: false,
          pos_points: res.pos_points,
          sp_points: res.sp_points,
        });
      } else if (res.resultCode) {
        fullResult.push({
          position: null,
          label: resultCodeLabel(res.resultCode),
          name: r.name ?? '',
          sp: res.sp ?? 0,
          earnedPoints: false,
          pos_points: res.pos_points,
          sp_points: res.sp_points,
        });
      }
    }
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
    raceTemplates.push({
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
    });
  }
  raceTemplates.sort((a, b) => a.raceTimeUtc.localeCompare(b.raceTimeUtc));
  return [{ course: courseName, races: raceTemplates }];
}
