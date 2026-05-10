import AsyncStorage from '@react-native-async-storage/async-storage';

import { WC2026_STORAGE_PREFIX } from '@/features/wc2026/constants/storage-keys';
import { wcSupabase } from '@/features/wc2026/lib/supabase';

const GROUP_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_group_predictions`;
const R32_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_r32_predictions`;
const R16_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_r16_predictions`;
const QF_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_qf_predictions`;
const SF_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_sf_predictions`;
const BRONZE_FINAL_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_bronze_final_predictions`;
const FINAL_PREDICTIONS_KEY = `${WC2026_STORAGE_PREFIX}ante_post_final_predictions`;
const IS_LOCKED_KEY = `${WC2026_STORAGE_PREFIX}ante_post_is_locked`;

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

export const checkAntePostLockedStatus = async (userId: string): Promise<boolean> => {
  const { data, error } = await wcSupabase
    .from('predictions')
    .select('id')
    .eq('user_id', userId)
    .eq('prediction_type', 'ante_post')
    .limit(10);

  if (error) return false;
  return (data?.length ?? 0) >= 10;
};

export const getAntePostLockedStatus = async (): Promise<boolean> => {
  const data = await AsyncStorage.getItem(IS_LOCKED_KEY);
  return data === 'true';
};

export const setAntePostLockedStatus = async (isLocked: boolean) => {
  await AsyncStorage.setItem(IS_LOCKED_KEY, isLocked.toString());
};

export const updateAntePostLockedStatus = async (userId: string): Promise<boolean> => {
  const isLocked = await checkAntePostLockedStatus(userId);
  await setAntePostLockedStatus(isLocked);
  return isLocked;
};
