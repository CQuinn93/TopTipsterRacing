/**
 * Fetch race results from RapidAPI and update DB: races (Winner, Place 1–4) and horses (sp).
 * Run 30 minutes after each race start; if result is blank, cron can retry after 10 minutes.
 *
 * Logic:
 * 1. Get from DB the latest race where scheduled_time_utc + 30 min < now and winner_horse_id is null.
 * 2. GET /race/{api_race_id}. If no horses/positions, exit (retry later).
 * 3. Count runners where non_runner === '0'. Check title for "Handicap".
 * 4. Place rules:
 *    - Handicap & >= 16: 1,2,3,4
 *    - Handicap & < 16: 1,2,3
 *    - Not Handicap & >= 15: 1,2,3
 *    - Not Handicap & 8–14: 1,2
 *    - Not Handicap & 4–7: 1
 * 5. Update races (winner_horse_id, place1–4), horses (sp), and race_days.races[].results for the app.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, RAPIDAPI_KEY
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

const API_BASE = 'https://horse-racing.p.rapidapi.com';
const API_HEADERS: Record<string, string> = {
  'x-rapidapi-key': RAPIDAPI_KEY ?? '',
  'x-rapidapi-host': 'horse-racing.p.rapidapi.com',
};

const MINUTES_AFTER_RACE = 30;

type HorseResult = {
  id_horse?: string;
  horse: string;
  position?: string;
  sp?: string;
  non_runner?: string;
};

type RaceDetailResponse = {
  horses?: HorseResult[];
  title?: string;
};

function positionLabel(position: number): 'won' | 'place' | 'lost' {
  if (position === 1) return 'won';
  if (position === 2 || position === 3) return 'place';
  return 'lost';
}

async function fetchRaceDetail(idRace: string): Promise<RaceDetailResponse> {
  const url = `${API_BASE}/race/${idRace}`;
  const res = await fetch(url, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`race/${idRace}: ${res.status}`);
  return res.json();
}

/** Returns how many placed positions we store (1–4) from the place rules. */
function getPlacedPositions(isHandicap: boolean, totalRunners: number): number[] {
  if (isHandicap) {
    return totalRunners >= 16 ? [1, 2, 3, 4] : [1, 2, 3];
  }
  if (totalRunners >= 15) return [1, 2, 3];
  if (totalRunners > 7) return [1, 2];
  if (totalRunners >= 4) return [1];
  return [];
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  if (!RAPIDAPI_KEY) {
    console.error('Set RAPIDAPI_KEY');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const after = new Date();
  after.setMinutes(after.getMinutes() - MINUTES_AFTER_RACE);

  const { data: raceRows } = await supabase
    .from('races')
    .select('id, race_day_id, api_race_id, name')
    .is('winner_horse_id', null)
    .lt('scheduled_time_utc', after.toISOString())
    .order('scheduled_time_utc', { ascending: false })
    .limit(1);

  const raceRow = raceRows?.[0];
  if (!raceRow) {
    console.log('No race due for results (scheduled 30+ min ago, no winner yet).');
    return;
  }

  console.log('Processing race:', raceRow.name, raceRow.api_race_id);

  let detail: RaceDetailResponse;
  try {
    detail = await fetchRaceDetail(raceRow.api_race_id);
  } catch (e) {
    console.error('API fetch failed (retry in 10 min):', e);
    process.exit(1);
  }

  const horses = detail?.horses ?? [];
  const validHorses = horses.filter((h) => String(h.non_runner ?? '0') === '0');
  const totalRunners = validHorses.length;

  const hasPositions = validHorses.some((h) => h.position != null && h.position !== '' && h.position !== 'ur');
  if (!hasPositions || totalRunners === 0) {
    console.log('No confirmed positions yet (retry in 10 min).');
    return;
  }

  const title = (detail?.title ?? raceRow.name ?? '').toLowerCase();
  const isHandicap = title.includes('handicap');
  const placedPositions = getPlacedPositions(isHandicap, totalRunners);

  const { data: horseRows } = await supabase
    .from('horses')
    .select('id, api_horse_id, name')
    .eq('race_id', raceRow.id);

  const byApiId = new Map<string, { id: string }>();
  const byName = new Map<string, { id: string }>();
  for (const h of horseRows ?? []) {
    byApiId.set(String(h.api_horse_id), { id: h.id });
    byName.set((h.name ?? '').trim().toLowerCase(), { id: h.id });
  }

  const getHorseId = (h: HorseResult): string | null => {
    const id = h.id_horse != null ? byApiId.get(String(h.id_horse))?.id : null;
    if (id) return id;
    return byName.get((h.horse ?? '').trim().toLowerCase())?.id ?? null;
  };

  const byPosition = new Map<number, { horseId: string; sp: number }>();
  const resultByApiIdOrName = new Map<string, { position: number; positionLabel: 'won' | 'place' | 'lost'; sp: number }>();

  for (const h of validHorses) {
    const posStr = h.position;
    if (posStr === 'ur' || posStr === undefined || posStr === '') continue;
    const position = parseInt(posStr, 10);
    if (!Number.isFinite(position)) continue;
    const sp = h.sp != null ? parseFloat(String(h.sp)) : 0;
    const horseId = getHorseId(h);
    const key = (h.id_horse ?? h.horse ?? '').toString();
    const keyName = (h.horse ?? '').trim().toLowerCase();
    if (horseId) {
      const entry = { position, positionLabel: positionLabel(position), sp: Number.isFinite(sp) ? sp : 0 };
      if (key) resultByApiIdOrName.set(key, entry);
      resultByApiIdOrName.set(keyName, entry);
      if (placedPositions.includes(position)) {
        byPosition.set(position, { horseId, sp: Number.isFinite(sp) ? sp : 0 });
      }
    }
  }

  const winnerId = byPosition.get(1)?.horseId ?? null;
  const place1Id = byPosition.get(1)?.horseId ?? null;
  const place2Id = byPosition.get(2)?.horseId ?? null;
  const place3Id = byPosition.get(3)?.horseId ?? null;
  const place4Id = byPosition.get(4)?.horseId ?? null;

  await supabase
    .from('races')
    .update({
      winner_horse_id: winnerId,
      place1_horse_id: place1Id,
      place2_horse_id: place2Id,
      place3_horse_id: place3Id,
      place4_horse_id: place4Id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', raceRow.id);

  for (const h of validHorses) {
    const posStr = h.position;
    if (posStr === 'ur' || posStr === undefined) continue;
    const position = parseInt(posStr, 10);
    if (!Number.isFinite(position)) continue;
    const sp = h.sp != null ? parseFloat(String(h.sp)) : null;
    const horseId = getHorseId(h);
    if (horseId && sp != null && Number.isFinite(sp)) {
      await supabase.from('horses').update({ sp, updated_at: new Date().toISOString() }).eq('id', horseId);
    }
  }

  const { data: raceDay } = await supabase
    .from('race_days')
    .select('id, races')
    .eq('id', raceRow.race_day_id)
    .single();

  if (raceDay?.races && Array.isArray(raceDay.races)) {
    const races = raceDay.races as Array<{
      id: string;
      runners?: Array<{ id: string; name?: string }>;
      results?: Record<string, unknown>;
    }>;
    const updated = races.map((r) => {
      if (r.id !== raceRow.api_race_id) return r;
      const results: Record<string, { position: number; positionLabel: 'won' | 'place' | 'lost'; sp: number }> = {};
      for (const run of r.runners ?? []) {
        const entry = resultByApiIdOrName.get(run.id) ?? resultByApiIdOrName.get((run.name ?? '').trim().toLowerCase());
        if (entry) results[run.id] = entry;
      }
      return { ...r, results: Object.keys(results).length ? results : undefined };
    });
    await supabase
      .from('race_days')
      .update({ races: updated, updated_at: new Date().toISOString() })
      .eq('id', raceRow.race_day_id);
  }

  console.log('Updated results for race', raceRow.api_race_id);
  console.log('Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
