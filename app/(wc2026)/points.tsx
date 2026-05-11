import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

export default function WorldCupPointsScreen() {
  const theme = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl, maxWidth: 800, width: '100%', alignSelf: 'center' },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
        },
        subtitle: {
          fontFamily: theme.fontFamily.light,
          fontSize: 14,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.lg,
          lineHeight: 20,
        },
        card: {
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.md,
        },
        cardTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: 6,
        },
        body: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
          lineHeight: 22,
        },
      }),
    [theme]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Points System</Text>
      <Text style={styles.subtitle}>
        We’ll align football scoring once the final rules are confirmed. This screen is here so the WC web menu matches the Racing app.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Coming soon</Text>
        <Text style={styles.body}>
          You’ll be able to see how points are awarded for correct results, correct winners, and stage progression. For now, focus on
          completing your predictions.
        </Text>
      </View>
    </ScrollView>
  );
}

