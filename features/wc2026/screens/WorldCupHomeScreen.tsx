import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { lightTheme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useWcShell } from '@/contexts/WcShellContext';
import { getUpcomingFixtures, type Match } from '@/features/wc2026/services/fixtures';
import { getSharedProfile } from '@/features/wc2026/services/profile';
import { wcHref } from '@/features/wc2026/utils/href';
import { getAntePostLockedStatus } from '@/features/wc2026/services/async-predictions';

const WC_TOURNAMENT_START = new Date('2026-06-11T00:00:00.000Z');
const WC_TOURNAMENT_END = new Date('2026-07-20T04:59:59.000Z');

function tournamentPhase(now: Date): 'upcoming' | 'live' | 'complete' {
  if (now < WC_TOURNAMENT_START) return 'upcoming';
  if (now > WC_TOURNAMENT_END) return 'complete';
  return 'live';
}

export function WorldCupHomeScreen() {
  const theme = useTheme();
  const { userId } = useAuth();
  const { openMenu } = useWcShell();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isNarrowWeb = width < 900;

  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('there');
  const [upcomingFixtures, setUpcomingFixtures] = useState<Match[]>([]);
  const [antePostLocked, setAntePostLocked] = useState(false);
  const [compTab, setCompTab] = useState<'upcoming' | 'live' | 'complete'>('upcoming');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        if (userId) {
          const profile = await getSharedProfile(userId);
          if (!cancelled && profile?.username) setUsername(profile.username);
        }
        const locked = await getAntePostLockedStatus().catch(() => false);
        if (!cancelled) setAntePostLocked(locked);
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
  const phase = tournamentPhase(new Date());
  const showCompetitionInTab = compTab === phase;

  const styles = useMemo(() => {
    const isLight = String(theme.colors.background) === String(lightTheme.colors.background);
    const cardBorder = isLight ? theme.colors.white : theme.colors.border;
    const cardBorderWidth = isLight ? 2 : 1;
    const webCard = isWeb ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 } : {};
    const compact = isWeb && isNarrowWeb;

    return StyleSheet.create({
      wrapper: { flex: 1, backgroundColor: theme.colors.background },
      container: { flex: 1 },
      content: {
        padding: theme.spacing.md,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.lg,
        ...(isWeb ? { padding: 24, paddingBottom: 48 } : {}),
      },
      headerStrip: {
        marginHorizontal: -theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.lg,
        paddingTop: theme.spacing.lg + 4,
        marginBottom: theme.spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        ...(isWeb ? { marginHorizontal: -24 } : {}),
      },
      headerStripInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      },
      headerWelcome: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 10 : 12,
        color: theme.colors.textMuted,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      },
      headerHello: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 18 : 22,
        fontWeight: '700',
        color: theme.colors.text,
      },
      accountLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
      },
      homePrimaryRow: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
        marginBottom: theme.spacing.lg,
      },
      homePrimaryBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: compact ? theme.spacing.sm : theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        backgroundColor: theme.colors.accent,
        borderRadius: theme.radius.md,
      },
      homePrimaryBtnSecondary: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: compact ? theme.spacing.sm : theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      homePrimaryBtnText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 11 : 13,
        fontWeight: '600',
        color: theme.colors.black,
      },
      homePrimaryBtnTextSecondary: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 11 : 13,
        fontWeight: '600',
        color: theme.colors.accent,
      },
      sectionTitle: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 13 : 15,
        fontWeight: '700',
        color: theme.colors.text,
        marginTop: theme.spacing.lg,
        marginBottom: compact ? theme.spacing.xs : theme.spacing.sm,
      },
      sectionTitleFirst: {
        marginTop: 0,
        marginBottom: theme.spacing.sm,
      },
      compTabsRow: {
        flexDirection: 'row',
        width: '100%',
        marginBottom: theme.spacing.sm,
        gap: theme.spacing.xs,
      },
      compTab: {
        flex: 1,
        paddingVertical: compact ? theme.spacing.xs : theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      },
      compTabActive: {
        backgroundColor: theme.colors.accent,
      },
      compTabText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 11 : 13,
        color: theme.colors.textSecondary,
      },
      compTabTextActive: {
        color: theme.colors.white,
        fontWeight: '600',
      },
      homeCompHint: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 10 : 11,
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.xs,
        lineHeight: compact ? 14 : 15,
      },
      muted: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 11 : 13,
        color: theme.colors.textMuted,
      },
      compDropdownTrigger: {
        flexDirection: 'column',
        alignItems: 'stretch',
        backgroundColor: theme.colors.surface,
        borderRadius: isWeb ? 14 : theme.radius.lg,
        paddingVertical: compact ? theme.spacing.sm : theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
        marginBottom: theme.spacing.sm,
        gap: theme.spacing.sm,
        ...webCard,
      },
      compMeetingNameAbove: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 13 : 16,
        fontWeight: '700',
        color: theme.colors.text,
        marginBottom: compact ? 2 : 4,
      },
      compMetaAbove: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 11 : 12,
        color: theme.colors.textMuted,
      },
      modeDivider: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        marginTop: theme.spacing.xs,
        paddingTop: theme.spacing.sm,
        gap: theme.spacing.sm,
      },
      modeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceElevated,
      },
      modeLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
      modeText: { flex: 1, minWidth: 0 },
      modeTitle: { fontFamily: theme.fontFamily.regular, fontSize: 14, fontWeight: '700', color: theme.colors.text },
      modeDesc: { fontFamily: theme.fontFamily.light, fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
      statusPill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: theme.radius.full,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
      },
      statusText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 10,
        fontWeight: '700',
        color: theme.colors.textMuted,
        letterSpacing: 0.4,
      },
      competitionsCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: isWeb ? 14 : theme.radius.lg,
        padding: compact ? theme.spacing.sm : isWeb ? 20 : theme.spacing.sm,
        marginBottom: theme.spacing.sm,
        marginTop: compact ? 0 : theme.spacing.xs,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
        overflow: 'hidden',
        ...webCard,
      },
      statsTitle: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 11 : 12,
        fontWeight: '600',
        color: theme.colors.textMuted,
        marginTop: compact ? 2 : theme.spacing.sm,
        marginBottom: theme.spacing.sm,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      },
      statsGrid: {
        gap: theme.spacing.xs,
      },
      statsRow: {
        flexDirection: 'row',
        gap: theme.spacing.xs,
      },
      statCard: {
        backgroundColor: theme.colors.accentMuted ?? 'rgba(21, 128, 61, 0.15)',
        borderRadius: theme.radius.md,
        padding: compact ? theme.spacing.xs : theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.accentDim ?? theme.colors.accent,
        alignItems: 'center',
      },
      statCardHalf: {
        flex: 1,
      },
      statCardLabel: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 10 : 11,
        color: theme.colors.textSecondary,
        marginTop: 4,
        textAlign: 'center',
      },
      statCardValue: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 16 : 20,
        fontWeight: '700',
        color: theme.colors.accent,
      },
      quickLinksRow: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
        marginTop: theme.spacing.sm,
        marginBottom: theme.spacing.lg,
      },
      quickLinkBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        paddingVertical: compact ? theme.spacing.xs : theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      quickLinkBtnText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 11 : 13,
        fontWeight: '600',
        color: theme.colors.accent,
      },
      nextBlock: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
        marginBottom: theme.spacing.md,
        ...webCard,
      },
      nextLabel: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 11,
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.xs,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
      },
      nextTitle: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 15,
        fontWeight: '700',
        color: theme.colors.text,
      },
      nextMeta: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 4,
      },
    });
  }, [theme, isWeb, isNarrowWeb]);

  const isCompletePhase = phase === 'complete';
  const secondStatLabel = isCompletePhase ? 'Final position' : 'Daily points';
  const secondStatValue = isCompletePhase ? '—' : 0;

  const StatBox = ({ label, value }: { label: string; value: ReactNode }) => (
    <View style={[styles.statCard, styles.statCardHalf]}>
      <Text style={styles.statCardValue}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
  );

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerStrip}>
          <View style={styles.headerStripInner}>
            <View>
              <Text style={styles.headerWelcome}>Top Tipster Football</Text>
              <Text style={styles.headerHello}>Hello {username}</Text>
            </View>
            <TouchableOpacity style={styles.accountLink} onPress={openMenu} activeOpacity={0.7}>
              <Ionicons name="person-circle-outline" size={28} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.homePrimaryRow}>
          <TouchableOpacity
            style={styles.homePrimaryBtn}
            onPress={() => router.push(wcHref('/(wc2026)/(tabs)/selections'))}
            activeOpacity={0.85}
          >
            <Ionicons name="list-outline" size={20} color={theme.colors.black} />
            <Text style={styles.homePrimaryBtnText}>My selections</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.homePrimaryBtnSecondary}
            onPress={() => router.push(wcHref('/(wc2026)/(tabs)/competitions'))}
            activeOpacity={0.85}
          >
            <Ionicons name="trophy-outline" size={20} color={theme.colors.accent} />
            <Text style={styles.homePrimaryBtnTextSecondary}>Competitions</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>Your competitions</Text>
        <View style={styles.compTabsRow}>
          {(['upcoming', 'live', 'complete'] as const).map((tab) => {
            const isActive = compTab === tab;
            const label = tab === 'upcoming' ? 'Upcoming' : tab === 'live' ? 'Live' : 'Complete';
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.compTab, isActive && styles.compTabActive]}
                onPress={() => setCompTab(tab)}
                activeOpacity={0.8}
              >
                <Text style={[styles.compTabText, isActive && styles.compTabTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.homeCompHint}>
          Browse by tournament phase. Make picks in My selections when fixtures are published.
        </Text>

        {!showCompetitionInTab ? (
          <Text style={[styles.muted, { marginBottom: theme.spacing.md }]}>No competitions in this category.</Text>
        ) : (
          <>
            <View style={styles.compDropdownTrigger}>
              <View>
                <Text style={styles.compMeetingNameAbove} numberOfLines={2}>
                  FIFA World Cup 2026
                </Text>
                <Text style={styles.compMetaAbove}>Multi-stage event · 11 Jun – 19 Jul 2026</Text>
              </View>
              <View style={styles.modeDivider}>
                <TouchableOpacity
                  style={styles.modeRow}
                  activeOpacity={0.8}
                  onPress={() => router.push(wcHref('/(wc2026)/ante-post-navigation'))}
                >
                  <View style={styles.modeLeft}>
                    <Ionicons name="create-outline" size={18} color={theme.colors.accent} />
                    <View style={styles.modeText}>
                      <Text style={styles.modeTitle} numberOfLines={1}>
                        Ante Post selections
                      </Text>
                      <Text style={styles.modeDesc} numberOfLines={2}>
                        Group stage picks → generates your knockout bracket
                      </Text>
                    </View>
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusText}>{antePostLocked ? 'COMPLETE' : 'UPCOMING'}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modeRow}
                  activeOpacity={0.8}
                  onPress={() => router.push(wcHref('/(wc2026)/(tabs)/fixtures'))}
                >
                  <View style={styles.modeLeft}>
                    <Ionicons name="flash-outline" size={18} color={theme.colors.accent} />
                    <View style={styles.modeText}>
                      <Text style={styles.modeTitle} numberOfLines={1}>
                        Live predictions
                      </Text>
                      <Text style={styles.modeDesc} numberOfLines={2}>
                        Predict matches as the tournament unfolds
                      </Text>
                    </View>
                  </View>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusText}>
                      {phase === 'complete' ? 'COMPLETE' : phase === 'live' ? 'LIVE' : 'UPCOMING'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.competitionsCard}>
              <Text style={styles.statsTitle}>Your stats</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statsRow}>
                  <StatBox label="Points" value={0} />
                  <StatBox label={secondStatLabel} value={secondStatValue} />
                </View>
                <View style={styles.statsRow}>
                  <StatBox label="Top pick" value="—" />
                  <StatBox label="Participants" value={1} />
                </View>
              </View>
            </View>
          </>
        )}

        {(!isWeb || isNarrowWeb) && (
          <View style={styles.quickLinksRow}>
            <TouchableOpacity
              style={styles.quickLinkBtn}
              onPress={() => router.push(wcHref('/(wc2026)/(tabs)/competitions'))}
              activeOpacity={0.8}
            >
              <Ionicons name="podium-outline" size={18} color={theme.colors.accent} />
              <Text style={styles.quickLinkBtnText}>Leaderboard</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickLinkBtn}
              onPress={() => router.push(wcHref('/(wc2026)/(tabs)/results'))}
              activeOpacity={0.8}
            >
              <Ionicons name="trophy-outline" size={18} color={theme.colors.accent} />
              <Text style={styles.quickLinkBtnText}>Results</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.nextBlock}>
          <Text style={styles.nextLabel}>Next match</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : nextFixture ? (
            <>
              <Text style={styles.nextTitle}>
                {nextFixture.home_team?.country_name ?? nextFixture.home_team_id} vs{' '}
                {nextFixture.away_team?.country_name ?? nextFixture.away_team_id}
              </Text>
              <Text style={styles.nextMeta}>
                {new Date(nextFixture.match_date).toLocaleDateString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                ·{' '}
                {new Date(nextFixture.match_date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>No upcoming fixtures loaded yet.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
