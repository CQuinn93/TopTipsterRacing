
/**
 * Same as update-race-results.ts but runs for ALL races that took place TODAY (race_date = today UTC).
 * Use this to backfill or re-run results for every race on today's card. Uses the same upsert-style
 * updates (UPDATE by id) so safe to run when data already exists.
 *
 * Process (identical to update-race-results per race):
 * 1. Select race_days where race_date = today (UTC), then all races for those race days.
 * 2. For each race: GET /race/{api_race_id} from RapidAPI.
 * 3. If results ready: update horses (non_runner, position, result_code, sp, is_fav, pos_points, sp_points);
 *    set FAV row from winning favourite; mark race is_finished; replace any non-runner user selections with FAV.
 * 4. If not ready: log "No results currently" and continue to next race.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, RAPIDAPI_KEY_UPDATE_RESULTS
 */

import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY_UPDATE_RESULTS;

const API_BASE = 'https://horse-racing.p.rapidapi.com';
const API_HEADERS: Record<string, string> = {
  'x-rapidapi-key': RAPIDAPI_KEY ?? '',
  'x-rapidapi-host': 'horse-racing.p.rapidapi.com',
};

type HorseResult = {
  id_horse?: string;
  horse: string;
  number?: string | number;
  position?: string;
  sp?: string;
  non_runner?: string;
};

type RaceDetailResponse = {
  horses?: HorseResult[];
  title?: string;
};

async function fetchRaceDetail(idRace: string): Promise<RaceDetailResponse> {
  const url = `${API_BASE}/race/${idRace}`;
  const res = await fetch(url, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`race/${idRace}: ${res.status}`);
  return res.json();
}

function getPlacedPositions(isHandicap: boolean, totalRunners: number): number[] {
  if (isHandicap) {
    return totalRunners >= 16 ? [1, 2, 3, 4] : [1, 2, 3];
  }
  if (totalRunners >= 8) return [1, 2, 3];
  if (totalRunners >= 5) return [1, 2];
  if (totalRunners >= 1) return [1];
  return [];
}

