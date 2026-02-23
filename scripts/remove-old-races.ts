/**
 * Remove race data older than 5 days to avoid filling the database.
 * Deletes race_days where race_date is more than 5 days ago (cascade deletes races and horses).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Run daily (e.g. after pull-races or on a separate schedule).
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function main() {
  // Debug: log env presence (never log secret values)
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

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 5);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const { data: deleted, error } = await supabase
    .from('race_days')
    .delete()
    .lt('race_date', cutoffStr)
    .select('id, race_date');

  if (error) {
    console.error('Delete race_days', error);
    process.exit(1);
  }

  const count = deleted?.length ?? 0;
  if (count > 0) {
    console.log(`Removed ${count} race day(s) with race_date before ${cutoffStr}`);
  } else {
    console.log(`No race_days with race_date before ${cutoffStr}`);
  }
  console.log('Done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
