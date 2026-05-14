import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/contexts/ThemeContext';
import { wcHref } from '@/features/wc2026/utils/href';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace(wcHref('/(wc2026)/(tabs)'));
}

export default function WorldCupPointsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
          paddingTop: Platform.OS === 'web' ? 12 : insets.top + 8,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
        backHit: { padding: 8, marginLeft: -4 },
        headerTitle: {
          flex: 1,
          fontFamily: theme.fontFamily.regular,
          fontSize: 17,
          fontWeight: '700',
          color: theme.colors.text,
        },
        scroll: { flex: 1 },
        content: {
          padding: theme.spacing.md,
          paddingBottom: insets.bottom + theme.spacing.xxl,
          maxWidth: 800,
          width: '100%',
          alignSelf: 'center',
        },
        intro: {
          fontFamily: theme.fontFamily.light,
          fontSize: 14,
          color: theme.colors.textSecondary,
          lineHeight: 21,
          marginBottom: theme.spacing.lg,
        },
        sectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
        },
        card: {
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.lg,
        },
        tierRow: {
          flexDirection: 'row',
          gap: theme.spacing.xs,
          marginBottom: theme.spacing.md,
        },
        tierBox: {
          flex: 1,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: 4,
          alignItems: 'center',
        },
        tierPoints: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '800',
          color: theme.colors.accent,
        },
        tierLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          color: theme.colors.text,
          marginTop: 4,
          textAlign: 'center',
        },
        desc: {
          fontFamily: theme.fontFamily.light,
          fontSize: 13,
          color: theme.colors.textSecondary,
          lineHeight: 20,
          marginBottom: theme.spacing.sm,
        },
        bonusBox: {
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.surface,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          alignItems: 'center',
          marginTop: theme.spacing.xs,
        },
        bonusPoints: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 22,
          fontWeight: '800',
          color: theme.colors.accent,
        },
        bonusLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '700',
          color: theme.colors.text,
          marginTop: 6,
          textAlign: 'center',
        },
        note: {
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.textMuted,
          lineHeight: 18,
          marginTop: theme.spacing.sm,
          fontStyle: 'italic',
        },
      }),
    [theme, insets.bottom, insets.top]
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backHit} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Points system
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          On a mini-league leaderboard, tap a player to open their drawer and switch between ante post and match day picks.
          You earn only one ante-post tier per match (never 1 + 1.5 together).
        </Text>

        <Text style={styles.sectionTitle}>Ante post</Text>
        <View style={styles.card}>
          <View style={styles.tierRow}>
            <View style={styles.tierBox}>
              <Text style={styles.tierPoints}>1</Text>
              <Text style={styles.tierLabel}>Result</Text>
            </View>
            <View style={styles.tierBox}>
              <Text style={styles.tierPoints}>1.5</Text>
              <Text style={styles.tierLabel}>Close</Text>
            </View>
            <View style={styles.tierBox}>
              <Text style={styles.tierPoints}>3</Text>
              <Text style={styles.tierLabel}>Exact</Text>
            </View>
          </View>
          <Text style={styles.desc}>
            <Text style={{ fontWeight: '700' as const }}>Result (1 pt):</Text> you predicted the right outcome only — home win, draw, or away
            win — but not an exact scoreline and not a “close” total-goals pick.
          </Text>
          <Text style={styles.desc}>
            <Text style={{ fontWeight: '700' as const }}>Close (1.5 pts):</Text> correct outcome and your predicted total goals (home + away)
            is exactly one goal away from the actual total in the match.
          </Text>
          <Text style={styles.desc}>
            <Text style={{ fontWeight: '700' as const }}>Exact (3 pts):</Text> both home and away goals match the final score.
          </Text>
          <Text style={styles.note}>
            Only one of these applies per match — whichever tier you qualify for (exact beats close beats result-only).
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Match day picks</Text>
        <View style={styles.card}>
          <Text style={[styles.intro, { marginBottom: theme.spacing.sm }]}>
            After 90 minutes (plus stoppage): result (1X2), total goals, and both teams to score. Each line can earn 1 point on its own.
          </Text>
          <View style={styles.tierRow}>
            <View style={styles.tierBox}>
              <Text style={styles.tierPoints}>1</Text>
              <Text style={styles.tierLabel}>1X2</Text>
            </View>
            <View style={styles.tierBox}>
              <Text style={styles.tierPoints}>1</Text>
              <Text style={styles.tierLabel}>Goals</Text>
            </View>
            <View style={styles.tierBox}>
              <Text style={styles.tierPoints}>1</Text>
              <Text style={styles.tierLabel}>BTTS</Text>
            </View>
          </View>
          <View style={styles.bonusBox}>
            <Text style={styles.bonusPoints}>5</Text>
            <Text style={styles.bonusLabel}>All three correct</Text>
          </View>
          <Text style={styles.desc}>
            If all three tips are right on the same match, you score <Text style={{ fontWeight: '700' as const }}>5 points</Text> for that
            match instead of only adding three separate 1s.
          </Text>
          <Text style={styles.note}>Extra time and penalties do not count unless we say otherwise for a specific market.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
