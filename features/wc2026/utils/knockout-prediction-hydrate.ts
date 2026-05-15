import type { KnockoutMatch } from '@/features/wc2026/services/knockout-bracket';
import { getUserPredictionsByMatchNumber } from '@/features/wc2026/services/predictions';

export type KnockoutUiPrediction = {
  matchNumber: number;
  homeScore: string;
  awayScore: string;
  predictedWinnerId: string | null;
};

export type KnockoutSavedScores = {
  home_score: number | null;
  away_score: number | null;
};

/** Load ante-post knockout picks from Supabase (e.g. after submit cleared AsyncStorage). */
export async function hydrateKnockoutPredictionsFromDb(
  userId: string,
  bracketMatches: KnockoutMatch[]
): Promise<{
  predictions: Record<number, KnockoutUiPrediction>;
  savedScores: Record<number, KnockoutSavedScores>;
}> {
  const predictions: Record<number, KnockoutUiPrediction> = {};
  const savedScores: Record<number, KnockoutSavedScores> = {};

  await Promise.all(
    bracketMatches.map(async (match) => {
      const rows = await getUserPredictionsByMatchNumber(userId, match.matchNumber);
      const ante = rows.find((p) => p.prediction_type === 'ante_post');
      if (!ante) return;

      const hs = ante.home_score;
      const as = ante.away_score;
      const hasScores = hs != null && as != null;

      savedScores[match.matchNumber] = { home_score: hs, away_score: as };

      predictions[match.matchNumber] = {
        matchNumber: match.matchNumber,
        homeScore: hasScores ? String(hs) : '',
        awayScore: hasScores ? String(as) : '',
        predictedWinnerId: ante.predicted_winner_id ?? null,
      };
    })
  );

  return { predictions, savedScores };
}

export function resolveKnockoutWinner(
  match: KnockoutMatch,
  pred: KnockoutUiPrediction
): KnockoutMatch['homeTeam'] | null {
  if (!pred.homeScore.trim() || !pred.awayScore.trim()) return null;

  const homeScore = parseInt(pred.homeScore, 10);
  const awayScore = parseInt(pred.awayScore, 10);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;

  if (homeScore > awayScore) return match.homeTeam;
  if (awayScore > homeScore) return match.awayTeam;
  if (pred.predictedWinnerId) {
    return match.homeTeam.id === pred.predictedWinnerId ? match.homeTeam : match.awayTeam;
  }
  return null;
}
