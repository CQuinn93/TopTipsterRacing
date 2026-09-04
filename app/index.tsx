import { useEffect, useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getLastRoute } from '@/lib/lastRoute';
import { getKioskDeviceConfig } from '@/lib/kioskSession';
import {
  fetchMyEntitlements,
  isGamemasterAccount,
} from '@/lib/subscriptionEntitlements';

export default function Index() {
  const theme = useTheme();
  const { session, isLoading } = useAuth();
  const [resolvedRoute, setResolvedRoute] = useState<string | null>(null);
  const [kioskActive, setKioskActive] = useState<boolean | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        centered: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.colors.background,
        },
      }),
    [theme]
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cfg = await getKioskDeviceConfig();
      if (!cancelled) setKioskActive(!!cfg);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (kioskActive) {
        if (!cancelled) setResolvedRoute('/kiosk');
        return;
      }
      if (!session) {
        if (!cancelled) setResolvedRoute(null);
        return;
      }
      const ent = await fetchMyEntitlements();
      if (isGamemasterAccount(ent)) {
        if (!cancelled) setResolvedRoute('/gamemaster-hub');
        return;
      }
      const last = await getLastRoute();
      const isRemovedWorldCupRoute = !!last && last.includes('wc2026');
      if (!cancelled) {
        setResolvedRoute(
          isRemovedWorldCupRoute ? '/competition-hub' : last || '/competition-hub'
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, kioskActive]);

  if (isLoading || kioskActive === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  if (kioskActive) {
    return <Redirect href={'/kiosk' as any} />;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (!resolvedRoute) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  return <Redirect href={resolvedRoute as any} />;
}
