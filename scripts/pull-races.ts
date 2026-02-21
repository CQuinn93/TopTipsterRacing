/**
 * Pull race data from RapidAPI Horse Racing into Supabase.
 * Uses RAPIDAPI_KEY_PULL_RACES (separate key from update-race-results).
 *
 * Cron: every 30 min from 13:00 to 19:00 (14 runs). Once race data exists for the day,
 * later runs exit after a quick DB check with no API calls.
 *
 * Flow:
 * 1) DB: Find competitions where tomorrow is in [festival_start_date, festival_end_date]; get their course(s).
 * 2) DB: Check race_days for target date – if every course already has a meeting for that day, exit (no API calls).
 * 3) API: One call GET /racecards?date=tomorrow; filter by courses that still need data.
 * 4) API: One call per race GET /race/{id} for runner details (with delay).
 * 5) DB: Upsert race_days, insert races, insert horses, upsert competition_race_days, set app_config.
 *
 * Rate limit: 10 requests/min, 50/day (free tier). Delay 6s = 10/min (fastest safe); override RACE_FETCH_DELAY_MS.
 */

import 'dotenv/config';
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY_PULL_RACES;

/** Delay in ms between each GET /race/{id} call. 10/min limit → 6s min spacing; 6s = fastest within limit. */
const DEFAULT_RACE_FETCH_DELAY_MS = 6_000;
const RACE_FETCH_DELAY_MS = Number(process.env.RACE_FETCH_DELAY_MS) || DEFAULT_RACE_FETCH_DELAY_MS;

const API_BASE = 'https://horse-racing.p.rapidapi.com';
const API_HEADERS: Record<string, string> = {
  'x-rapidapi-key': RAPIDAPI_KEY ?? '',
  'x-rapidapi-host': 'horse-racing.p.rapidapi.com',
};

type RacecardItem = {
  id_race: string;
  title: string;
  course: string;
  date: string;
  distance?: string;
  going?: string;
  finished?: string;
};

type HorseItem = {
  id_horse?: string;
  horse: string;
  number?: number | string;
  odds?: Array<{ odd: string }>;
  sp?: string;
  jockey?: string;
  trainer?: string;
  age?: string;
  weight?: string;
  last_ran_days_ago?: string;
  non_runner?: string;
  form?: string;
  owner?: string;
};

type RaceDetailResponse = {
  horses?: HorseItem[];
  title?: string;
  date?: string;
};

function toStr(v: unknown): string | null {
  if (v == null) return null;
  return String(v);
}

