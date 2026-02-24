/**
 * Backfill FAV for users who did not make a selection before the deadline.
 * Run after the selection deadline (1 hour before first race). For each race day
 * where the deadline has passed, set any missing per-race selections to FAV for
 * every participant in linked competitions.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Run via cron (e.g. every 15 min) or once after pull-races / before results.
 */

import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const SELECTION_CLOSE_HOURS_BEFORE_FIRST = 1;
const FAV_SELECTION = { runnerId: 'FAV', runnerName: 'FAV', oddsDecimal: 0 };

type RaceDayRow = { id: string; race_date: string; first_race_utc: string };

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const now = Date.now();
  const deadlineCutoff = new Date(now + SELECTION_CLOSE_HOURS_BEFORE_FIRST * 60 * 60 * 1000).toISOString();

  const { data: raceDaysRows, error: rdErr } = await supabase
    .from('race_days')
    .select('id, race_date, first_race_utc')
    .lte('first_race_utc', deadlineCutoff);

  if (rdErr) {
    console.error('Fetch race_days', rdErr);
    process.exit(1);
  }

  const raceDays = (raceDaysRows ?? []) as RaceDayRow[];
  const pastDeadline = raceDays.filter((rd) => {
    const deadline = new Date(rd.first_race_utc).getTime() - SELECTION_CLOSE_HOURS_BEFORE_FIRST * 60 * 60 * 1000;
    return deadline <= now;
  });

  if (pastDeadline.length === 0) {
    console.log('No race days past selection deadline.');
    return;
  }

  let updated = 0;

  for (const rd of pastDeadline) {
    const { data: raceRows } = await supabase
      .from('races')
      .select('api_race_id')
      .eq('race_day_id', rd.id);
    const raceIds = (raceRows ?? []).map((r: { api_race_id: string }) => r.api_race_id).filter(Boolean);
    if (raceIds.length === 0) continue;

    const { data: links } = await supabase
      .from('competition_race_days')
      .select('competition_id')
      .eq('race_day_id', rd.id);
    const compIds = [...new Set((links ?? []).map((l: { competition_id: string }) => l.competition_id))];
    if (compIds.length === 0) continue;

    for (const compId of compIds) {
      const { data: participants } = await supabase
        .from('competition_participants')
        .select('user_id')
        .eq('competition_id', compId);
      const userIds = (participants ?? []).map((p: { user_id: string }) => p.user_id);
      if (userIds.length === 0) continue;

      const { data: existingRows } = await supabase
        .from('daily_selections')
        .select('user_id, selections')
        .eq('competition_id', compId)
        .eq('race_date', rd.race_date)
        .in('user_id', userIds);

      const rows = (existingRows ?? []) as { user_id: string; selections: Record<string, unknown> | null }[];
      const toUpsert: Array<{ competition_id: string; user_id: string; race_date: string; selections: Record<string, unknown>; updated_at: string }> = [];

      for (const userId of userIds) {
        const row = rows.find((r) => r.user_id === userId);
        const current = (row?.selections && typeof row.selections === 'object' ? row.selections : {}) as Record<
          string,
          { runnerId: string; runnerName: string; oddsDecimal: number }
        >;
        let changed = false;
        const next: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }> = { ...current };
        for (const raceId of raceIds) {
          if (next[raceId] == null) {
            next[raceId] = FAV_SELECTION;
            changed = true;
          }
        }
        if (changed) {
          toUpsert.push({
            competition_id: compId,
            user_id: userId,
            race_date: rd.race_date,
            selections: next,
            updated_at: new Date().toISOString(),
          });
        }
      }

      if (toUpsert.length > 0) {
        const { error: upsertErr } = await supabase.from('daily_selections').upsert(toUpsert, {
          onConflict: 'competition_id,user_id,race_date',
        });
        if (upsertErr) {
          console.error('Upsert daily_selections', upsertErr);
          continue;
        }
        updated += toUpsert.length;
      }
    }
  }

  if (updated > 0) {
    console.log(`Backfilled FAV for ${updated} selection row(s).`);
  } else {
    console.log('No missing selections to backfill.');
  }
  console.log('Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
