
/**
 * Add FAV horse row for each race on today and tomorrow (race_date = today or tomorrow UTC).
 * Pull-races normally creates FAV rows when it runs; this script backfills them for races
 * that don't have one (e.g. today's races created before pull-races added FAV, or tomorrow
 * if something went wrong).
 *
 * Skips races that already have a FAV row (unique on race_id, api_horse_id).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function getDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function main() {
  const today = getDateUtc(new Date());
  const tomorrow = getDateUtc(new Date(Date.now() + 24 * 60 * 60 * 1000));

  console.log('[add-fav-rows] Env check:', {
    SUPABASE_URL: SUPABASE_URL ? `set (${SUPABASE_URL.length} chars)` : 'MISSING',
    SUPABASE_SERVICE_KEY: SUPABASE_KEY ? 'set' : 'MISSING',
  });
  console.log('[add-fav-rows] Target dates (UTC):', today, 'and', tomorrow);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const { data: dayRows } = await supabase
    .from('race_days')
    .select('id')
    .in('race_date', [today, tomorrow]);

  const raceDayIds = (dayRows ?? []).map((r: { id: string }) => r.id).filter(Boolean);
  if (raceDayIds.length === 0) {
    console.log(`No race days found for ${today} or ${tomorrow}.`);
    return;
  }

  const { data: raceRows } = await supabase
    .from('races')
    .select('id')
    .in('race_day_id', raceDayIds);

  const allRaceIds = (raceRows ?? []).map((r: { id: string }) => r.id).filter(Boolean);
  if (allRaceIds.length === 0) {
    console.log(`No races found for ${today} or ${tomorrow}.`);
    return;
  }

  const { data: existingFav } = await supabase
    .from('horses')
    .select('race_id')
    .eq('api_horse_id', 'FAV')
    .in('race_id', allRaceIds);

  const racesWithFav = new Set((existingFav ?? []).map((r: { race_id: string }) => r.race_id));
  const raceIdsNeedingFav = allRaceIds.filter((id) => !racesWithFav.has(id));

  if (raceIdsNeedingFav.length === 0) {
    console.log(`All ${allRaceIds.length} race(s) already have FAV row(s). Nothing to do.`);
    return;
  }

  const favHorsesToInsert = raceIdsNeedingFav.map((race_id) => ({
    race_id,
    api_horse_id: 'FAV',
    name: 'FAV',
    jockey: null,
    trainer: null,
    age: null,
    weight: null,
    number: null,
    last_ran_days_ago: null,
    non_runner: '0',
    form: null,
    owner: null,
    odds_decimal: null,
  }));

  const { error: favErr } = await supabase.from('horses').insert(favHorsesToInsert);
  if (favErr) {
    console.error('FAV horses insert failed:', favErr);
    process.exit(1);
  }

  console.log(`Inserted ${favHorsesToInsert.length} FAV row(s) (${allRaceIds.length - favHorsesToInsert.length} already had FAV).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
