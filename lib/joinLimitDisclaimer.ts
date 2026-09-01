import { Alert, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

export type JoinLimitWarning = {
  needs_warning?: boolean;
  alive_count?: number;
  eliminated_in_live_count?: number;
  max_joins?: number | null;
  is_rejoin_code?: boolean;
  is_owner?: boolean;
};

export function joinLimitWarningMessage(warning: JoinLimitWarning): string {
  const alive = warning.alive_count ?? 0;
  const eliminated = warning.eliminated_in_live_count ?? 0;
  const max = warning.max_joins ?? 2;
  const aliveAfterJoin = alive + 1;

  return (
    `You are alive in ${alive} competition${alive === 1 ? '' : 's'} and eliminated in ${eliminated} other live competition${eliminated === 1 ? '' : 's'}. ` +
    `If you join this league you will be alive in ${aliveAfterJoin} competition${aliveAfterJoin === 1 ? '' : 's'} (your plan allows ${max}). ` +
    `If a rollover opens in an eliminated competition, you may not be able to rejoin while you are still alive in ${max} other competitions. ` +
    'Please confirm that you understand.'
  );
}

export async function fetchJoinLimitWarning(accessCode?: string): Promise<JoinLimitWarning> {
  const { data, error } = await (supabase as any).rpc('get_my_join_limit_warning', {
    p_access_code: accessCode?.trim() || null,
  });
  if (error) {
    console.warn('[subscription] get_my_join_limit_warning failed', error.message);
    return { needs_warning: false };
  }
  return (data as JoinLimitWarning) ?? { needs_warning: false };
}

/**
 * Shows rollover/limit disclaimer when needed. Returns true if the user confirmed (or no warning).
 */
export function confirmJoinLimitDisclaimer(accessCode?: string): Promise<boolean> {
  return fetchJoinLimitWarning(accessCode).then((warning) => {
    if (!warning.needs_warning) return true;

    const message = joinLimitWarningMessage(warning);
    const title = 'Competition join limit';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.confirm(`${title}\n\n${message}`);
    }

    return new Promise<boolean>((resolve) => {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'I understand', onPress: () => resolve(true) },
      ]);
    });
  });
}
