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
  /** Match Day Tips: home win / draw / away win (90 minutes). */
  live_outcome?: 'H' | 'D' | 'A' | null;
  /** Total goals in 90 minutes (user prediction). */
  live_total_goals?: number | null;
  live_btts?: boolean | null;
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

export const getUserPredictionsForMatch = async (
  userId: string,
  matchId: string
): Promise<{ ante_post: Prediction | null; live: Prediction | null }> => {
  const { data, error } = await wcSupabase
    .from('predictions')
    .select(
      `
      *,
      predicted_winner:teams!predictions_predicted_winner_id_fkey(id, country_code, country_name)
    `
    )
    .eq('user_id', userId)
    .eq('match_id', matchId);

  if (error) throw error;
  const rows = (data ?? []) as Prediction[];
  const ante_post = rows.find((p) => p.prediction_type === 'ante_post') ?? null;
  const live = rows.find((p) => p.prediction_type === 'live') ?? null;
  return { ante_post, live };
};

export const getUserPredictionsByMatchNumber = async (
  userId: string,
  matchNumber: number
): Promise<Prediction[]> => {
  const { data, error } = await wcSupabase
    .from('predictions')
    .select(
      `
      *,
      predicted_winner:teams!predictions_predicted_winner_id_fkey(id, country_code, country_name)
    `
    )
    .eq('user_id', userId)
    .eq('match_number', matchNumber);

  if (error) throw error;
  return data || [];
};

export async function deleteAntePostPredictionsForMatchNumbers(
  userId: string,
  matchNumbers: number[]
): Promise<void> {
  if (matchNumbers.length === 0) return;
  const { error } = await wcSupabase
    .from('predictions')
    .delete()
    .eq('user_id', userId)
    .eq('prediction_type', 'ante_post')
    .in('match_number', matchNumbers);
  if (error) throw error;
}

export async function countCompleteAntePostKnockoutPicks(
  userId: string,
  minMatchNumber: number,
  maxMatchNumber: number
): Promise<number> {
  const { data, error } = await wcSupabase
    .from('predictions')
    .select('match_number, home_score, away_score, predicted_winner_id')
    .eq('user_id', userId)
    .eq('prediction_type', 'ante_post')
    .gte('match_number', minMatchNumber)
    .lte('match_number', maxMatchNumber);

  if (error) return 0;
  return (data ?? []).filter((row) => {
    const r = row as {
      home_score: number | null;
      away_score: number | null;
      predicted_winner_id: string | null;
    };
    if (r.home_score == null || r.away_score == null) return false;
    if (r.home_score !== r.away_score) return true;
    return r.predicted_winner_id != null;
  }).length;
}

export const hasRoundOf32Predictions = async (userId: string): Promise<boolean> => {
  const { data, error } = await wcSupabase
    .from('predictions')
    .select('id')
    .eq('user_id', userId)
    .eq('prediction_type', 'ante_post')
    .gte('match_number', 73)
    .lte('match_number', 88)
    .not('match_number', 'is', null)
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
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

export const upsertPrediction = async (
  userId: string,
  matchId: string,
  predictionType: 'ante_post' | 'live',
  homeScore: number | null,
  awayScore: number | null,
  predictedWinnerId: string | null = null
): Promise<Prediction> => {
  const { data: matchData, error: matchError } = await wcSupabase
    .from('matches')
    .select('match_number')
    .eq('id', matchId)
    .single();

  if (matchError || !matchData) throw new Error('Match not found');
  return upsertPredictionByMatchNumber(
    userId,
    matchData.match_number as number,
    predictionType,
    homeScore,
    awayScore,
    predictedWinnerId,
    matchId
  );
};

export type LiveMatchDayFields = {
  outcome: 'H' | 'D' | 'A';
  totalGoals: number;
  btts: boolean;
};

/** Match Day Tips: 1X2, total goals in 90m, BTTS — stored as `prediction_type = live`. */
export const upsertLiveMatchDayPrediction = async (
  userId: string,
  matchId: string,
  matchNumber: number,
  fields: LiveMatchDayFields
): Promise<Prediction> => {
  const predictionData = {
    user_id: userId,
    match_id: matchId,
    match_number: matchNumber,
    prediction_type: 'live' as const,
    live_outcome: fields.outcome,
    live_total_goals: fields.totalGoals,
    live_btts: fields.btts,
    home_score: null as number | null,
    away_score: null as number | null,
    predicted_winner_id: null as string | null,
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
  return data as Prediction;
};
