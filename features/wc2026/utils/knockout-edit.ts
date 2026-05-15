import type { KnockoutDownstreamAnchor } from '@/features/wc2026/services/async-predictions';
import type { KnockoutMatch } from '@/features/wc2026/services/knockout-bracket';
import { clearDownstreamKnockoutCompletely } from '@/features/wc2026/services/knockout-downstream';
import {
  parseKnockoutScoreString,
  resolveKnockoutMatchWinner,
} from '@/features/wc2026/utils/knockout-winner';

export type KnockoutPredictionDraft = {
  matchNumber: number;
  homeScore: string;
  awayScore: string;
  predictedWinnerId?: string | null;
};

function committedWinnerForMatch(
  match: KnockoutMatch,
  saved: { home_score: number | null; away_score: number | null } | undefined,
  current: KnockoutPredictionDraft | undefined
): string | null {
  const savedHome = saved?.home_score ?? null;
  const savedAway = saved?.away_score ?? null;
  if (savedHome != null && savedAway != null) {
    return resolveKnockoutMatchWinner(match, savedHome, savedAway, current?.predictedWinnerId ?? null);
  }
  const home = parseKnockoutScoreString(current?.homeScore ?? '');
  const away = parseKnockoutScoreString(current?.awayScore ?? '');
  return resolveKnockoutMatchWinner(match, home, away, current?.predictedWinnerId ?? null);
}

async function applyKnockoutEditWithDownstreamReset(options: {
  anchor: KnockoutDownstreamAnchor;
  selectionsGloballyLocked: boolean;
  userId: string | null;
  committedWinnerId: string | null;
  proposedWinnerId: string | null;
  applyEdit: () => void;
  onDownstreamCleared?: () => void;
}): Promise<void> {
  if (options.selectionsGloballyLocked) return;

  const winnerChanged =
    options.committedWinnerId !== options.proposedWinnerId &&
    (options.committedWinnerId != null || options.proposedWinnerId != null);

  if (winnerChanged) {
    await clearDownstreamKnockoutCompletely(options.anchor, options.userId);
    options.onDownstreamCleared?.();
  }

  options.applyEdit();
}

export function runKnockoutScoreEdit(options: {
  anchor: KnockoutDownstreamAnchor;
  match: KnockoutMatch;
  matchNumber: number;
  team: 'home' | 'away';
  value: string;
  homeTeamId: string;
  awayTeamId: string;
  predictions: Record<number, KnockoutPredictionDraft>;
  savedPredictions: Record<number, { home_score: number | null; away_score: number | null }>;
  selectionsGloballyLocked: boolean;
  userId: string | null;
  onDownstreamCleared?: () => void;
  applyEdit: (next: KnockoutPredictionDraft) => void;
}): void {
  const current = options.predictions[options.matchNumber] ?? {
    matchNumber: options.matchNumber,
    homeScore: '',
    awayScore: '',
    predictedWinnerId: null,
  };
  const newHomeScore = options.team === 'home' ? options.value : current.homeScore;
  const newAwayScore = options.team === 'away' ? options.value : current.awayScore;

  let predictedWinnerId = current.predictedWinnerId ?? null;
  const homeParsed = parseKnockoutScoreString(newHomeScore);
  const awayParsed = parseKnockoutScoreString(newAwayScore);
  if (homeParsed != null && awayParsed != null) {
    if (homeParsed > awayParsed) predictedWinnerId = options.homeTeamId;
    else if (awayParsed > homeParsed) predictedWinnerId = options.awayTeamId;
    else predictedWinnerId = null;
  }

  const committed = committedWinnerForMatch(
    options.match,
    options.savedPredictions[options.matchNumber],
    current
  );
  const proposed = resolveKnockoutMatchWinner(
    options.match,
    homeParsed,
    awayParsed,
    predictedWinnerId
  );

  void applyKnockoutEditWithDownstreamReset({
    anchor: options.anchor,
    selectionsGloballyLocked: options.selectionsGloballyLocked,
    userId: options.userId,
    committedWinnerId: committed,
    proposedWinnerId: proposed,
    onDownstreamCleared: options.onDownstreamCleared,
    applyEdit: () =>
      options.applyEdit({
        matchNumber: options.matchNumber,
        homeScore: newHomeScore,
        awayScore: newAwayScore,
        predictedWinnerId,
      }),
  });
}

export function runKnockoutPresetEdit(options: {
  anchor: KnockoutDownstreamAnchor;
  match: KnockoutMatch;
  matchNumber: number;
  homeScore: number;
  awayScore: number;
  homeTeamId: string;
  awayTeamId: string;
  predictions: Record<number, KnockoutPredictionDraft>;
  savedPredictions: Record<number, { home_score: number | null; away_score: number | null }>;
  selectionsGloballyLocked: boolean;
  userId: string | null;
  onDownstreamCleared?: () => void;
  applyEdit: (next: KnockoutPredictionDraft) => void;
}): void {
  let predictedWinnerId: string | null = null;
  if (options.homeScore > options.awayScore) predictedWinnerId = options.homeTeamId;
  else if (options.awayScore > options.homeScore) predictedWinnerId = options.awayTeamId;

  const current = options.predictions[options.matchNumber];
  const committed = committedWinnerForMatch(
    options.match,
    options.savedPredictions[options.matchNumber],
    current
  );
  const proposed = resolveKnockoutMatchWinner(
    options.match,
    options.homeScore,
    options.awayScore,
    predictedWinnerId
  );

  void applyKnockoutEditWithDownstreamReset({
    anchor: options.anchor,
    selectionsGloballyLocked: options.selectionsGloballyLocked,
    userId: options.userId,
    committedWinnerId: committed,
    proposedWinnerId: proposed,
    onDownstreamCleared: options.onDownstreamCleared,
    applyEdit: () =>
      options.applyEdit({
        matchNumber: options.matchNumber,
        homeScore: String(options.homeScore),
        awayScore: String(options.awayScore),
        predictedWinnerId,
      }),
  });
}

export function runKnockoutWinnerPick(options: {
  anchor: KnockoutDownstreamAnchor;
  match: KnockoutMatch;
  matchNumber: number;
  winnerId: string;
  predictions: Record<number, KnockoutPredictionDraft>;
  savedPredictions: Record<number, { home_score: number | null; away_score: number | null }>;
  selectionsGloballyLocked: boolean;
  userId: string | null;
  onDownstreamCleared?: () => void;
  applyEdit: (next: KnockoutPredictionDraft) => void;
}): void {
  const current = options.predictions[options.matchNumber] ?? {
    matchNumber: options.matchNumber,
    homeScore: '',
    awayScore: '',
    predictedWinnerId: null,
  };
  const committed = committedWinnerForMatch(
    options.match,
    options.savedPredictions[options.matchNumber],
    current
  );

  void applyKnockoutEditWithDownstreamReset({
    anchor: options.anchor,
    selectionsGloballyLocked: options.selectionsGloballyLocked,
    userId: options.userId,
    committedWinnerId: committed,
    proposedWinnerId: options.winnerId,
    onDownstreamCleared: options.onDownstreamCleared,
    applyEdit: () =>
      options.applyEdit({
        ...current,
        matchNumber: options.matchNumber,
        predictedWinnerId: options.winnerId,
      }),
  });
}
