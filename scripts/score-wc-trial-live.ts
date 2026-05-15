/**
 * Load trial WC matches + picks from scripts/wc-trial-live.json, upsert to Supabase, score, print totals.
 *
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY in .env
 * Usage: npx tsx scripts/score-wc-trial-live.ts
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { scoreAntePostMatchWithBreakdown } from '../features/wc2026/utils/ante-post-scoring';
import { scoreLiveMatchDayPickWithBreakdown } from '../features/wc2026/utils/live-match-day-scoring';
import { scoreAllWcPredictionsWithResultsForClient } from '../features/wc2026/services/wc-prediction-scoring';

const TRIAL_FILE = join(__dirname, 'wc-trial-live.json');

type TrialFile = {
  matches: Array<{
    match_number: number;
    home_team_code: string;
    away_team_code: string;
    home_score: number;
    away_score: number;
    match_date?: string;
    is_knockout?: boolean;
  }>;
  live_picks?: Array<{
    user_id: string;
    match_number: number;
    outcome: 'H' | 'D' | 'A';
    total_goals: number;
    btts: boolean;
  }>;
  ante_post_picks?: Array<{
    user_id: string;
    match_number: number;
    home_score: number;
    away_score: number;
  }>;
};

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
    process.exit(1);
  }
  if (!existsSync(TRIAL_FILE)) {
    console.error(`Create ${TRIAL_FILE} from wc-trial-live.example.json`);
    process.exit(1);
  }

  const trial = JSON.parse(readFileSync(TRIAL_FILE, 'utf8')) as TrialFile;
  const supabase = createClient(url, key, { db: { schema: 'wc2026' } });
  const supabasePublic = createClient(url, key);

  const { data: stage } = await supabase
    .from('tournament_stages')
    .select('id')
    .eq('is_knockout', true)
    .order('stage_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  const stageId = stage?.id;
  if (!stageId) {
    console.error('No knockout tournament_stage in wc2026 — seed stages first.');
    process.exit(1);
  }

  const { data: venue } = await supabase.from('venues').select('id').limit(1).maybeSingle();
  if (!venue?.id) {
    console.error('No venue in wc2026 — seed venues first.');
    process.exit(1);
  }

  const teamCache = new Map<string, string>();

  async function teamId(code: string): Promise<string> {
    const c = code.trim().toUpperCase();
    if (teamCache.has(c)) return teamCache.get(c)!;
    const { data: existing } = await supabase.from('teams').select('id').eq('country_code', c).maybeSingle();
    if (existing?.id) {
      teamCache.set(c, existing.id);
      return existing.id;
    }
    const { data: inserted, error } = await supabase
      .from('teams')
      .insert({
        country_code: c,
        country_name: c,
        confederation: 'Trial',
      })
      .select('id')
      .single();
    if (error) throw error;
    teamCache.set(c, inserted.id);
    return inserted.id;
  }

  console.log('--- Upserting trial matches ---');
  for (const m of trial.matches) {
    const homeId = await teamId(m.home_team_code);
    const awayId = await teamId(m.away_team_code);
    const { error } = await supabase.from('matches').upsert(
      {
        match_number: m.match_number,
        tournament_stage_id: stageId,
        home_team_id: homeId,
        away_team_id: awayId,
        venue_id: venue.id,
        match_date: m.match_date ?? new Date().toISOString(),
        home_score: m.home_score,
        away_score: m.away_score,
        status: 'finished',
        is_knockout: m.is_knockout ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'match_number' }
    );
    if (error) throw error;
    console.log(`Match ${m.match_number}: ${m.home_score}-${m.away_score}`);
  }

  const matchIdByNum = new Map<number, string>();
  for (const m of trial.matches) {
    const { data: row } = await supabase.from('matches').select('id').eq('match_number', m.match_number).single();
    if (row?.id) matchIdByNum.set(m.match_number, row.id);
  }

  console.log('\n--- Upserting live picks ---');
  for (const p of trial.live_picks ?? []) {
    const matchId = matchIdByNum.get(p.match_number);
    if (!matchId) continue;
    const { error } = await supabase.from('predictions').upsert(
      {
        user_id: p.user_id,
        match_id: matchId,
        match_number: p.match_number,
        prediction_type: 'live',
        live_outcome: p.outcome,
        live_total_goals: p.total_goals,
        live_btts: p.btts,
        home_score: null,
        away_score: null,
        predicted_winner_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,match_number,prediction_type' }
    );
    if (error) throw error;
    const m = trial.matches.find((x) => x.match_number === p.match_number)!;
    const br = scoreLiveMatchDayPickWithBreakdown(
      { outcome: p.outcome, totalGoals: p.total_goals, btts: p.btts },
      m.home_score,
      m.away_score
    );
    console.log(
      `  user ${p.user_id.slice(0, 8)}… m${p.match_number}: ${br.points} pts (1X2:${br.correct1x2} goals:${br.correctGoals} btts:${br.correctBtts})`
    );
  }

  console.log('\n--- Upserting ante-post picks (optional) ---');
  for (const p of trial.ante_post_picks ?? []) {
    const matchId = matchIdByNum.get(p.match_number);
    if (!matchId) continue;
    const { error } = await supabase.from('predictions').upsert(
      {
        user_id: p.user_id,
        match_id: matchId,
        match_number: p.match_number,
        prediction_type: 'ante_post',
        home_score: p.home_score,
        away_score: p.away_score,
        predicted_winner_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,match_number,prediction_type' }
    );
    if (error) throw error;
    const m = trial.matches.find((x) => x.match_number === p.match_number)!;
    const br = scoreAntePostMatchWithBreakdown(p.home_score, p.away_score, m.home_score, m.away_score);
    console.log(`  user ${p.user_id.slice(0, 8)}… m${p.match_number}: ${br.points} pts (${br.tier})`);
  }

  console.log('\n--- Scoring all finished predictions in DB ---');
  const result = await scoreAllWcPredictionsWithResultsForClient(supabase);
  console.log(result);

  const userIds = new Set([
    ...(trial.live_picks ?? []).map((p) => p.user_id),
    ...(trial.ante_post_picks ?? []).map((p) => p.user_id),
  ]);

  for (const uid of userIds) {
    const { data: preds } = await supabase
      .from('predictions')
      .select('prediction_type, points_awarded')
      .eq('user_id', uid);
    let ante = 0;
    let live = 0;
    for (const row of preds ?? []) {
      const pts = Number((row as { points_awarded: number | null }).points_awarded ?? 0);
      if ((row as { prediction_type: string }).prediction_type === 'live') live += pts;
      else ante += pts;
    }
    const { data: prof } = await supabasePublic.from('profiles').select('username').eq('id', uid).maybeSingle();
    console.log(
      `\n${(prof as { username?: string } | null)?.username ?? uid}: ante ${ante} + live ${live} = ${ante + live} total`
    );
  }

  console.log('\nDone. Check mini-league leaderboard in the app (refresh).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
