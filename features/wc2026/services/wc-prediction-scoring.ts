import { wcSupabase } from '@/features/wc2026/lib/supabase';
import { scoreAntePostMatch } from '@/features/wc2026/utils/ante-post-scoring';
import {
  scoreLiveMatchDayPick,
  type LiveMatchDayPick,
} from '@/features/wc2026/utils/live-match-day-scoring';

/** wc2026 schema client (app `wcSupabase` or script service-role client). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WcDb = any;

type PredictionRow = {
  id: string;
  user_id: string;
  match_id: string | null;
  match_number: number | null;
  prediction_type: 'ante_post' | 'live';
  home_score: number | null;
  away_score: number | null;
  live_outcome: string | null;
  live_total_goals: number | null;
  live_btts: boolean | null;
};

type MatchRow = {
  id: string;
  match_number: number;
  home_score: number | null;
  away_score: number | null;
};

function scoreAntePostRow(p: PredictionRow, m: MatchRow): number | null {
  if (p.home_score == null || p.away_score == null) return null;
  if (m.home_score == null || m.away_score == null) return null;
  return scoreAntePostMatch(p.home_score, p.away_score, m.home_score, m.away_score);
}

function scoreLiveRow(p: PredictionRow, m: MatchRow): number | null {
  if (m.home_score == null || m.away_score == null) return null;
  if (p.live_outcome !== 'H' && p.live_outcome !== 'D' && p.live_outcome !== 'A') return null;
  if (p.live_total_goals == null || p.live_btts == null) return null;

  const pick: LiveMatchDayPick = {
    outcome: p.live_outcome,
    totalGoals: p.live_total_goals,
    btts: p.live_btts,
  };
  return scoreLiveMatchDayPick(pick, m.home_score, m.away_score);
}

/**
 * Recompute `points_awarded` for predictions on finished matches.
 * Ante post and live are scored independently; leaderboard sums both.
 */
export async function scoreAllWcPredictionsWithResultsForClient(
  wcClient: WcDb
): Promise<{ antePostUpdated: number; liveUpdated: number; skipped: number }> {
  const { data: matches, error: matchErr } = await wcClient
    .from('matches')
    .select('id, match_number, home_score, away_score, status')
    .not('home_score', 'is', null)
    .not('away_score', 'is', null);

  if (matchErr) throw matchErr;
  const finished = (matches ?? []) as MatchRow[];
  if (finished.length === 0) {
    return { antePostUpdated: 0, liveUpdated: 0, skipped: 0 };
  }

  const matchById = new Map(finished.map((m) => [m.id, m]));
  const matchByNum = new Map(finished.map((m) => [m.match_number, m]));
  const matchIds = finished.map((m) => m.id);

  const { data: preds, error: predErr } = await wcClient
    .from('predictions')
    .select(
      'id, user_id, match_id, match_number, prediction_type, home_score, away_score, live_outcome, live_total_goals, live_btts'
    )
    .in('match_id', matchIds);

  if (predErr) throw predErr;

  let antePostUpdated = 0;
  let liveUpdated = 0;
  let skipped = 0;

  for (const row of (preds ?? []) as PredictionRow[]) {
    const m =
      (row.match_id ? matchById.get(row.match_id) : undefined) ??
      (row.match_number != null ? matchByNum.get(row.match_number) : undefined);
    if (!m) {
      skipped++;
      continue;
    }

    let points: number | null = null;
    if (row.prediction_type === 'ante_post') {
      points = scoreAntePostRow(row, m);
    } else if (row.prediction_type === 'live') {
      points = scoreLiveRow(row, m);
    }

    if (points == null) {
      skipped++;
      continue;
    }

    const { error: upErr } = await wcClient
      .from('predictions')
      .update({
        points_awarded: points,
        is_correct: points > 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (upErr) throw upErr;

    if (row.prediction_type === 'ante_post') antePostUpdated++;
    else liveUpdated++;
  }

  return { antePostUpdated, liveUpdated, skipped };
}

export async function scoreAllWcPredictionsWithResults(): Promise<{
  antePostUpdated: number;
  liveUpdated: number;
  skipped: number;
}> {
  return scoreAllWcPredictionsWithResultsForClient(wcSupabase as WcDb);
}
