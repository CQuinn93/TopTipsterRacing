import type { MatchOutcome } from '@/features/wc2026/utils/ante-post-scoring';
import { matchOutcome } from '@/features/wc2026/utils/ante-post-scoring';

export type LiveMatchDayPick = {
  outcome: MatchOutcome;
  totalGoals: number;
  btts: boolean;
};

const LINE_PTS = 1;
const ALL_THREE_BONUS_PTS = 5;

/**
 * Match day: 1 pt per correct line (1X2, total goals, BTTS); 5 if all three correct.
 * Uses 90-minute scores only (home_score + away_score on the match row).
 * @see app/(wc2026)/points.tsx
 */
export function scoreLiveMatchDayPick(pick: LiveMatchDayPick, actualHome: number, actualAway: number): number {
  const actualTotal = actualHome + actualAway;
  const actualOutcome = matchOutcome(actualHome, actualAway);
  const actualBtts = actualHome > 0 && actualAway > 0;

  const correct1x2 = pick.outcome === actualOutcome;
  const correctGoals = pick.totalGoals === actualTotal;
  const correctBtts = pick.btts === actualBtts;

  if (correct1x2 && correctGoals && correctBtts) return ALL_THREE_BONUS_PTS;

  return (
    (correct1x2 ? LINE_PTS : 0) + (correctGoals ? LINE_PTS : 0) + (correctBtts ? LINE_PTS : 0)
  );
}

export type LiveScoreBreakdown = {
  points: number;
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
  const actualTotal = actualHome + actualAway;
  const actualOutcome = matchOutcome(actualHome, actualAway);
  const actualBtts = actualHome > 0 && actualAway > 0;

  const correct1x2 = pick.outcome === actualOutcome;
  const correctGoals = pick.totalGoals === actualTotal;
  const correctBtts = pick.btts === actualBtts;
  const allThree = correct1x2 && correctGoals && correctBtts;

  return {
    points: allThree
      ? ALL_THREE_BONUS_PTS
      : (correct1x2 ? LINE_PTS : 0) + (correctGoals ? LINE_PTS : 0) + (correctBtts ? LINE_PTS : 0),
    correct1x2,
    correctGoals,
    correctBtts,
    allThree,
  };
}
