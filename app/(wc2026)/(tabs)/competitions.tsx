import { useEffect, useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getUserPredictions } from '@/features/wc2026/services/predictions';

export default function WorldCupCompetitionsTab() {
  const theme = useTheme();
  const { session, userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasEntries, setHasEntries] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!userId) {
        setHasEntries(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const predictions = await getUserPredictions(userId);
        if (!cancelled) setHasEntries(predictions.length > 0);
      } catch {
        if (!cancelled) setHasEntries(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { padding: theme.spacing.md, gap: theme.spacing.md },
        card: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 17,
          fontWeight: '700',
          color: theme.colors.text,
        },
        body: {
          marginTop: 6,
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textSecondary,
        },
      }),
    [theme]
  );

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator color={theme.colors.accent} /> : null}
        <View style={styles.card}>
          <Text style={styles.title}>Top Tipster Football - WC2026</Text>
          <Text style={styles.body}>
            {hasEntries
              ? 'You are entered in WC2026 and have started making selections.'
              : 'You are entered in WC2026. Your picks will appear once you start making selections.'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
