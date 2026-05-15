export type MatchOutcome = 'H' | 'D' | 'A';

const EXACT_PTS = 3;
const CLOSE_PTS = 1.5;
const RESULT_PTS = 1;

export function matchOutcome(home: number, away: number): MatchOutcome {
  if (home > away) return 'H';
  if (away > home) return 'A';
  return 'D';
}

/**
 * Ante post: one tier per match (exact > close > result).
 * @see app/(wc2026)/points.tsx
 */
export function scoreAntePostMatch(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number
): number {
  if (predHome === actualHome && predAway === actualAway) return EXACT_PTS;

  const predOut = matchOutcome(predHome, predAway);
  const actOut = matchOutcome(actualHome, actualAway);
  if (predOut !== actOut) return 0;

  const predTotal = predHome + predAway;
  const actTotal = actualHome + actualAway;
  if (Math.abs(predTotal - actTotal) === 1) return CLOSE_PTS;

  return RESULT_PTS;
}

export type AntePostScoreBreakdown = {
  points: number;
  tier: 'exact' | 'close' | 'result' | 'none';
};

export function scoreAntePostMatchWithBreakdown(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number
): AntePostScoreBreakdown {
  const points = scoreAntePostMatch(predHome, predAway, actualHome, actualAway);
  if (points >= EXACT_PTS - 0.01) return { points, tier: 'exact' };
  if (points >= CLOSE_PTS - 0.01) return { points, tier: 'close' };
  if (points >= RESULT_PTS - 0.01) return { points, tier: 'result' };
  return { points: 0, tier: 'none' };
}
