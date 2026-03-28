import { POSITION_POINTS } from '@/lib/appUtils';
import type { TutorialBotSelectionJson, TutorialRaceJson, TutorialRunnerJson } from '@/lib/tutorialTypes';
import type { Race, RaceResult, Runner } from '@/types/races';

export const TUTORIAL_SLUG_DEFAULT = 'starter-tour';

export function getTutorialMeetingStart(): Date {
  const d = new Date();
  d.setHours(14, 0, 0, 0);
  return d;
}

function placedPositionsNonHandicap(totalRunners: number): number[] {
  if (totalRunners >= 8) return [1, 2, 3];
  if (totalRunners >= 5) return [1, 2];
  if (totalRunners >= 1) return [1];
  return [];
}

function runnerJsonToRaceResult(
  tr: TutorialRunnerJson,
  totalRunners: number,
  isHandicap = false
): RaceResult {
  const sp = Number(tr.oddsDecimal) || 1;
  const code = tr.resultCode?.trim();
  if (code) {
    return { position: null, sp, positionLabel: 'lost', pos_points: 0, sp_points: 0, resultCode: code };
  }
  const pos = tr.position ?? null;
  const placed = isHandicap
    ? totalRunners >= 16
      ? [1, 2, 3, 4]
      : [1, 2, 3]
    : placedPositionsNonHandicap(totalRunners);
  if (pos === 1) {
    return { position: 1, sp, positionLabel: 'won', pos_points: POSITION_POINTS.won, sp_points: 0 };
  }
  if (pos != null && placed.includes(pos)) {
    return { position: pos, sp, positionLabel: 'place', pos_points: POSITION_POINTS.place, sp_points: 0 };
  }
  return {
    position: pos,
    sp,
    positionLabel: 'lost',
    pos_points: 0,
    sp_points: 0,
  };
}

/** Map tutorial API races to app `Race[]` with synthetic times and `results`. */
export function tutorialJsonToRaces(races: TutorialRaceJson[] | undefined, meetingStart: Date): Race[] {
  if (!races?.length) return [];
  return races.map((r) => {
    const list = (r.runners ?? []).slice();
    const total = list.filter((x) => x.id !== 'FAV').length;
    const runners: Runner[] = list.map((tr) => ({
      id: tr.id,
      name: tr.name,
      oddsDecimal: Number(tr.oddsDecimal) || 1,
      number: tr.number ?? undefined,
      jockey: tr.jockey ?? undefined,
    }));
    const results: Record<string, RaceResult> = {};
    for (const tr of list) {
      if (tr.id === 'FAV') continue;
      results[tr.id] = runnerJsonToRaceResult(tr, total, false);
    }
    const t = new Date(meetingStart.getTime() + r.startsAfterMinutes * 60 * 1000);
    return {
      id: r.id,
      name: r.raceName,
      scheduledTimeUtc: t.toISOString(),
      isHandicap: false,
      runners,
      results,
    };
  });
}

export function raceDateFromMeetingStart(meetingStart: Date): string {
  return meetingStart.toISOString().slice(0, 10);
}

export type SelectionsMap = Record<string, { runnerId: string; runnerName?: string; oddsDecimal?: number }>;

export function pointsForSelectionsOnRaces(races: Race[], selections: SelectionsMap | null | undefined): number {
  if (!selections) return 0;
  let sum = 0;
  for (const race of races) {
    const pick = selections[race.id];
    if (!pick?.runnerId) continue;
    const res = race.results?.[pick.runnerId];
    if (res != null && (res.pos_points != null || res.sp_points != null)) {
      sum += (res.pos_points ?? 0) + (res.sp_points ?? 0);
    }
  }
  return sum;
}

export function botSelectionsByUser(
  botSelections: TutorialBotSelectionJson[] | undefined
): Record<string, Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>> {
  const out: Record<string, Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>> = {};
  for (const row of botSelections ?? []) {
    if (!out[row.botUserId]) out[row.botUserId] = {};
    out[row.botUserId][row.raceId] = {
      runnerId: row.runnerId,
      runnerName: row.runnerName,
      oddsDecimal: Number(row.oddsDecimal) || 1,
    };
  }
  return out;
}

export function maxWinningSpForSelections(
  races: Race[],
  selections: SelectionsMap | null | undefined
): { sp: number; runnerName: string; raceName: string } | null {
  if (!selections) return null;
  let best: { sp: number; runnerName: string; raceName: string } | null = null;
  for (const race of races) {
    const pick = selections[race.id];
    if (!pick?.runnerId) continue;
    const res = race.results?.[pick.runnerId];
    const isWin = res != null && (res.position === 1 || res.positionLabel === 'won');
    if (isWin && res && typeof res.sp === 'number') {
      if (!best || res.sp > best.sp) {
        best = { sp: res.sp, runnerName: pick.runnerName ?? '', raceName: race.name };
      }
    }
  }
  return best;
}
