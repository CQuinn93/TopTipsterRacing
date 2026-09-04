import { useEffect, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getProfileRole, isOwnerRole } from '@/lib/adminSession';
import {
  canAccessGameMode,
  getHubGameModes,
  type HubGameModeKey,
} from '@/lib/hubGameModes';
import { fetchMyEntitlements, isGamemasterAccount } from '@/lib/subscriptionEntitlements';

/**
 * Redirects non-owners away when a hub game mode is closed.
 * Owner and Gamemaster always have access (GMs create from paid quotes).
 */
export function useGameModeGuard(mode: HubGameModeKey): boolean {
  const { userId } = useAuth();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const modes = await getHubGameModes();
        let isOwner = false;
        let isGamemaster = false;
        if (userId) {
          const role = await getProfileRole(userId);
          isOwner = isOwnerRole(role);
          if (!isOwner) {
            const ent = await fetchMyEntitlements();
            isGamemaster = isGamemasterAccount(ent);
          }
        }
        const ok = canAccessGameMode(mode, modes, isOwner) || isGamemaster;
        if (cancelled) return;
        if (!ok) {
          router.replace('/competition-hub' as any);
          setAllowed(false);
        } else {
          setAllowed(true);
        }
      } catch {
        if (!cancelled) router.replace('/competition-hub' as any);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, userId]);

  return checking ? false : allowed;
}

export function GameModeGate({
  mode,
  children,
}: {
  mode: HubGameModeKey;
  children: ReactNode;
}) {
  const theme = useTheme();
  const allowed = useGameModeGuard(mode);

  if (!allowed) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return <>{children}</>;
}