type RaceRow = { id: string; race_day_id: string; api_race_id: string; name: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processOneRace(supabase: any, raceRow: RaceRow, pointsRows: { min_decimal: string | number; max_decimal: string | number; points: number; type: string }[]): Promise<boolean> {
  let detail: RaceDetailResponse;
  try {
    detail = await fetchRaceDetail(raceRow.api_race_id);
  } catch (e) {
    console.error(`API fetch failed for ${raceRow.api_race_id}:`, e);
    return false;
  }

  const horses = detail?.horses ?? [];
  const validHorses = horses.filter((h) => String(h.non_runner ?? '0') === '0');
  const totalRunners = validHorses.length;

  const hasPositions = validHorses.some((h) => h.position != null && String(h.position).trim() !== '');
  if (!hasPositions || totalRunners === 0) {
    console.log(`  ${raceRow.name} (${raceRow.api_race_id}): No results currently, will check on next run.`);
    return false;
  }

  const { data: horseRows } = await supabase
    .from('horses')
    .select('id, api_horse_id, name, number')
    .eq('race_id', raceRow.id);

  const byApiId = new Map<string, { id: string; number: string | null }>();
  const byName = new Map<string, { id: string; number: string | null }>();
  for (const h of horseRows ?? []) {
    const entry = { id: h.id, number: h.number ?? null };
    byApiId.set(String(h.api_horse_id), entry);
    byName.set((h.name ?? '').trim().toLowerCase(), entry);
  }

  const getHorseId = (h: HorseResult): string | null => {
    const id = h.id_horse != null ? byApiId.get(String(h.id_horse))?.id : null;
    if (id) return id;
    return byName.get((h.horse ?? '').trim().toLowerCase())?.id ?? null;
  };

  const now = new Date().toISOString();
  for (const h of horses) {
    const horseId = getHorseId(h);
    if (!horseId) continue;
    const nr = String(h.non_runner ?? '0').trim() !== '0' ? '1' : '0';
    await supabase.from('horses').update({ non_runner: nr, updated_at: now }).eq('id', horseId);
  }

  type HorseUpdate = { horseId: string; position: number | null; resultCode: string | null; sp: number; number: number };
  const horsesToUpdate: HorseUpdate[] = [];
  const spByHorseId = new Map<string, number>();
  const numberByHorseId = new Map<string, number>();

  const favRowId = byApiId.get('FAV')?.id ?? null;

  for (const h of validHorses) {
    const posStr = String(h.position ?? '').trim().toLowerCase();
    if (posStr === '') continue;
    const position = parseInt(posStr, 10);
    const isNumeric = Number.isFinite(position);
    const resultCode = isNumeric ? null : posStr;
    const sp = h.sp != null ? parseFloat(String(h.sp)) : 0;
    const horseId = getHorseId(h);
    if (!horseId || horseId === favRowId) continue;
    const num = h.number != null && Number.isFinite(parseFloat(String(h.number)))
      ? parseInt(String(h.number), 10) : Infinity;
    horsesToUpdate.push({
      horseId,
      position: isNumeric ? position : null,
      resultCode,
      sp: Number.isFinite(sp) ? sp : 0,
      number: Number.isFinite(num) ? num : Infinity,
    });
    if (isNumeric) {
      spByHorseId.set(horseId, Number.isFinite(sp) ? sp : 0);
      numberByHorseId.set(horseId, Number.isFinite(num) ? num : Infinity);
    }
  }

  const minSp = Math.min(...spByHorseId.values(), Infinity);
  const candidatesWithMinSp = minSp !== Infinity
    ? [...spByHorseId.entries()].filter(([, s]) => s === minSp).map(([id]) => ({ id, number: numberByHorseId.get(id) ?? Infinity }))
    : [];
  const favHorseIds: string[] = candidatesWithMinSp.length === 0
    ? []
    : [candidatesWithMinSp.sort((a, b) => a.number - b.number)[0].id];

  const title = (detail?.title ?? raceRow.name ?? '').toLowerCase();
  const isHandicap = title.includes('handicap');
  const placedPositions = getPlacedPositions(isHandicap, totalRunners);
  console.log(`  Placed positions: ${placedPositions.join(', ')} (handicap=${isHandicap}, runners=${totalRunners})`);

  function lookupRangePoints(sp: number, type: 'standard_win' | 'standard_place' | 'bonus_win' | 'bonus_place'): number {
    const rows = pointsRows.filter((r) => r.type === type);
    for (const r of rows) {
      const min = Number(r.min_decimal);
      const max = Number(r.max_decimal);
      if (Number.isFinite(min) && Number.isFinite(max) && sp >= min && sp <= max) return Number(r.points);
    }
    return 0;
  }

  function getPosPoints(position: number): number | null {
    if (pointsRows.length === 0) return null;
    const standardType = position === 1 ? 'standard_win' : 'standard_place';
    const pts = lookupRangePoints(0, standardType);
    return pts > 0 ? pts : (position === 1 ? 5 : 1);
  }

  function getSpPoints(sp: number, position: number): number | null {
    if (pointsRows.length === 0) return null;
    const bonusType = position === 1 ? 'bonus_win' : 'bonus_place';
    return lookupRangePoints(sp, bonusType);
  }

  await supabase.from('horses').update({ is_fav: false, updated_at: now }).eq('race_id', raceRow.id);

  let favPayload: { sp: number; position: number | null; result_code: string | null; pos_points: number; sp_points: number } | null = null;

  for (const { horseId, position, resultCode, sp } of horsesToUpdate) {
    const isFav = favHorseIds.includes(horseId);
    const isPlaced = position != null && placedPositions.includes(position);
    const payload: Record<string, unknown> = {
      position: position ?? null,
      result_code: resultCode ?? null,
      sp,
      is_fav: isFav,
      updated_at: now,
    };
    if (isPlaced && position != null) {
      const spPoints = getSpPoints(sp, position);
      const posPoints = getPosPoints(position);
      if (spPoints != null) payload.sp_points = spPoints;
      if (posPoints != null) payload.pos_points = posPoints;
    } else {
      payload.pos_points = 0;
      payload.sp_points = 0;
    }
    if (isFav) {
      favPayload = {
        sp,
        position: position ?? null,
        result_code: resultCode ?? null,
        pos_points: (payload.pos_points as number) ?? 0,
        sp_points: (payload.sp_points as number) ?? 0,
      };
    }
    await supabase.from('horses').update(payload).eq('id', horseId);
  }

  if (favRowId && favPayload) {
    await supabase
      .from('horses')
      .update({
        sp: favPayload.sp,
        position: favPayload.position,
        result_code: favPayload.result_code,
        pos_points: favPayload.pos_points,
        sp_points: favPayload.sp_points,
        updated_at: now,
      })
      .eq('id', favRowId);
  }

  await supabase
    .from('races')
    .update({ is_finished: true, updated_at: now })
    .eq('id', raceRow.id);

  const { data: dbNonRunners } = await supabase
    .from('horses')
    .select('api_horse_id, name')
    .eq('race_id', raceRow.id)
    .eq('non_runner', '1');

  const nonRunnerApiIds = new Set((dbNonRunners ?? []).map((r: { api_horse_id: string }) => String(r.api_horse_id).trim()).filter(Boolean));
  const nonRunnerNames = new Set((dbNonRunners ?? []).map((r: { name: string }) => (r.name ?? '').trim().toLowerCase()).filter(Boolean));

  if (nonRunnerApiIds.size > 0 || nonRunnerNames.size > 0) {
    const { data: raceDay } = await supabase
      .from('race_days')
      .select('race_date')
      .eq('id', raceRow.race_day_id)
      .single();

    if (raceDay?.race_date) {
      const { data: crdRows } = await supabase
        .from('competition_race_days')
        .select('competition_id')
        .eq('race_day_id', raceRow.race_day_id);
      const compIds = [...new Set((crdRows ?? []).map((r: { competition_id: string }) => r.competition_id))];

      if (compIds.length > 0) {
        const { data: selRows } = await supabase
          .from('daily_selections')
          .select('id, user_id, competition_id, race_date, selections')
          .eq('race_date', raceDay.race_date)
          .in('competition_id', compIds);

        const apiRaceId = raceRow.api_race_id;
        const FAV_SELECTION = { runnerId: 'FAV', runnerName: 'FAV', oddsDecimal: 0 };
        const toUpsert: Array<{ id: string; competition_id: string; user_id: string; race_date: string; selections: Record<string, unknown>; updated_at: string }> = [];

        for (const row of selRows ?? []) {
          const sel = (row.selections ?? {}) as Record<string, { runnerId?: string; runnerName?: string; oddsDecimal?: number }>;
          const raceSel = sel[apiRaceId];
          if (!raceSel) continue;

          const runnerId = String(raceSel.runnerId ?? '').trim();
          const runnerName = (raceSel.runnerName ?? '').trim().toLowerCase();
          const isNonRunner =
            (runnerId && nonRunnerApiIds.has(runnerId)) || (runnerName && nonRunnerNames.has(runnerName));

          if (isNonRunner) {
            const next = { ...sel, [apiRaceId]: FAV_SELECTION };
            toUpsert.push({
              id: row.id,
              competition_id: row.competition_id,
              user_id: row.user_id,
              race_date: row.race_date,
              selections: next,
              updated_at: now,
            });
          }
        }

        if (toUpsert.length > 0) {
          for (const u of toUpsert) {
            await supabase
              .from('daily_selections')
              .update({ selections: u.selections, updated_at: u.updated_at })
              .eq('id', u.id);
          }
          console.log(`Replaced ${toUpsert.length} non-runner selection(s) with FAV`);
        }
      }
    }
  }

  console.log(`  Updated results for race ${raceRow.api_race_id}`);
  return true;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

  console.log('[update-race-results-today] Env check:', {
    SUPABASE_URL: SUPABASE_URL ? `set (${SUPABASE_URL.length} chars)` : 'MISSING',
    SUPABASE_SERVICE_KEY: SUPABASE_KEY ? 'set' : 'MISSING',
    RAPIDAPI_KEY_UPDATE_RESULTS: RAPIDAPI_KEY ? 'set' : 'MISSING',
  });
  console.log('[update-race-results-today] Today (UTC):', today);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  if (!RAPIDAPI_KEY) {
    console.error('Set RAPIDAPI_KEY_UPDATE_RESULTS');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: dayRows } = await supabase
    .from('race_days')
    .select('id')
    .eq('race_date', today);

  const raceDayIds = (dayRows ?? []).map((r: { id: string }) => r.id).filter(Boolean);
  if (raceDayIds.length === 0) {
    console.log(`No race days found for today (race_date = ${today}).`);
    return;
  }

  const { data: raceRows } = await supabase
    .from('races')
    .select('id, race_day_id, api_race_id, name')
    .in('race_day_id', raceDayIds)
    .order('scheduled_time_utc', { ascending: true });

  const races = (raceRows ?? []) as RaceRow[];
  if (races.length === 0) {
    console.log(`No races found for today (${today}).`);
    return;
  }

  console.log(`Found ${races.length} race(s) for today (${today}).`);

  type PointsRow = { min_decimal: string | number; max_decimal: string | number; points: number; type: string };
  let pointsRows: PointsRow[] = [];
  const { data: pointsData } = await supabase.from('points_system').select('min_decimal, max_decimal, points, type');
  if (pointsData?.length) pointsRows = pointsData as PointsRow[];

  let updated = 0;
  for (const race of races) {
    console.log(`Processing: ${race.name} (${race.api_race_id})`);
    const ok = await processOneRace(supabase, race, pointsRows);
    if (ok) updated++;
  }

  console.log(`Done. Updated ${updated} of ${races.length} race(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
