import AsyncStorage from '@react-native-async-storage/async-storage';

import { WC2026_STORAGE_PREFIX } from '@/features/wc2026/constants/storage-keys';
import {
  getBronzeFinalPredictions,
  getFinalPredictions,
  getGroupPredictions,
  getQFPredictions,
  getR16Predictions,
  getR32Predictions,
  getSFPredictions,
  type LocalKnockoutPrediction,
} from '@/features/wc2026/services/async-predictions';
import { getFixtures, type Match } from '@/features/wc2026/services/fixtures';
import { loadGroupManualOrder } from '@/features/wc2026/services/group-manual-order';
import {
  generateBronzeFinalBracket,
  generateFinalBracket,
  generateQuarterFinalsBracket,
  generateRoundOf16Bracket,
  generateSemiFinalsBracket,
  type KnockoutMatch,
} from '@/features/wc2026/services/knockout-bracket';
import { generateRoundOf32 } from '@/features/wc2026/services/round-of-32-generator';
import type { Prediction } from '@/features/wc2026/services/predictions';

const ROUND_OF_32_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_bracket`;
const ROUND_OF_32_PREDICTIONS_FOR_R16_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_predictions_for_r16`;
const ROUND_OF_16_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}round_of_16_bracket`;
const ROUND_OF_16_PREDICTIONS_FOR_QF_KEY = `${WC2026_STORAGE_PREFIX}round_of_16_predictions_for_qf`;
const QF_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}quarter_finals_bracket`;
const QF_PREDICTIONS_FOR_SF_KEY = `${WC2026_STORAGE_PREFIX}quarter_finals_predictions_for_sf`;
const SF_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}semi_finals_bracket`;
const SF_PREDICTIONS_FOR_FINAL_KEY = `${WC2026_STORAGE_PREFIX}semi_finals_predictions_for_final`;
const BRONZE_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}bronze_final_bracket`;
const FINAL_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}final_bracket`;

type KnockoutPickMap = Record<
  number,
  { home_score: number; away_score: number; predicted_winner_id: string | null }
>;

function localKnockoutToPickMap(rec: Record<number, LocalKnockoutPrediction>): KnockoutPickMap {
  const out: KnockoutPickMap = {};
  for (const [key, pred] of Object.entries(rec)) {
    out[Number(key)] = {
      home_score: pred.home_score,
      away_score: pred.away_score,
      predicted_winner_id: pred.predicted_winner_id,
    };
  }
  return out;
}

function groupPredictionsForEngine(
  group: Awaited<ReturnType<typeof getGroupPredictions>>,
  fixtures: Match[]
): Record<string, Prediction> {
  const out: Record<string, Prediction> = {};
  for (const [matchId, pred] of Object.entries(group)) {
    const fx = fixtures.find((f) => f.id === matchId);
    out[matchId] = {
      id: '',
      user_id: '',
      match_id: matchId,
      match_number: fx?.match_number ?? null,
      prediction_type: 'ante_post',
      home_score: pred.home_score,
      away_score: pred.away_score,
      predicted_winner_id: null,
      points_awarded: null,
      is_correct: null,
      created_at: '',
      updated_at: '',
    };
  }
  return out;
}

/**
 * Rebuild knockout bracket JSON in AsyncStorage from saved group + knockout picks.
 * Fixes missing R16+ brackets after admin reopen, new device, or cleared local cache.
 */
export async function hydrateKnockoutBracketsFromStoredPicks(): Promise<boolean> {
  try {
    const group = await getGroupPredictions();
    if (Object.keys(group).length === 0) return false;

    const fixtures = await getFixtures();
    if (fixtures.length === 0) return false;

    const manualOrder = await loadGroupManualOrder();
    const groupRecord = groupPredictionsForEngine(group, fixtures);
    const { bracket: r32Bracket } = await generateRoundOf32(fixtures, groupRecord, manualOrder);
    await AsyncStorage.setItem(ROUND_OF_32_BRACKET_KEY, JSON.stringify(r32Bracket));

    const r32Local = await getR32Predictions();
    if (Object.keys(r32Local).length === 0) return true;

    const r32Picks = localKnockoutToPickMap(r32Local);
    await AsyncStorage.setItem(ROUND_OF_32_PREDICTIONS_FOR_R16_KEY, JSON.stringify(r32Picks));

    const r16Bracket = generateRoundOf16Bracket(r32Picks, r32Bracket);
    await AsyncStorage.setItem(ROUND_OF_16_BRACKET_KEY, JSON.stringify(r16Bracket));

    const r16Local = await getR16Predictions();
    if (Object.keys(r16Local).length === 0) return true;

    const r16Picks = localKnockoutToPickMap(r16Local);
    await AsyncStorage.setItem(ROUND_OF_16_PREDICTIONS_FOR_QF_KEY, JSON.stringify(r16Picks));

    const qfBracket = generateQuarterFinalsBracket(r16Picks, r16Bracket);
    await AsyncStorage.setItem(QF_BRACKET_KEY, JSON.stringify(qfBracket));

    const qfLocal = await getQFPredictions();
    if (Object.keys(qfLocal).length === 0) return true;

    const qfPicks = localKnockoutToPickMap(qfLocal);
    await AsyncStorage.setItem(QF_PREDICTIONS_FOR_SF_KEY, JSON.stringify(qfPicks));

    const sfBracket = generateSemiFinalsBracket(qfPicks, qfBracket);
    await AsyncStorage.setItem(SF_BRACKET_KEY, JSON.stringify(sfBracket));

    const sfLocal = await getSFPredictions();
    if (Object.keys(sfLocal).length === 0) return true;

    const sfPicks = localKnockoutToPickMap(sfLocal);
    await AsyncStorage.setItem(SF_PREDICTIONS_FOR_FINAL_KEY, JSON.stringify(sfPicks));

    const bronzeBracket = generateBronzeFinalBracket(sfPicks, sfBracket);
    const finalBracket = generateFinalBracket(sfPicks, sfBracket);
    await AsyncStorage.setItem(BRONZE_BRACKET_KEY, JSON.stringify(bronzeBracket));
    await AsyncStorage.setItem(FINAL_BRACKET_KEY, JSON.stringify(finalBracket));

    const bronzeLocal = await getBronzeFinalPredictions();
    const finalLocal = await getFinalPredictions();
    if (Object.keys(bronzeLocal).length === 0 && Object.keys(finalLocal).length === 0) {
      return true;
    }

    return true;
  } catch (e) {
    console.warn('hydrateKnockoutBracketsFromStoredPicks failed', e);
    return false;
  }
}

export async function loadKnockoutBracketFromStorage(key: string): Promise<KnockoutMatch[] | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as KnockoutMatch[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}
