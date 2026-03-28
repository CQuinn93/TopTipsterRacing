import { supabase } from '@/lib/supabase';

export type JoinCompetitionOutcome =
  | { kind: 'invalid_code' }
  | { kind: 'already_in'; competitionName: string }
  | { kind: 'request_sent'; competitionName: string }
  | { kind: 'error'; message: string };

/**
 * Validates access code and creates a pending join request (or no-ops if already a participant).
 */
export async function joinCompetitionWithAccessCode(params: {
  userId: string;
  code: string;
  displayNameToUse: string;
}): Promise<JoinCompetitionOutcome> {
  const { userId, displayNameToUse } = params;
  const trimmed = params.code.trim().toUpperCase();
  if (!trimmed) {
    return { kind: 'error', message: 'Please enter the access code.' };
  }
  if (!displayNameToUse) {
    return { kind: 'error', message: 'Please enter your display name for the leaderboard.' };
  }

  try {
    const { data: comp, error: compError } = await supabase
      .from('competitions')
      .select('id, name')
      .eq('access_code', trimmed)
      .maybeSingle();

    if (compError) throw compError;
    if (!comp) {
      return { kind: 'invalid_code' };
    }

    const { data: existing } = await supabase
      .from('competition_participants')
      .select('id')
      .eq('competition_id', comp.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (existing) {
      return { kind: 'already_in', competitionName: comp.name };
    }

    const { error: requestError } = await supabase.from('competition_join_requests').upsert(
      {
        competition_id: comp.id,
        user_id: userId,
        display_name: displayNameToUse,
        status: 'pending',
      },
      { onConflict: 'competition_id,user_id' }
    );

    if (requestError) throw requestError;

    return { kind: 'request_sent', competitionName: comp.name };
  } catch (e: unknown) {
    let msg = 'Failed to join competition';
    if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
      msg = (e as { message: string }).message;
    }
    if (e && typeof e === 'object' && 'details' in e && typeof (e as { details: unknown }).details === 'string') {
      msg = `${msg} (${(e as { details: string }).details})`;
    }
    return { kind: 'error', message: msg };
  }
}
