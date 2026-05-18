import type { MatchOutcome } from '@/features/wc2026/utils/ante-post-scoring';
import { matchOutcome } from '@/features/wc2026/utils/ante-post-scoring';

export type LiveMatchDayPick = {
  outcome: MatchOutcome;
  totalGoals: number;
  btts: boolean;
};

/** Points per correct market line (90-minute result). */
export const LIVE_OUTCOME_PTS = 1;
export const LIVE_GOALS_PTS = 2;
export const LIVE_BTTS_PTS = 1;
/** Extra point when 1X2, total goals, and BTTS are all correct on the same match. */
export const LIVE_ALL_LINES_BONUS_PTS = 1;
export const LIVE_MATCH_DAY_MAX_PTS =
  LIVE_OUTCOME_PTS + LIVE_GOALS_PTS + LIVE_BTTS_PTS + LIVE_ALL_LINES_BONUS_PTS;

function evaluateLivePick(pick: LiveMatchDayPick, actualHome: number, actualAway: number) {
  const actualTotal = actualHome + actualAway;
  const actualOutcome = matchOutcome(actualHome, actualAway);
  const actualBtts = actualHome > 0 && actualAway > 0;

  const correct1x2 = pick.outcome === actualOutcome;
  const correctGoals = pick.totalGoals === actualTotal;
  const correctBtts = pick.btts === actualBtts;
  const allThree = correct1x2 && correctGoals && correctBtts;

  const basePoints =
    (correct1x2 ? LIVE_OUTCOME_PTS : 0) +
    (correctGoals ? LIVE_GOALS_PTS : 0) +
    (correctBtts ? LIVE_BTTS_PTS : 0);
  const points = basePoints + (allThree ? LIVE_ALL_LINES_BONUS_PTS : 0);

  return { correct1x2, correctGoals, correctBtts, allThree, basePoints, points };
}

/**
 * Match day: 1 pt (1X2), 2 pts (total goals), 1 pt (BTTS); +1 bonus when all three are correct (5 max).
 * Uses 90-minute scores only (home_score + away_score on the match row).
 * @see app/(wc2026)/points.tsx
 */
export function scoreLiveMatchDayPick(pick: LiveMatchDayPick, actualHome: number, actualAway: number): number {
  return evaluateLivePick(pick, actualHome, actualAway).points;
}

export type LiveScoreBreakdown = {
  points: number;
  basePoints: number;
  bonusPoints: number;
  correct1x2: boolean;
  correctGoals: boolean;
  correctBtts: boolean;
  allThree: boolean;
};

export function scoreLiveMatchDayPickWithBreakdown(
  pick: LiveMatchDayPick,
  actualHome: number,
  actualAway: number
): LiveScoreBreakdown {
  const { correct1x2, correctGoals, correctBtts, allThree, basePoints, points } = evaluateLivePick(
    pick,
    actualHome,
    actualAway
  );
  return {
    points,
    basePoints,
    bonusPoints: allThree ? LIVE_ALL_LINES_BONUS_PTS : 0,
    correct1x2,
    correctGoals,
    correctBtts,
    allThree,
  };
}
