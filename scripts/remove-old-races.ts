/**
 * Remove race days whose last race was more than 2 days ago, and only when every
 * competition linked to that race_day has festival_end_date more than 2 days ago.
 * So we never delete a race_day that is part of a competition still "active"
 * (e.g. Cheltenham 4-day festival: no day is deleted until the whole festival is over + 2 days).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Run daily (e.g. after pull-races or on a separate schedule).
 */

import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const DAYS_AFTER_LAST_RACE = 2;

async function main() {
  console.log('[remove-old-races] Env check:', {
    SUPABASE_URL: SUPABASE_URL ? `set (${SUPABASE_URL.length} chars)` : 'MISSING',
    SUPABASE_SERVICE_KEY: SUPABASE_KEY ? 'set' : 'MISSING',
  });

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - DAYS_AFTER_LAST_RACE);
  const cutoffIso = cutoff.toISOString();
  const cutoffDateStr = cutoff.toISOString().slice(0, 10);

  // 1. Per race_day: latest scheduled_time_utc (last race of that day)
  const { data: raceRows } = await supabase
    .from('races')
    .select('race_day_id, scheduled_time_utc');
  const races = (raceRows ?? []) as { race_day_id: string; scheduled_time_utc: string }[];

  const lastRaceByDay = new Map<string, string>();
  for (const r of races) {
    const t = r.scheduled_time_utc;
    if (!t || !r.race_day_id) continue;
    const existing = lastRaceByDay.get(r.race_day_id);
    if (!existing || t > existing) lastRaceByDay.set(r.race_day_id, t);
  }

  // 2. Candidate race_days: last race (or race_date if no races) more than 2 days ago
  const { data: raceDayRows } = await supabase
    .from('race_days')
    .select('id, race_date');
  const allRaceDays = (raceDayRows ?? []) as { id: string; race_date: string }[];

  const candidateRaceDayIds: string[] = [];
  for (const rd of allRaceDays) {
    const lastRaceUtc = lastRaceByDay.get(rd.id);
    if (lastRaceUtc) {
      if (lastRaceUtc < cutoffIso) candidateRaceDayIds.push(rd.id);
    } else {
      // No races: use race_date as proxy (treat as "over" when race_date + 2 days < today)
      if (rd.race_date && rd.race_date < cutoffDateStr) candidateRaceDayIds.push(rd.id);
    }
  }

  if (candidateRaceDayIds.length === 0) {
    console.log('No race_days with last race (or race_date) more than 2 days ago.');
    console.log('Done');
    return;
  }

  // 3. For each candidate, check: every linked competition has festival_end_date < cutoff date
  const { data: crdRows } = await supabase
    .from('competition_race_days')
    .select('race_day_id, competition_id')
    .in('race_day_id', candidateRaceDayIds);
  const links = (crdRows ?? []) as { race_day_id: string; competition_id: string }[];

  const compIdsByRaceDay = new Map<string, string[]>();
  for (const l of links) {
    const list = compIdsByRaceDay.get(l.race_day_id) ?? [];
    if (!list.includes(l.competition_id)) list.push(l.competition_id);
    compIdsByRaceDay.set(l.race_day_id, list);
  }

  const allCompIds = [...new Set(links.map((l) => l.competition_id))];
  const { data: compRows } = await supabase
    .from('competitions')
    .select('id, festival_end_date')
    .in('id', allCompIds);
  const comps = (compRows ?? []) as { id: string; festival_end_date: string }[];
  const compEndDate = new Map<string, string>();
  for (const c of comps) compEndDate.set(c.id, c.festival_end_date ?? '');

  const idsToDelete: string[] = [];
  for (const raceDayId of candidateRaceDayIds) {
    const compIds = compIdsByRaceDay.get(raceDayId) ?? [];
    if (compIds.length === 0) {
      idsToDelete.push(raceDayId);
      continue;
    }
    const allOver = compIds.every((cid) => {
      const endDate = compEndDate.get(cid) ?? '';
      return endDate !== '' && endDate < cutoffDateStr;
    });
    if (allOver) idsToDelete.push(raceDayId);
  }

  if (idsToDelete.length === 0) {
    console.log('No race_days to remove (all are linked to a competition still within 2 days of festival_end_date).');
    console.log('Done');
    return;
  }

  const { data: deleted, error } = await supabase
    .from('race_days')
    .delete()
    .in('id', idsToDelete)
    .select('id, race_date, course');

  if (error) {
    console.error('Delete race_days', error);
    process.exit(1);
  }

  const count = deleted?.length ?? 0;
  if (count > 0) {
    console.log(`Removed ${count} race day(s): last race > ${DAYS_AFTER_LAST_RACE} days ago and all linked competitions over.`);
    for (const d of deleted ?? []) {
      console.log(`  - ${(d as { course: string; race_date: string }).course} ${(d as { race_date: string }).race_date}`);
    }
  }
  console.log('Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
