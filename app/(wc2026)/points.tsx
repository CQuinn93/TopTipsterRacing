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
          On a mini-league leaderboard, tap a player to open their match day picks. Points are awarded per match after full
          time.
        </Text>

        <Text style={styles.sectionTitle}>Match day picks</Text>
        <View style={styles.card}>
          <Text style={[styles.intro, { marginBottom: theme.spacing.sm }]}>
            After 90 minutes (plus stoppage): result (1X2), total goals, and both teams to score. Points add up per line; get all
            three right for a bonus.
          </Text>
          <View style={styles.tierRow}>
            <View style={styles.tierBox}>
              <Text style={styles.tierPoints}>1</Text>
              <Text style={styles.tierLabel}>1X2</Text>
            </View>
            <View style={styles.tierBox}>
              <Text style={styles.tierPoints}>2</Text>
              <Text style={styles.tierLabel}>Goals</Text>
            </View>
            <View style={styles.tierBox}>
              <Text style={styles.tierPoints}>1</Text>
              <Text style={styles.tierLabel}>BTTS</Text>
            </View>
          </View>
          <View style={styles.bonusBox}>
            <Text style={styles.bonusPoints}>+1</Text>
            <Text style={styles.bonusLabel}>All three correct (5 max)</Text>
          </View>
          <Text style={styles.desc}>
            Correct lines score <Text style={{ fontWeight: '700' as const }}>1 + 2 + 1</Text> when you get 1X2, total goals, and BTTS
            right. If all three are correct on the same match, you also get a <Text style={{ fontWeight: '700' as const }}>+1 bonus</Text>{' '}
            (5 points maximum for that match).
          </Text>
          <Text style={styles.note}>Extra time and penalties do not count unless we say otherwise for a specific market.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
