import type { KnockoutMatch } from '@/features/wc2026/services/knockout-bracket';

/** Who advances from a knockout pick (scores + optional draw winner). */
export function resolveKnockoutMatchWinner(
  match: Pick<KnockoutMatch, 'homeTeam' | 'awayTeam'>,
  homeScore: number | null,
  awayScore: number | null,
  predictedWinnerId: string | null | undefined
): string | null {
  if (homeScore == null || awayScore == null) return null;
  if (homeScore > awayScore) return match.homeTeam.id;
  if (awayScore > homeScore) return match.awayTeam.id;
  if (predictedWinnerId) {
    return predictedWinnerId;
  }
  return null;
}

export function parseKnockoutScoreString(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}
