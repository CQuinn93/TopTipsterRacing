import { useEffect, useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getLastRoute } from '@/lib/lastRoute';

export default function Index() {
  const theme = useTheme();
  const { session, isLoading } = useAuth();
  const [resolvedRoute, setResolvedRoute] = useState<string | null>(null);

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
      if (!session) {
        if (!cancelled) setResolvedRoute(null);
        return;
      }
      const last = await getLastRoute();
      if (!cancelled) setResolvedRoute(last || '/competition-hub');
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
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
