/**
 * Auto-assign LMS picks for players who missed the gameweek deadline.
 *
 * Calls `lms_auto_assign_missed_picks` for every open gameweek whose
 * deadline has passed. Safe to run often — assigns 0 when nothing is due.
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   LMS_SEASON (optional, default 2026/27)
 *
 * Run: npx tsx scripts/lms-auto-assign-missed-picks.ts
 */
import { createClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceKey = requireEnv('SUPABASE_SERVICE_KEY');
  const season = process.env.LMS_SEASON?.trim() || '2026/27';

  console.log('[lms-auto-assign] Starting', {
    SUPABASE_URL: 'set',
    SUPABASE_SERVICE_KEY: 'set',
    LMS_SEASON: season,
  });

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: gws, error: gwErr } = await supabase
    .from('lms_gameweeks')
    .select('id, number, deadline_at, status')
    .eq('season', season)
    .neq('status', 'complete')
    .lte('deadline_at', new Date().toISOString())
    .order('number', { ascending: true });

  if (gwErr) throw gwErr;

  const rows = (gws ?? []) as {
    id: string;
    number: number;
    deadline_at: string;
    status: string;
  }[];

  console.log(`[lms-auto-assign] Open GWs past deadline: ${rows.length}`);

  let totalAssigned = 0;
  for (const gw of rows) {
    const { data, error } = await supabase.rpc('lms_auto_assign_missed_picks', {
      p_gameweek_id: gw.id,
    });
    if (error) {
      console.warn(`[lms-auto-assign] GW${gw.number} failed:`, error.message);
      continue;
    }
    const res = (data ?? {}) as {
      success?: boolean;
      assigned?: number;
      skipped?: string;
      error?: string;
    };
    const n = Number(res.assigned ?? 0);
    totalAssigned += n;
    if (n > 0) {
      console.log(`[lms-auto-assign] GW${gw.number}: assigned ${n}`);
    } else if (res.skipped) {
      console.log(`[lms-auto-assign] GW${gw.number}: skipped (${res.skipped})`);
    } else if (res.error) {
      console.warn(`[lms-auto-assign] GW${gw.number}:`, res.error);
    } else {
      console.log(`[lms-auto-assign] GW${gw.number}: nothing to assign`);
    }
  }

  console.log('[lms-auto-assign] Done.', {
    gameweeksChecked: rows.length,
    totalAssigned,
  });
}

main().catch((e) => {
  console.error('[lms-auto-assign] Fatal:', e);
  process.exit(1);
});
