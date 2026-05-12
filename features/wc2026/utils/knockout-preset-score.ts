export type KnockoutScorePredictionEntry = {
  matchNumber: number;
  homeScore: string;
  awayScore: string;
  predictedWinnerId?: string | null;
};

/** Sets both scores and derived winner (null on draws), matching handleScoreChange logic. */
export function applyKnockoutScorePreset(
  prev: Record<number, KnockoutScorePredictionEntry>,
  matchNumber: number,
  home: number,
  away: number,
  homeTeamId: string,
  awayTeamId: string
): Record<number, KnockoutScorePredictionEntry> {
  const current = prev[matchNumber] ?? {
    matchNumber,
    homeScore: '',
    awayScore: '',
    predictedWinnerId: null,
  };
  let predictedWinnerId: string | null = null;
  if (home > away) predictedWinnerId = homeTeamId;
  else if (away > home) predictedWinnerId = awayTeamId;
  else predictedWinnerId = null;

  return {
    ...prev,
    [matchNumber]: {
      ...current,
      homeScore: String(home),
      awayScore: String(away),
      predictedWinnerId,
    },
  };
}
