import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getUpcomingFixtures, type Match } from '@/features/wc2026/services/fixtures';
import { getSharedProfile } from '@/features/wc2026/services/profile';
import { wcHref } from '@/features/wc2026/utils/href';

export function WorldCupHomeScreen() {
  const theme = useTheme();
  const { userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('there');
  const [upcomingFixtures, setUpcomingFixtures] = useState<Match[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        if (userId) {
          const profile = await getSharedProfile(userId);
          if (!cancelled && profile?.username) setUsername(profile.username);
        }
        const fixtures = await getUpcomingFixtures(8);
        if (!cancelled) setUpcomingFixtures(fixtures);
      } catch {
        if (!cancelled) setUpcomingFixtures([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const nextFixture = upcomingFixtures[0] ?? null;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrapper: { flex: 1, backgroundColor: theme.colors.background },
        container: { flex: 1 },
        content: { padding: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg },
        headerStrip: {
          marginHorizontal: -theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          marginBottom: theme.spacing.md,
        },
        headerStripInner: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        headerWelcome: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          color: theme.colors.textMuted,
          marginBottom: 2,
        },
        headerHello: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '700',
          color: theme.colors.text,
        },
        accountLink: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
        },
        sectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
          marginTop: theme.spacing.lg,
          marginBottom: theme.spacing.sm,
        },
        sectionTitleFirst: { marginTop: 0 },
        nextFixtureCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        nextFixtureLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: 6,
        },
        nextFixtureTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 17,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: 4,
        },
        nextFixtureMeta: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.sm,
        },
        nextFixtureBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          backgroundColor: theme.colors.accent,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.sm,
          alignSelf: 'flex-start',
        },
        nextFixtureBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: '#000000',
        },
        emptyText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.md,
        },
        competitionCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
        },
        compName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
        },
        compMeta: {
          marginTop: 4,
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
      }),
    [theme]
  );

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerStrip}>
          <View style={styles.headerStripInner}>
            <View>
              <Text style={styles.headerWelcome}>Top Tipster Football</Text>
              <Text style={styles.headerHello}>Hello {username}</Text>
              <Text style={styles.headerWelcome}>WC2026</Text>
            </View>
            <TouchableOpacity style={styles.accountLink} onPress={() => router.replace(wcHref('/competition-hub'))} activeOpacity={0.7}>
              <Ionicons name="swap-horizontal-outline" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.nextFixtureCard}>
          <Text style={styles.nextFixtureLabel}>Next match</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : nextFixture ? (
            <>
              <Text style={styles.nextFixtureTitle}>
                {nextFixture.home_team?.country_name ?? nextFixture.home_team_id} vs {nextFixture.away_team?.country_name ?? nextFixture.away_team_id}
              </Text>
              <Text style={styles.nextFixtureMeta}>
                {new Date(nextFixture.match_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                {new Date(nextFixture.match_date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <TouchableOpacity
                style={styles.nextFixtureBtn}
                onPress={() => router.push(wcHref('/(wc2026)/ante-post-navigation'))}
                activeOpacity={0.8}
              >
                <Text style={styles.nextFixtureBtnText}>My selections</Text>
                <Ionicons name="arrow-forward" size={14} color="#000000" />
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.emptyText}>No upcoming fixtures loaded yet.</Text>
          )}
        </View>

        <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>Your competitions</Text>
        <View style={styles.competitionCard}>
          <Text style={styles.compName}>Top Tipster Football - WC2026</Text>
          <Text style={styles.compMeta}>Predictions competition linked to your app account.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
