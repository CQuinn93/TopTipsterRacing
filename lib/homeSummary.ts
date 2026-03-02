/**
 * Compute user's points summary for the home dashboard (total points, highest SP win, daily points).
 * Uses DB points (pos_points + sp_points) from race results.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { Race, RaceResult } from '@/types/races';
import { fetchRaceDaysForCompetition } from './raceDaysForCompetition';

export type HomeSummary = {
  totalPoints: number;
  highestSpWin: number | null;
  dailyPoints: number;
  /** Max points scored on any single race day (overall only). */
  highestDailyPoints?: number;
};

export type HomeSummaryByComp = {
  overall: HomeSummary;
  byComp: Record<string, { name: string } & HomeSummary>;
};

function getResultForPick(race: Race, runnerId: string): RaceResult | null {
  const results = race.results ?? {};
  if (runnerId === 'FAV') {
    // Prefer FAV row result when present (set by update-race-results)
    if (results['FAV']) return results['FAV'] as RaceResult;
    const favId = Object.entries(results).reduce<string | null>((best, [id, r]) => {
      const sp = (r as RaceResult)?.sp ?? Infinity;
      return !best || sp < ((results[best] as RaceResult)?.sp ?? Infinity) ? id : best;
    }, null);
    return favId ? (results[favId] as RaceResult) : null;
  }
  return (results[runnerId] as RaceResult) ?? null;
}

export async function fetchHomeSummaryByComp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  competitionIds: string[]
): Promise<HomeSummaryByComp> {
  const empty: HomeSummary = { totalPoints: 0, highestSpWin: null, dailyPoints: 0 };
  const byComp: Record<string, { name: string } & HomeSummary> = {};
  competitionIds.forEach((id) => {
    byComp[id] = { name: 'Competition', ...empty };
  });

  if (!competitionIds.length) {
    return { overall: { ...empty }, byComp };
  }

  const compNamesRes = await supabase
    .from('competitions')
    .select('id, name')
    .in('id', competitionIds);
  const compNames = new Map<string, string>();
  for (const row of compNamesRes.data ?? []) {
    const r = row as { id: string; name: string };
    compNames.set(r.id, r.name ?? 'Competition');
  }
  competitionIds.forEach((id) => {
    if (byComp[id]) byComp[id].name = compNames.get(id) ?? 'Competition';
  });

  const [selRes, ...daysPerComp] = await Promise.all([
    supabase
      .from('daily_selections')
      .select('competition_id, user_id, race_date, selections')
      .eq('user_id', userId)
      .in('competition_id', competitionIds),
    ...competitionIds.map((compId) =>
      fetchRaceDaysForCompetition(supabase, compId, 'id, race_date, races')
    ),
  ]);

  const raceByKey = new Map<string, Race>();
  competitionIds.forEach((compId, i) => {
    const days = (daysPerComp[i] ?? []) as { race_date: string; races: Race[] }[];
    for (const d of days) {
      for (const r of d.races ?? []) {
        raceByKey.set(`${compId}:${d.race_date}:${r.id}`, r);
      }
    }
  });

  const pointsByDate: Record<string, number> = {};
  const pointsByDateByComp: Record<string, Record<string, number>> = {};
  let totalPoints = 0;
  let highestSpWin: number | null = null;

  for (const row of selRes.data ?? []) {
    const r = row as { competition_id: string; user_id: string; race_date: string; selections: Record<string, { runnerId?: string }> | null };
    if (r.user_id !== userId || !r.selections) continue;
    const compId = r.competition_id;
    const raceDate = r.race_date;
    let dayPoints = 0;
    if (!pointsByDateByComp[compId]) pointsByDateByComp[compId] = {};
    for (const [raceId, sel] of Object.entries(r.selections)) {
      if (!sel?.runnerId) continue;
      const race = raceByKey.get(`${compId}:${raceDate}:${raceId}`);
      const result = race ? getResultForPick(race, sel.runnerId) : null;
      const pts = result != null && (result.pos_points != null || result.sp_points != null)
        ? (result.pos_points ?? 0) + (result.sp_points ?? 0)
        : 0;
      totalPoints += pts;
      dayPoints += pts;
      if (byComp[compId]) {
        byComp[compId].totalPoints += pts;
        if (result?.position === 1 && typeof result.sp === 'number') {
          if (byComp[compId].highestSpWin === null || result.sp > byComp[compId].highestSpWin!) {
            byComp[compId].highestSpWin = result.sp;
          }
        }
      }
      if (result?.position === 1 && typeof result.sp === 'number') {
        if (highestSpWin === null || result.sp > highestSpWin) highestSpWin = result.sp;
      }
    }
    if (dayPoints > 0) {
      pointsByDate[raceDate] = (pointsByDate[raceDate] ?? 0) + dayPoints;
      if (pointsByDateByComp[compId]) {
        pointsByDateByComp[compId][raceDate] = (pointsByDateByComp[compId][raceDate] ?? 0) + dayPoints;
      }
    }
  }

  const datesWithPoints = Object.keys(pointsByDate).sort();
  const latestDate = datesWithPoints[datesWithPoints.length - 1] ?? null;
  const dailyPoints = latestDate ? (pointsByDate[latestDate] ?? 0) : 0;
  const highestDailyPoints =
    Object.keys(pointsByDate).length > 0 ? Math.max(0, ...Object.values(pointsByDate)) : 0;

  Object.keys(byComp).forEach((compId) => {
    const dates = Object.keys(pointsByDateByComp[compId] ?? {}).sort();
    const last = dates[dates.length - 1];
    byComp[compId].dailyPoints = last ? (pointsByDateByComp[compId]![last] ?? 0) : 0;
  });

  return {
    overall: { totalPoints, highestSpWin, dailyPoints, highestDailyPoints },
    byComp,
  };
}
