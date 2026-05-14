import type { Match, Team } from '@/features/wc2026/services/fixtures';
import type { WcLeaderboardPredictionRow } from '@/features/wc2026/services/football-leaderboard';
import type { Prediction } from '@/features/wc2026/services/predictions';
import {
  generateBronzeFinalBracket,
  generateFinalBracket,
  generateQuarterFinalsBracket,
  generateRoundOf16Bracket,
  generateSemiFinalsBracket,
  type KnockoutMatch,
} from '@/features/wc2026/services/knockout-bracket';
import { generateRoundOf32 } from '@/features/wc2026/services/round-of-32-generator';

function briefToTeam(t: { id: string; code: string; name: string }): Team {
  return {
    id: t.id,
    country_code: (t.code ?? '').trim().toUpperCase(),
    country_name: t.name,
    confederation: '',
    fifa_ranking: null,
  };
}

function addBracket(
  map: Map<number, { home_team: Team; away_team: Team }>,
  bracket: KnockoutMatch[]
): void {
  for (const m of bracket) {
    map.set(m.matchNumber, {
      home_team: briefToTeam(m.homeTeam),
      away_team: briefToTeam(m.awayTeam),
    });
  }
}

function groupStagePredictionRecord(
  antePostRows: WcLeaderboardPredictionRow[],
  fixtures: Match[]
): Record<string, Prediction> {
  const byNum = new Map<number, Match>();
  for (const f of fixtures) {
    const n = Number(f.match_number);
    if (Number.isFinite(n)) byNum.set(n, f);
  }
  const out: Record<string, Prediction> = {};
  for (const r of antePostRows) {
    if (r.prediction_type !== 'ante_post') continue;
    if (r.home_score == null || r.away_score == null) continue;
    const mn = r.match_number != null ? Number(r.match_number) : null;
    const match =
      (r.match_id ? fixtures.find((f) => f.id === r.match_id) : undefined) ??
      (mn != null ? byNum.get(mn) : undefined);
    if (!match || match.match_number < 1 || match.match_number > 72) continue;
    out[match.id] = {
      id: r.id,
      user_id: r.user_id,
      match_id: match.id,
      match_number: match.match_number,
      prediction_type: 'ante_post',
      home_score: r.home_score,
      away_score: r.away_score,
      predicted_winner_id: r.predicted_winner_id,
      points_awarded: r.points_awarded,
      is_correct: r.is_correct,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  }
  return out;
}

function extractKnockoutScores(
  antePostRows: WcLeaderboardPredictionRow[],
  min: number,
  max: number
): Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }> {
  const out: Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }> = {};
  for (const r of antePostRows) {
    if (r.prediction_type !== 'ante_post') continue;
    const mn = r.match_number != null ? Number(r.match_number) : null;
    if (mn == null || mn < min || mn > max) continue;
    if (r.home_score == null || r.away_score == null) continue;
    out[mn] = {
      home_score: r.home_score,
      away_score: r.away_score,
      predicted_winner_id: r.predicted_winner_id,
    };
  }
  return out;
}

/**
 * Knockout fixtures (match_number ≥ 73) are not stored in `wc2026.matches` in this project — only the group stage is.
 * Bracket teams are derived from the same logic as ante-post (group picks → R32 → …).
 */
export async function buildKnockoutTeamsByMatchNumber(
  fixtures: Match[],
  rows: WcLeaderboardPredictionRow[]
): Promise<Map<number, { home_team: Team; away_team: Team }>> {
  const map = new Map<number, { home_team: Team; away_team: Team }>();
  if (fixtures.length === 0) return map;

  const antePost = rows.filter((r) => r.prediction_type === 'ante_post');
  const groupRecord = groupStagePredictionRecord(antePost, fixtures);

  try {
    const { bracket: r32 } = await generateRoundOf32(fixtures, groupRecord);
    addBracket(map, r32);

    const r32Preds = extractKnockoutScores(antePost, 73, 88);
    const r16 = generateRoundOf16Bracket(r32Preds, r32);
    addBracket(map, r16);

    const r16Preds = extractKnockoutScores(antePost, 89, 96);
    const qf = generateQuarterFinalsBracket(r16Preds, r16);
    addBracket(map, qf);

    const qfPreds = extractKnockoutScores(antePost, 97, 100);
    const sf = generateSemiFinalsBracket(qfPreds, qf);
    addBracket(map, sf);

    const sfPreds = extractKnockoutScores(antePost, 101, 102);
    addBracket(map, generateBronzeFinalBracket(sfPreds, sf));
    addBracket(map, generateFinalBracket(sfPreds, sf));
  } catch {
    return map;
  }

  return map;
}
