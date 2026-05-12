import { Redirect, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useCallback, useMemo, useState } from 'react';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { wcHref } from '@/features/wc2026/utils/href';
import { getMatchDayTipsUnlocked } from '@/features/wc2026/services/tournament-gates';
import {
  wcFootballListMyCompetitions,
  type WcFootballCompetition,
} from '@/features/wc2026/services/football-competitions';
import { useNarrowWebCompact, cfs } from '@/lib/narrowWebTypography';

export default function WorldCupSelectionsTab() {
  const theme = useTheme();
  const compact = useNarrowWebCompact();
  const { session, userId } = useAuth();
  const [matchDayOpen, setMatchDayOpen] = useState(false);
  const [gatesLoading, setGatesLoading] = useState(true);
  const [leagues, setLeagues] = useState<WcFootballCompetition[]>([]);
  const [leaguesLoading, setLeaguesLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadGates = useCallback(async () => {
    try {
      const open = await getMatchDayTipsUnlocked().catch(() => false);
      setMatchDayOpen(open);
    } finally {
      setGatesLoading(false);
    }
  }, []);

  const loadLeagues = useCallback(async () => {
    if (!userId) {
      setLeagues([]);
      setLeaguesLoading(false);
      return;
    }
    try {
      const mine = await wcFootballListMyCompetitions();
      setLeagues(mine);
    } finally {
      setLeaguesLoading(false);
    }
  }, [userId]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadGates(), loadLeagues()]);
  }, [loadGates, loadLeagues]);

  useFocusEffect(
    useCallback(() => {
      void refreshAll();
    }, [refreshAll])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  }, [refreshAll]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: {
          padding: compact ? theme.spacing.md : theme.spacing.lg,
          paddingBottom: theme.spacing.xxl,
          maxWidth: 720,
          width: '100%',
          alignSelf: 'center',
        },
        makePicksSection: {
          marginBottom: theme.spacing.lg,
        },
        makePicksSectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(14, compact),
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: 4,
        },
        makePicksSectionSubtitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(12, compact),
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.sm,
          lineHeight: compact ? 16 : 18,
        },
        raceCardsList: { gap: theme.spacing.sm },
        raceCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        raceCardOpen: {
          borderColor: theme.colors.border,
        },
        raceCardClosed: {
          borderColor: 'rgba(185, 28, 28, 0.45)',
          opacity: 0.92,
        },
        raceCardActive: {
          borderColor: theme.colors.accent,
          borderWidth: 2,
        },
        raceCardRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        },
        raceCardLeft: { flex: 1, minWidth: 0 },
        raceCardRight: { alignItems: 'flex-end', marginLeft: theme.spacing.sm, justifyContent: 'center' },
        raceCardTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(15, compact),
          fontWeight: '600',
          color: theme.colors.text,
        },
        raceCardMeta: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(11, compact),
          color: theme.colors.textMuted,
          marginTop: 4,
        },
        raceCardStatus: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(11, compact),
          color: theme.colors.accent,
          marginTop: 4,
        },
        raceCardStatusClosed: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(11, compact),
          color: '#b91c1c',
          marginTop: 4,
          fontStyle: 'italic',
        },
        sectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(18, compact),
          color: theme.colors.textSecondary,
          marginTop: theme.spacing.lg,
          marginBottom: theme.spacing.md,
        },
        emptyState: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.xl,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
        },
        emptyStateTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(17, compact),
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
        },
        emptyStateText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(14, compact),
          color: theme.colors.textMuted,
          textAlign: 'center',
          marginBottom: theme.spacing.md,
          lineHeight: compact ? 20 : 22,
        },
        emptyStateButton: {
          backgroundColor: theme.colors.accent,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
        },
        emptyStateButtonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(14, compact),
          color: theme.colors.black,
          fontWeight: '600',
        },
        leagueCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          marginBottom: theme.spacing.xs,
        },
        leagueCardRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        },
        leagueName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(14, compact),
          fontWeight: '600',
          color: theme.colors.text,
          flex: 1,
          minWidth: 0,
        },
        leagueHint: {
          fontFamily: theme.fontFamily.regular,
          fontSize: cfs(11, compact),
          color: theme.colors.textMuted,
          marginTop: 4,
        },
        chevronWrap: { paddingLeft: 4 },
      }),
    [theme, compact]
  );

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.colors.accent} />
      }
    >
      <View style={styles.makePicksSection}>
        <Text style={styles.makePicksSectionTitle}>Make your predictions</Text>
        <Text style={styles.makePicksSectionSubtitle}>
          Open a hub to add or review picks. The same predictions count in every mini-league you join.
        </Text>
        <View style={styles.raceCardsList}>
          <TouchableOpacity
            style={[styles.raceCard, styles.raceCardOpen, styles.raceCardActive]}
            onPress={() => router.push(wcHref('/(wc2026)/ante-post-navigation'))}
            activeOpacity={0.8}
          >
            <View style={styles.raceCardRow}>
              <View style={styles.raceCardLeft}>
                <Text style={styles.raceCardTitle}>Ante post & knockout</Text>
                <Text style={styles.raceCardMeta}>Group stage through final — brackets and scorelines</Text>
                <Text style={styles.raceCardStatus}>Continue or review your stages</Text>
              </View>
              <View style={styles.raceCardRight}>
                <Ionicons name="chevron-forward" size={22} color={theme.colors.accent} />
              </View>
            </View>
          </TouchableOpacity>

          {gatesLoading ? (
            <View style={[styles.raceCard, styles.raceCardOpen]}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : matchDayOpen ? (
            <TouchableOpacity
              style={[styles.raceCard, styles.raceCardOpen, styles.raceCardActive]}
              onPress={() => router.push(wcHref('/(wc2026)/match-day-tips'))}
              activeOpacity={0.8}
            >
              <View style={styles.raceCardRow}>
                <View style={styles.raceCardLeft}>
                  <Text style={styles.raceCardTitle}>Match day tips</Text>
                  <Text style={styles.raceCardMeta}>Round of 32 through final — picks per match</Text>
                  <Text style={styles.raceCardStatus}>Open — tap to make picks</Text>
                </View>
                <View style={styles.raceCardRight}>
                  <Ionicons name="flash" size={20} color={theme.colors.accent} />
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={[styles.raceCard, styles.raceCardClosed]}>
              <View style={styles.raceCardRow}>
                <View style={styles.raceCardLeft}>
                  <Text style={styles.raceCardTitle}>Match day tips</Text>
                  <Text style={styles.raceCardMeta}>Round of 32 through final — live-style match picks</Text>
                  <Text style={styles.raceCardStatusClosed}>Not open yet — check back when the knockout stage is live</Text>
                </View>
                <View style={styles.raceCardRight}>
                  <Ionicons name="lock-closed-outline" size={20} color="#b91c1c" />
                </View>
              </View>
            </View>
          )}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Your selections</Text>

      {leaguesLoading ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginVertical: theme.spacing.md }} />
      ) : leagues.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Join a mini-league</Text>
          <Text style={styles.emptyStateText}>
            Enter an access code on the Competitions tab. Your World Cup picks are shared across leagues; each mini-league has its own leaderboard.
          </Text>
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={() => router.push(wcHref('/(wc2026)/(tabs)/competitions'))}
            activeOpacity={0.85}
          >
            <Text style={styles.emptyStateButtonText}>Go to Competitions</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.makePicksSectionSubtitle, { marginBottom: theme.spacing.sm }]}>
            Mini-leagues you have joined — open Competitions for access codes and leaderboards.
          </Text>
          {leagues.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.leagueCard}
              onPress={() => router.push(wcHref('/(wc2026)/(tabs)/competitions'))}
              activeOpacity={0.75}
            >
              <View style={styles.leagueCardRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.leagueName} numberOfLines={2}>
                    {c.name}
                  </Text>
                  <Text style={styles.leagueHint}>Same picks as above · tap for Competitions</Text>
                </View>
                <View style={styles.chevronWrap}>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}
    </ScrollView>
  );
}
