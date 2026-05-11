import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

export default function WorldCupRulesScreen() {
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
          marginBottom: theme.spacing.lg,
        },
        rule: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.textSecondary,
          lineHeight: 24,
          marginBottom: theme.spacing.md,
        },
      }),
    [theme]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Rules</Text>
      <Text style={styles.rule}>
        Make predictions for each match. Your Group Stage predictions are used to calculate final standings and generate the Round of 32
        bracket.
      </Text>
      <Text style={styles.rule}>
        Knockout rounds (Round of 32 → Round of 16 → Quarter Finals → Semi Finals → Bronze Final) are generated from your previous-round
        predictions.
      </Text>
      <Text style={styles.rule}>
        Once you submit your final ante post selections, they are locked and cannot be edited. You can still view your picks and results.
      </Text>
    </ScrollView>
  );
}

