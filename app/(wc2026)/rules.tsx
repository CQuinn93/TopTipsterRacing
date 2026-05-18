import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';

import { useTheme } from '@/contexts/ThemeContext';
import { wcHref } from '@/features/wc2026/utils/href';

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
        link: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '700',
          color: theme.colors.accent,
          marginBottom: theme.spacing.md,
          textDecorationLine: 'underline',
        },
      }),
    [theme]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Rules</Text>
      <Text style={styles.rule}>
        Make match day picks for each open fixture: the result (1X2), total goals, and both teams to score. You can edit picks
        until kick-off unless we say otherwise.
      </Text>
      <Text style={styles.rule}>
        Join a mini-league with an access code from your organiser. Your picks are the same in every league; each mini-league
        has its own leaderboard ranked on match day points.
      </Text>
      <Text style={styles.rule}>
        Scoring for match day picks (including per-player drawers on mini-league leaderboards) is described on the Points
        System screen.
      </Text>
      <TouchableOpacity onPress={() => router.push(wcHref('/(wc2026)/points') as any)} activeOpacity={0.7}>
        <Text style={styles.link}>Open Points System</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
