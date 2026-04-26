import { wcSupabase } from '@/features/wc2026/lib/supabase';

export interface Prediction {
  id: string;
  user_id: string;
  match_id: string | null;
  match_number: number | null;
  prediction_type: 'ante_post' | 'live';
  home_score: number | null;
  away_score: number | null;
  predicted_winner_id: string | null;
  points_awarded: number | null;
  is_correct: boolean | null;
  created_at: string;
  updated_at: string;
  predicted_winner?: {
    id: string;
    country_code: string;
    country_name: string;
  };
}

export const getUserPredictions = async (userId: string): Promise<Prediction[]> => {
  const { data, error } = await wcSupabase
    .from('predictions')
    .select(
      `
      *,
      predicted_winner:teams!predictions_predicted_winner_id_fkey(id, country_code, country_name)
    `
    )
    .eq('user_id', userId)
    .order('match_number', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const upsertPredictionByMatchNumber = async (
  userId: string,
  matchNumber: number,
  predictionType: 'ante_post' | 'live',
  homeScore: number | null,
  awayScore: number | null,
  predictedWinnerId: string | null = null,
  matchId: string | null = null
): Promise<Prediction> => {
  const predictionData = {
    user_id: userId,
    match_id: matchId ?? null,
    match_number: matchNumber,
    prediction_type: predictionType,
    home_score: homeScore ?? null,
    away_score: awayScore ?? null,
    predicted_winner_id: predictedWinnerId ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await wcSupabase
    .from('predictions')
    .upsert(predictionData, {
      onConflict: 'user_id,match_number,prediction_type',
    })
    .select(
      `
      *,
      predicted_winner:teams!predictions_predicted_winner_id_fkey(id, country_code, country_name)
    `
    )
    .single();

  if (error) throw error;
  if (!data) throw new Error('No data returned from upsert operation');
  return data;
};