async function fetchRacecards(date: string): Promise<RacecardItem[]> {
  const url = `${API_BASE}/racecards?date=${date}`;
  const res = await fetch(url, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`racecards ${date}: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchRaceDetail(idRace: string): Promise<RaceDetailResponse> {
  const url = `${API_BASE}/race/${idRace}`;
  const res = await fetch(url, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`race/${idRace}: ${res.status}`);
  return res.json();
}

function courseMatches(apiCourse: string, filter: string): boolean {
  return apiCourse?.toLowerCase().includes(filter.toLowerCase().trim()) ?? false;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getTargetDate(): string {
  const d = new Date();
  d.setDate(d.getDate());
  return d.toISOString().slice(0, 10);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY)');
    process.exit(1);
  }
  if (!RAPIDAPI_KEY) {
    console.error('Set RAPIDAPI_KEY_PULL_RACES for horse-racing.p.rapidapi.com');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const targetDate = getTargetDate();

  // 1) DB: Competitions where target date is in [festival_start_date, festival_end_date]; get their course (one per competition)
  const { data: comps } = await supabase
    .from('competitions')
    .select('id')
    .lte('festival_start_date', targetDate)
    .gte('festival_end_date', targetDate);

  if (!comps?.length) {
    console.log('No competitions active for', targetDate);
    return;
  }

  const compIds = comps.map((c: { id: string }) => c.id);
  const { data: courseRows } = await supabase
    .from('competition_courses')
    .select('competition_id, course')
    .in('competition_id', compIds);

  const activeCompetitions = (courseRows ?? []) as { competition_id: string; course: string }[];
  const courses = [...new Set(activeCompetitions.map((r) => r.course.trim()).filter(Boolean))];
  if (courses.length === 0) {
    console.log('No courses configured for active competitions');
    return;
  }

  console.log('Target date:', targetDate);
  console.log('Courses from DB:', courses.join(', '));

  // 2) DB: Check which courses already have a race_day for target date (same matching as API filter)
  const { data: existingRaceDays } = await supabase
    .from('race_days')
    .select('course')
    .eq('race_date', targetDate);

  const existingList = (existingRaceDays ?? []) as { course: string }[];
  const hasDataForCourse = (compCourse: string): boolean =>
    existingList.some((r) => courseMatches(r.course ?? '', compCourse));

  const coursesToFetch = courses.filter((c) => !hasDataForCourse(c));
  if (coursesToFetch.length === 0) {
    console.log('All courses already have race data for', targetDate, '- skipping API.');
    return;
  }
  console.log('Courses needing data:', coursesToFetch.join(', '));

  // 3) API: One call for racecards
  let racecards: RacecardItem[];
  try {
    racecards = await fetchRacecards(targetDate);
  } catch (e) {
    console.error('fetchRacecards', targetDate, e);
    return;
  }

  // Filter to races we care about (only courses that still need data)
  const allFiltered: { course: string; card: RacecardItem }[] = [];
  for (const course of coursesToFetch) {
    for (const card of racecards) {
      if (courseMatches(card.course, course)) allFiltered.push({ course: card.course, card });
    }
  }

  // 3) Collect data: by course -> { racesForDb, firstRaceUtc }
  type CourseData = {
    racesForDb: Array<{
      api_race_id: string;
      name: string;
      scheduledTimeUtc: string;
      distance?: string;
      is_handicap: boolean;
      horses: Array<{
        api_horse_id: string;
        name: string;
        jockey: string | null;
        trainer: string | null;
        age: string | null;
        weight: string | null;
        number: string | null;
        last_ran_days_ago: string | null;
        non_runner: string;
        form: string | null;
        owner: string | null;
        odds_decimal: number | null;
      }>;
    }>;
    firstRaceUtc: string;
  };
  const byCourse = new Map<string, CourseData>();

  for (let i = 0; i < allFiltered.length; i++) {
    if (i > 0) await delay(RACE_FETCH_DELAY_MS);
    const { course: courseName, card } = allFiltered[i];
    console.log(`  Getting race #${i + 1} of ${allFiltered.length} (${card.id_race})`);
    try {
      const detail = await fetchRaceDetail(card.id_race);
      const horses = detail?.horses ?? [];
      const scheduledTimeUtc = detail?.date ?? card.date ?? `${targetDate}T12:00:00.000Z`;
      const title = (card.title ?? detail?.title ?? '').toLowerCase();
      const is_handicap = title.includes('handicap');

      if (!byCourse.has(courseName)) {
        byCourse.set(courseName, { racesForDb: [], firstRaceUtc: '' });
      }
      const data = byCourse.get(courseName)!;
      if (!data.firstRaceUtc || scheduledTimeUtc < data.firstRaceUtc) data.firstRaceUtc = scheduledTimeUtc;

      data.racesForDb.push({
        api_race_id: String(card.id_race),
        name: card.title ?? detail?.title ?? '',
        scheduledTimeUtc,
        distance: card.distance,
        is_handicap,
        horses: horses.map((h) => {
          const oddsStr = h.odds?.[0]?.odd ?? h.sp;
          const oddsDecimal = oddsStr != null ? parseFloat(String(oddsStr)) : null;
          return {
            api_horse_id: String(h.id_horse ?? ''),
            name: h.horse ?? '',
            jockey: toStr(h.jockey),
            trainer: toStr(h.trainer),
            age: toStr(h.age),
            weight: toStr(h.weight),
            number: toStr(h.number),
            last_ran_days_ago: toStr(h.last_ran_days_ago),
            non_runner: h.non_runner != null ? String(h.non_runner) : '0',
            form: toStr(h.form),
            owner: toStr(h.owner),
            odds_decimal: oddsDecimal != null && Number.isFinite(oddsDecimal) ? oddsDecimal : null,
          };
        }),
      });
    } catch (e) {
      console.error(`  race ${card.id_race}`, e);
    }
  }

  // 4) Bulk upload – race_days (course, date, first_race_utc); races + horses tables store full data
  const raceDaysToUpsert: { course: string; race_date: string; first_race_utc: string; updated_at: string }[] = [];
  for (const [courseName, data] of byCourse.entries()) {
    if (data.racesForDb.length === 0) continue;
    const firstUtc = data.firstRaceUtc || `${targetDate}T12:00:00.000Z`;
    raceDaysToUpsert.push({
      course: courseName,
      race_date: targetDate,
      first_race_utc: firstUtc,
      updated_at: new Date().toISOString(),
    });
  }

  if (raceDaysToUpsert.length === 0) {
    console.log('No race data to upload');
    return;
  }

  const { data: upsertedRaceDays, error: raceDaysErr } = await supabase
    .from('race_days')
    .upsert(raceDaysToUpsert, { onConflict: 'course,race_date' })
    .select('id, course');

  if (raceDaysErr || !upsertedRaceDays?.length) {
    console.error('race_days upsert', raceDaysErr);
    return;
  }

  const courseToRaceDayId = new Map<string, string>();
  const raceDayIdToCourse = new Map<string, string>();
  for (const row of upsertedRaceDays as { id: string; course: string }[]) {
    courseToRaceDayId.set(row.course, row.id);
    raceDayIdToCourse.set(row.id, row.course);
  }

  const raceDayIds = upsertedRaceDays.map((r: { id: string }) => r.id);

  // Delete existing races (and horses via cascade or explicit)
  const { data: existingRaces } = await supabase.from('races').select('id').in('race_day_id', raceDayIds);
  const existingRaceIds = (existingRaces ?? []).map((r: { id: string }) => r.id);
  if (existingRaceIds.length > 0) {
    await supabase.from('horses').delete().in('race_id', existingRaceIds);
    await supabase.from('races').delete().in('race_day_id', raceDayIds);
  }

  const racesToInsert: { race_day_id: string; api_race_id: string; name: string; scheduled_time_utc: string; distance: string | null; is_handicap: boolean }[] = [];
  for (const [courseName, data] of byCourse.entries()) {
    const raceDayId = courseToRaceDayId.get(courseName);
    if (!raceDayId || data.racesForDb.length === 0) continue;
    for (const r of data.racesForDb) {
      racesToInsert.push({
        race_day_id: raceDayId,
        api_race_id: r.api_race_id,
        name: r.name,
        scheduled_time_utc: r.scheduledTimeUtc,
        distance: r.distance ?? null,
        is_handicap: r.is_handicap,
      });
    }
  }

  const { data: insertedRaces, error: racesErr } = await supabase
    .from('races')
    .insert(racesToInsert)
    .select('id, api_race_id, race_day_id');

  if (racesErr || !insertedRaces?.length) {
    console.error('races insert', racesErr);
    return;
  }

  const horsesToInsert: Array<{
    race_id: string;
    api_horse_id: string;
    name: string;
    jockey: string | null;
    trainer: string | null;
    age: string | null;
    weight: string | null;
    number: string | null;
    last_ran_days_ago: string | null;
    non_runner: string;
    form: string | null;
    owner: string | null;
    odds_decimal: number | null;
  }> = [];

  for (const row of insertedRaces as { id: string; api_race_id: string; race_day_id: string }[]) {
    const courseName = raceDayIdToCourse.get(row.race_day_id);
    if (!courseName) continue;
    const data = byCourse.get(courseName);
    if (!data) continue;
    const raceData = data.racesForDb.find((r) => r.api_race_id === row.api_race_id);
    if (!raceData) continue;
    for (const h of raceData.horses) {
      horsesToInsert.push({
        race_id: row.id,
        api_horse_id: h.api_horse_id || `gen-${row.id}-${h.name}`,
        name: h.name,
        jockey: h.jockey,
        trainer: h.trainer,
        age: h.age,
        weight: h.weight,
        number: h.number,
        last_ran_days_ago: h.last_ran_days_ago,
        non_runner: h.non_runner,
        form: h.form,
        owner: h.owner,
        odds_decimal: h.odds_decimal,
      });
    }
  }

  if (horsesToInsert.length > 0) {
    const { error: horsesErr } = await supabase.from('horses').insert(horsesToInsert);
    if (horsesErr) console.error('horses insert', horsesErr);
  }

  const competitionRaceDaysToUpsert = activeCompetitions
    .filter((c) => courseToRaceDayId.has(c.course))
    .map((c) => ({ competition_id: c.competition_id, race_day_id: courseToRaceDayId.get(c.course)! }));

  if (competitionRaceDaysToUpsert.length > 0) {
    await supabase.from('competition_race_days').upsert(competitionRaceDaysToUpsert, { onConflict: 'competition_id,race_day_id' });
  }

  // Set app_config: 50 min before first race (for selections bulk refresh)
  const allFirstRaceUtc = [...byCourse.values()].map((d) => d.firstRaceUtc).filter(Boolean);
  const earliestFirst = allFirstRaceUtc.length ? allFirstRaceUtc.reduce((a, b) => (a < b ? a : b)) : null;
  if (earliestFirst) {
    const refreshAt = new Date(new Date(earliestFirst).getTime() - 50 * 60 * 1000).toISOString();
    const { error } = await supabase.from('app_config').upsert(
      { key: 'selections_refresh_after_utc', value: { utc: refreshAt }, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );
    if (error) {
      console.warn('  app_config update skipped (run migration 023 if needed):', error.message);
    } else {
      console.log('  selections_refresh_after_utc:', refreshAt);
    }
  }

  const totalRaces = racesToInsert.length;
  console.log(`  Upserted ${upsertedRaceDays.length} race day(s), ${totalRaces} races, ${horsesToInsert.length} horses`);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
