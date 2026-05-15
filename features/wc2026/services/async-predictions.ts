import AsyncStorage from '@react-native-async-storage/async-storage';

import { WC2026_STORAGE_PREFIX } from '@/features/wc2026/constants/storage-keys';
import { fetchAntePostLockStatusFromServer, markAntePostSubmittedOnServer } from '@/features/wc2026/services/ante-post-admin';
import { wcSupabase } from '@/features/wc2026/lib/supabase';
import { supabase } from '@/lib/supabase';

/** Official final match number — submitting here locks ante post for the account. */
const ANTE_POST_FINAL_MATCH_NUMBER = 104;

const GROUP_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_group_predictions`;
const R32_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_r32_predictions`;
const R16_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_r16_predictions`;
const QF_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_qf_predictions`;
const SF_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_sf_predictions`;
const BRONZE_FINAL_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_bronze_final_predictions`;
const FINAL_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_final_predictions`;
const IS_LOCKED_KEY = `${WC2026_STORAGE_PREFIX}ante_post_is_locked`;

/** Brackets + bridge keys cleared when editing an earlier knockout round. */
const R16_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}round_of_16_bracket`;
const R16_FOR_QF_KEY = `${WC2026_STORAGE_PREFIX}round_of_16_predictions_for_qf`;
const QF_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}quarter_finals_bracket`;
const QF_FOR_SF_KEY = `${WC2026_STORAGE_PREFIX}quarter_finals_predictions_for_sf`;
const SF_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}semi_finals_bracket`;
const SF_FOR_FINAL_KEY = `${WC2026_STORAGE_PREFIX}semi_finals_predictions_for_final`;
const BRONZE_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}bronze_final_bracket`;
const FINAL_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}final_bracket`;
const R32_FOR_R16_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_predictions_for_r16`;

export type KnockoutDownstreamAnchor = 'r32' | 'r16' | 'qf' | 'sf' | 'bronze';

export interface LocalGroupPrediction {
  match_id: string;
  home_score: number;
  away_score: number;
}

export interface LocalKnockoutPrediction {
  match_number: number;
  home_score: number;
  away_score: number;
  predicted_winner_id: string | null;
}

export const saveGroupPredictions = async (predictions: Record<string, LocalGroupPrediction>) => {
  await AsyncStorage.setItem(GROUP_PREDICTIONS_KEY, JSON.stringify(predictions));
};

export const getGroupPredictions = async (): Promise<Record<string, LocalGroupPrediction>> => {
  const data = await AsyncStorage.getItem(GROUP_PREDICTIONS_KEY);
  return data ? JSON.parse(data) : {};
};

export const saveR32Predictions = async (predictions: Record<number, LocalKnockoutPrediction>) => {
  await AsyncStorage.setItem(R32_PREDICTIONS_KEY, JSON.stringify(predictions));
};

export const getR32Predictions = async (): Promise<Record<number, LocalKnockoutPrediction>> => {
  const data = await AsyncStorage.getItem(R32_PREDICTIONS_KEY);
  return data ? JSON.parse(data) : {};
};

export const saveR16Predictions = async (predictions: Record<number, LocalKnockoutPrediction>) => {
  await AsyncStorage.setItem(R16_PREDICTIONS_KEY, JSON.stringify(predictions));
};

export const getR16Predictions = async (): Promise<Record<number, LocalKnockoutPrediction>> => {
  const data = await AsyncStorage.getItem(R16_PREDICTIONS_KEY);
  return data ? JSON.parse(data) : {};
};

export const saveQFPredictions = async (predictions: Record<number, LocalKnockoutPrediction>) => {
  await AsyncStorage.setItem(QF_PREDICTIONS_KEY, JSON.stringify(predictions));
};

export const getQFPredictions = async (): Promise<Record<number, LocalKnockoutPrediction>> => {
  const data = await AsyncStorage.getItem(QF_PREDICTIONS_KEY);
  return data ? JSON.parse(data) : {};
};

export const saveSFPredictions = async (predictions: Record<number, LocalKnockoutPrediction>) => {
  await AsyncStorage.setItem(SF_PREDICTIONS_KEY, JSON.stringify(predictions));
};

export const getSFPredictions = async (): Promise<Record<number, LocalKnockoutPrediction>> => {
  const data = await AsyncStorage.getItem(SF_PREDICTIONS_KEY);
  return data ? JSON.parse(data) : {};
};

export const saveBronzeFinalPredictions = async (predictions: Record<number, LocalKnockoutPrediction>) => {
  await AsyncStorage.setItem(BRONZE_FINAL_PREDICTIONS_KEY, JSON.stringify(predictions));
};

export const getBronzeFinalPredictions = async (): Promise<Record<number, LocalKnockoutPrediction>> => {
  const data = await AsyncStorage.getItem(BRONZE_FINAL_PREDICTIONS_KEY);
  return data ? JSON.parse(data) : {};
};

export const saveFinalPredictions = async (predictions: Record<number, LocalKnockoutPrediction>) => {
  await AsyncStorage.setItem(FINAL_PREDICTIONS_KEY, JSON.stringify(predictions));
};

export const getFinalPredictions = async (): Promise<Record<number, LocalKnockoutPrediction>> => {
  const data = await AsyncStorage.getItem(FINAL_PREDICTIONS_KEY);
  return data ? JSON.parse(data) : {};
};

export const getAllAntePostPredictions = async (): Promise<{
  group: Record<string, LocalGroupPrediction>;
  r32: Record<number, LocalKnockoutPrediction>;
  r16: Record<number, LocalKnockoutPrediction>;
  qf: Record<number, LocalKnockoutPrediction>;
  sf: Record<number, LocalKnockoutPrediction>;
  bronzeFinal: Record<number, LocalKnockoutPrediction>;
  final: Record<number, LocalKnockoutPrediction>;
}> => {
  const [group, r32, r16, qf, sf, bronzeFinal, final] = await Promise.all([
    getGroupPredictions(),
    getR32Predictions(),
    getR16Predictions(),
    getQFPredictions(),
    getSFPredictions(),
    getBronzeFinalPredictions(),
    getFinalPredictions(),
  ]);
  return { group, r32, r16, qf, sf, bronzeFinal, final };
};

export const clearAllAntePostPredictions = async () => {
  await Promise.all([
    AsyncStorage.removeItem(GROUP_PREDICTIONS_KEY),
    AsyncStorage.removeItem(R32_PREDICTIONS_KEY),
    AsyncStorage.removeItem(R16_PREDICTIONS_KEY),
    AsyncStorage.removeItem(QF_PREDICTIONS_KEY),
    AsyncStorage.removeItem(SF_PREDICTIONS_KEY),
    AsyncStorage.removeItem(BRONZE_FINAL_PREDICTIONS_KEY),
    AsyncStorage.removeItem(FINAL_PREDICTIONS_KEY),
  ]);
};

/** True when the user has submitted ante post (final match saved on server). */
export const checkAntePostSubmittedOnServer = async (userId: string): Promise<boolean> => {
  const { data, error } = await wcSupabase
    .from('predictions')
    .select('id')
    .eq('user_id', userId)
    .eq('prediction_type', 'ante_post')
    .eq('match_number', ANTE_POST_FINAL_MATCH_NUMBER)
    .not('home_score', 'is', null)
    .not('away_score', 'is', null)
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
};

/** @deprecated Prefer checkAntePostSubmittedOnServer — kept for legacy callers. */
export const checkAntePostLockedStatus = async (userId: string): Promise<boolean> => {
  return checkAntePostSubmittedOnServer(userId);
};

/**
 * Whether ante post picks are locked in (read-only).
 * Server is authoritative when logged in (includes admin reopen).
 * Falls back to device flag when offline / no session.
 */
export const getAntePostLockedStatus = async (userId?: string | null): Promise<boolean> => {
  let uid = userId ?? null;
  if (!uid) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      uid = session?.user?.id ?? null;
    } catch {
      uid = null;
    }
  }

  if (uid) {
    const status = await fetchAntePostLockStatusFromServer(uid);
    if (status.adminReopened) {
      await setAntePostLockedStatus(false);
      return false;
    }
    if (status.locked) {
      await setAntePostLockedStatus(true);
      return true;
    }
    if (status.submitted) {
      await setAntePostLockedStatus(true);
      return true;
    }
    const legacySubmitted = await checkAntePostSubmittedOnServer(uid);
    if (legacySubmitted) {
      await setAntePostLockedStatus(true);
      return true;
    }
    await setAntePostLockedStatus(false);
    return false;
  }

  const local = await AsyncStorage.getItem(IS_LOCKED_KEY);
  return local === 'true';
};

/** Call after successful final submit so all devices respect lock via server. */
export const syncAntePostSubmittedLock = async (): Promise<void> => {
  try {
    await markAntePostSubmittedOnServer();
  } catch {
    /* migration may not be applied yet; local lock still applies */
  }
  await setAntePostLockedStatus(true);
};

export const setAntePostLockedStatus = async (isLocked: boolean) => {
  await AsyncStorage.setItem(IS_LOCKED_KEY, isLocked.toString());
};

export const updateAntePostLockedStatus = async (userId: string): Promise<boolean> => {
  const isLocked = await checkAntePostLockedStatus(userId);
  await setAntePostLockedStatus(isLocked);
  return isLocked;
};

const nonEmptyPred = (rec: Record<number, LocalKnockoutPrediction>) => Object.keys(rec).length > 0;

/** True if any saved knockout predictions exist for rounds after `anchor`. */
export async function hasDownstreamKnockoutPredictions(anchor: KnockoutDownstreamAnchor): Promise<boolean> {
  const [r16, qf, sf, bronze, final] = await Promise.all([
    getR16Predictions(),
    getQFPredictions(),
    getSFPredictions(),
    getBronzeFinalPredictions(),
    getFinalPredictions(),
  ]);
  switch (anchor) {
    case 'r32':
      return nonEmptyPred(r16) || nonEmptyPred(qf) || nonEmptyPred(sf) || nonEmptyPred(bronze) || nonEmptyPred(final);
    case 'r16':
      return nonEmptyPred(qf) || nonEmptyPred(sf) || nonEmptyPred(bronze) || nonEmptyPred(final);
    case 'qf':
      return nonEmptyPred(sf) || nonEmptyPred(bronze) || nonEmptyPred(final);
    case 'sf':
      return nonEmptyPred(bronze) || nonEmptyPred(final);
    case 'bronze':
      return nonEmptyPred(final);
    default:
      return false;
  }
}

const KEYS_AFTER_R32: string[] = [
  R16_PREDICTIONS_KEY,
  R16_BRACKET_KEY,
  R16_FOR_QF_KEY,
  QF_PREDICTIONS_KEY,
  QF_BRACKET_KEY,
  QF_FOR_SF_KEY,
  SF_PREDICTIONS_KEY,
  SF_BRACKET_KEY,
  SF_FOR_FINAL_KEY,
  BRONZE_FINAL_PREDICTIONS_KEY,
  BRONZE_BRACKET_KEY,
  FINAL_PREDICTIONS_KEY,
  FINAL_BRACKET_KEY,
  R32_FOR_R16_KEY,
];

const KEYS_AFTER_R16: string[] = [
  QF_PREDICTIONS_KEY,
  QF_BRACKET_KEY,
  QF_FOR_SF_KEY,
  SF_PREDICTIONS_KEY,
  SF_BRACKET_KEY,
  SF_FOR_FINAL_KEY,
  BRONZE_FINAL_PREDICTIONS_KEY,
  BRONZE_BRACKET_KEY,
  FINAL_PREDICTIONS_KEY,
  FINAL_BRACKET_KEY,
];

const KEYS_AFTER_QF: string[] = [
  SF_PREDICTIONS_KEY,
  SF_BRACKET_KEY,
  SF_FOR_FINAL_KEY,
  BRONZE_FINAL_PREDICTIONS_KEY,
  BRONZE_BRACKET_KEY,
  FINAL_PREDICTIONS_KEY,
  FINAL_BRACKET_KEY,
];

const KEYS_AFTER_SF: string[] = [
  BRONZE_FINAL_PREDICTIONS_KEY,
  BRONZE_BRACKET_KEY,
  FINAL_PREDICTIONS_KEY,
  FINAL_BRACKET_KEY,
];

const KEYS_AFTER_BRONZE: string[] = [FINAL_PREDICTIONS_KEY, FINAL_BRACKET_KEY];

/** Remove local knockout picks and brackets from the round after `anchor` through Final. */
export async function clearDownstreamAntePostKnockoutData(anchor: KnockoutDownstreamAnchor): Promise<void> {
  let keys: string[];
  switch (anchor) {
    case 'r32':
      keys = KEYS_AFTER_R32;
      break;
    case 'r16':
      keys = KEYS_AFTER_R16;
      break;
    case 'qf':
      keys = KEYS_AFTER_QF;
      break;
    case 'sf':
      keys = KEYS_AFTER_SF;
      break;
    case 'bronze':
      keys = KEYS_AFTER_BRONZE;
      break;
    default:
      keys = [];
  }
  if (keys.length === 0) return;
  await AsyncStorage.multiRemove(keys);
}
