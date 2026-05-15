import type { Prediction } from '@/features/wc2026/services/predictions';

export type AntePostPointsTier = 'result' | 'close' | 'exact';

const EXACT_PTS = 3;
const CLOSE_PTS = 1.5;
const RESULT_PTS = 1;

/** Classify awarded ante-post points into Result / Close / Exact (mutually exclusive per match). */
export function antePostTierFromPoints(points: number | null | undefined): AntePostPointsTier | null {
  if (points == null || !Number.isFinite(points) || points <= 0) return null;
  const p = Math.round(points * 100) / 100;
  if (p >= EXACT_PTS - 0.01) return 'exact';
  if (p >= CLOSE_PTS - 0.01) return 'close';
  if (p >= RESULT_PTS - 0.01) return 'result';
  return null;
}

export type AntePostTierCounts = {
  result: number;
  close: number;
  exact: number;
  totalPoints: number;
};

export function summarizeAntePostPredictions(preds: Prediction[]): AntePostTierCounts {
  const out: AntePostTierCounts = { result: 0, close: 0, exact: 0, totalPoints: 0 };
  for (const p of preds) {
    if (p.prediction_type !== 'ante_post') continue;
    const pts = p.points_awarded ?? 0;
    if (Number.isFinite(pts)) out.totalPoints += pts;
    const tier = antePostTierFromPoints(p.points_awarded);
    if (tier) out[tier] += 1;
  }
  out.totalPoints = Math.round(out.totalPoints * 100) / 100;
  return out;
}

export function formatWcPoints(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return rounded.toFixed(1);
}
