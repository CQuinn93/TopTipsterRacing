import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
  useWindowDimensions,
  ImageBackground,
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
import { openAntePostHubFromHome } from '@/features/wc2026/utils/ante-post-nav';
import { getAntePostLockedStatus } from '@/features/wc2026/services/async-predictions';
import { getMatchDayTipsUnlocked } from '@/features/wc2026/services/tournament-gates';
import { getUserPredictions, type Prediction } from '@/features/wc2026/services/predictions';
import { CountryFlag } from '@/features/wc2026/components/CountryFlag';
import {
  summarizeAntePostPredictions,
  formatWcPoints,
} from '@/features/wc2026/utils/prediction-points-summary';

function countryCodeFromTeam(countryCode: string | undefined, countryName: string): string {
  if (countryCode && countryCode.length >= 2) return countryCode;
  return countryName.toUpperCase().slice(0, 2);
}

export function WorldCupHomeScreen() {
  const theme = useTheme();
  const { userId } = useAuth();
  const { openMenu } = useWcShell();
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isNarrowWeb = width < 900;

  const [loading, setLoading] = useState(true);
  const [predsLoading, setPredsLoading] = useState(false);
  const [username, setUsername] = useState('there');
  const [upcomingFixtures, setUpcomingFixtures] = useState<Match[]>([]);
  const [antePostLocked, setAntePostLocked] = useState(false);
  const [matchDayTipsUnlocked, setMatchDayTipsUnlocked] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [selectionKind, setSelectionKind] = useState<'ante_post' | 'match_day'>('ante_post');
  const [pointsKind, setPointsKind] = useState<'ante_post' | 'match_day'>('ante_post');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setPredsLoading(true);
      try {
        if (userId) {
          const profile = await getSharedProfile(userId);
          if (!cancelled && profile?.username) setUsername(profile.username);
        }
        const locked = await getAntePostLockedStatus().catch(() => false);
        if (!cancelled) setAntePostLocked(locked);
        const md = await getMatchDayTipsUnlocked().catch(() => false);
        if (!cancelled) setMatchDayTipsUnlocked(md);
        const fixtures = await getUpcomingFixtures(8);
        if (!cancelled) setUpcomingFixtures(fixtures);

        if (userId) {
          try {
            const preds = await getUserPredictions(userId);
            if (!cancelled) setPredictions(preds);
          } catch {
            if (!cancelled) setPredictions([]);
          }
        } else if (!cancelled) setPredictions([]);
      } catch {
        if (!cancelled) setUpcomingFixtures([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setPredsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const nextFixture = upcomingFixtures[0] ?? null;

  const antePreds = useMemo(() => predictions.filter((p) => p.prediction_type === 'ante_post'), [predictions]);
  const livePreds = useMemo(() => predictions.filter((p) => p.prediction_type === 'live'), [predictions]);

  const anteTotalPoints = useMemo(
    () => antePreds.reduce((s, p) => s + (p.points_awarded ?? 0), 0),
    [antePreds]
  );
  const matchDayTotalPoints = useMemo(
    () => livePreds.reduce((s, p) => s + (p.points_awarded ?? 0), 0),
    [livePreds]
  );

  const anteTierSummary = useMemo(() => summarizeAntePostPredictions(antePreds), [antePreds]);

  const matchDayScoredCount = useMemo(
    () => livePreds.filter((p) => (p.points_awarded ?? 0) > 0).length,
    [livePreds]
  );

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
      nextBlockTouchable: {
        marginBottom: theme.spacing.lg,
        borderRadius: theme.radius.md,
        overflow: 'hidden',
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
        ...webCard,
      },
      nextBlockImageBg: {
        width: '100%',
        minHeight: 156,
        overflow: 'hidden',
      },
      nextBlockImageRadius: {
        borderRadius: theme.radius.md,
      },
      nextBlockTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.52)',
        borderRadius: theme.radius.md,
      },
      nextBlockForeground: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.md,
        width: '100%',
        minHeight: 156,
        zIndex: 1,
      },
      nextBlockMain: {
        width: '100%',
        maxWidth: 520,
        alignItems: 'center',
      },
      nextLabel: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 11,
        color: 'rgba(255,255,255,0.88)',
        marginBottom: theme.spacing.sm,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        textAlign: 'center',
        width: '100%',
      },
      nextMatchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        minHeight: 76,
        marginBottom: theme.spacing.sm,
      },
      nextMatchSide: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
      },
      nextMatchSideHome: {
        justifyContent: 'flex-end',
        paddingRight: 6,
      },
      nextMatchSideAway: {
        justifyContent: 'flex-start',
        paddingLeft: 6,
      },
      nextMatchTeamBlock: {
        width: 148,
        maxWidth: '100%',
        flexShrink: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      },
      nextMatchTeamName: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
        width: '100%',
        lineHeight: 17,
        fontFamily: theme.fontFamily.regular,
        textShadowColor: 'rgba(0,0,0,0.45)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
      },
      nextMatchVs: {
        width: 32,
        flexShrink: 0,
        textAlign: 'center',
        color: theme.colors.accent,
        fontSize: 20,
        fontWeight: '800',
        fontFamily: theme.fontFamily.regular,
        fontStyle: 'italic',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
      },
      nextMeta: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        marginTop: 4,
        textAlign: 'center',
        width: '100%',
      },
      nextPitchMuted: {
        color: 'rgba(255,255,255,0.82)',
        textAlign: 'center',
        width: '100%',
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
        color: theme.colors.white,
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
        marginBottom: theme.spacing.sm,
      },
      sectionTitleFirst: {
        marginTop: 0,
      },
      selTabsRow: {
        flexDirection: 'row',
        width: '100%',
        marginBottom: theme.spacing.sm,
        gap: theme.spacing.xs,
      },
      selTab: {
        flex: 1,
        paddingVertical: compact ? theme.spacing.xs : theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      },
      selTabActive: {
        backgroundColor: theme.colors.accent,
      },
      selTabText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 11 : 13,
        color: theme.colors.textSecondary,
      },
      selTabTextActive: {
        color: theme.colors.white,
        fontWeight: '600',
      },
      muted: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 11 : 13,
        color: theme.colors.textMuted,
        lineHeight: 18,
        marginBottom: theme.spacing.sm,
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
      pointsCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: isWeb ? 14 : theme.radius.lg,
        padding: compact ? theme.spacing.sm : theme.spacing.md,
        marginBottom: theme.spacing.sm,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
        ...webCard,
      },
      tierBoxesRow: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
      },
      tierBox: {
        flex: 1,
        borderRadius: theme.radius.md,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: 4,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surfaceElevated,
      },
      tierBoxResult: {
        borderColor: 'rgba(59, 130, 246, 0.35)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
      },
      tierBoxClose: {
        borderColor: 'rgba(234, 179, 8, 0.4)',
        backgroundColor: 'rgba(234, 179, 8, 0.12)',
      },
      tierBoxExact: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentMuted,
      },
      tierBoxTotal: {
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
      },
      tierCount: {
        fontFamily: theme.fontFamily.regular,
        fontSize: compact ? 20 : 22,
        fontWeight: '800',
        textAlign: 'center',
      },
      tierCountResult: { color: '#3b82f6' },
      tierCountClose: { color: theme.colors.statusAccent },
      tierCountExact: { color: theme.colors.accent },
      tierCountTotal: { color: theme.colors.text },
      tierLabel: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 10,
        fontWeight: '700',
        color: theme.colors.textMuted,
        marginTop: 4,
        textAlign: 'center',
      },
      tierSub: {
        fontFamily: theme.fontFamily.light,
        fontSize: 9,
        color: theme.colors.textMuted,
        marginTop: 2,
        textAlign: 'center',
      },
      pointsFootnote: {
        fontFamily: theme.fontFamily.light,
        fontSize: 11,
        color: theme.colors.textMuted,
        marginTop: theme.spacing.sm,
        textAlign: 'center',
        lineHeight: 16,
      },
      pointsLoading: {
        paddingVertical: theme.spacing.lg,
        alignItems: 'center',
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
    });
  }, [theme, isWeb, isNarrowWeb]);

  const goFixturesAndResults = () => router.push(wcHref('/(wc2026)/(tabs)/results'));

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

        <TouchableOpacity style={styles.nextBlockTouchable} onPress={goFixturesAndResults} activeOpacity={0.85}>
          <ImageBackground
            source={require('../../../assets/Pitch.jpg')}
            style={styles.nextBlockImageBg}
            imageStyle={styles.nextBlockImageRadius}
            resizeMode="cover"
          >
            <View style={styles.nextBlockTint} pointerEvents="none" />
            <View style={styles.nextBlockForeground}>
              <View style={styles.nextBlockMain}>
                <Text style={styles.nextLabel}>Next match</Text>
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : nextFixture ? (
                  <>
                    <View style={styles.nextMatchRow}>
                      <View style={[styles.nextMatchSide, styles.nextMatchSideHome]}>
                        <View style={styles.nextMatchTeamBlock}>
                          {nextFixture.home_team ? (
                            <>
                              <CountryFlag
                                countryCode={countryCodeFromTeam(
                                  nextFixture.home_team.country_code,
                                  nextFixture.home_team.country_name
                                )}
                                countryName={nextFixture.home_team.country_name}
                                flagSize={40}
                                showName={false}
                                align="center"
                              />
                              <Text style={styles.nextMatchTeamName} numberOfLines={2} ellipsizeMode="tail">
                                {nextFixture.home_team.country_name}
                              </Text>
                            </>
                          ) : (
                            <Text style={styles.nextMatchTeamName} numberOfLines={2}>
                              {nextFixture.home_team_id}
                            </Text>
                          )}
                        </View>
                      </View>
                      <Text style={styles.nextMatchVs}>v</Text>
                      <View style={[styles.nextMatchSide, styles.nextMatchSideAway]}>
                        <View style={styles.nextMatchTeamBlock}>
                          {nextFixture.away_team ? (
                            <>
                              <CountryFlag
                                countryCode={countryCodeFromTeam(
                                  nextFixture.away_team.country_code,
                                  nextFixture.away_team.country_name
                                )}
                                countryName={nextFixture.away_team.country_name}
                                flagSize={40}
                                showName={false}
                                align="center"
                              />
                              <Text style={styles.nextMatchTeamName} numberOfLines={2} ellipsizeMode="tail">
                                {nextFixture.away_team.country_name}
                              </Text>
                            </>
                          ) : (
                            <Text style={styles.nextMatchTeamName} numberOfLines={2}>
                              {nextFixture.away_team_id}
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                    <Text style={styles.nextMeta}>
                      {new Date(nextFixture.match_date).toLocaleDateString(undefined, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      ·{' '}
                      {new Date(nextFixture.match_date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={[styles.muted, styles.nextPitchMuted, { marginBottom: 0, marginTop: 8 }]}>
                      Tap for fixtures & results
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.muted, styles.nextPitchMuted]}>
                    No upcoming fixtures loaded yet. Tap to open fixtures & results.
                  </Text>
                )}
              </View>
            </View>
          </ImageBackground>
        </TouchableOpacity>

        <View style={styles.homePrimaryRow}>
          <TouchableOpacity
            style={styles.homePrimaryBtn}
            onPress={() => router.push(wcHref('/(wc2026)/(tabs)/selections'))}
            activeOpacity={0.85}
          >
            <Ionicons name="list-outline" size={20} color={theme.colors.white} />
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

        <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>Your selections</Text>
        <View style={styles.selTabsRow}>
          <TouchableOpacity
            style={[styles.selTab, selectionKind === 'ante_post' && styles.selTabActive]}
            onPress={() => setSelectionKind('ante_post')}
            activeOpacity={0.8}
          >
            <Text style={[styles.selTabText, selectionKind === 'ante_post' && styles.selTabTextActive]}>Ante post</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selTab, selectionKind === 'match_day' && styles.selTabActive]}
            onPress={() => setSelectionKind('match_day')}
            activeOpacity={0.8}
          >
            <Text style={[styles.selTabText, selectionKind === 'match_day' && styles.selTabTextActive]}>
              Match Day picks
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.compDropdownTrigger}>
          <View>
            <Text style={styles.compMeetingNameAbove} numberOfLines={2}>
              World Cup 2026
            </Text>
            <Text style={styles.compMetaAbove}>11 Jun – 19 Jul 2026</Text>
          </View>
          <View style={styles.modeDivider}>
            {selectionKind === 'ante_post' ? (
              <TouchableOpacity
                style={styles.modeRow}
                activeOpacity={0.8}
                onPress={openAntePostHubFromHome}
              >
                <View style={styles.modeLeft}>
                  <Ionicons name="create-outline" size={18} color={theme.colors.accent} />
                  <View style={styles.modeText}>
                    <Text style={styles.modeTitle} numberOfLines={1}>
                      Ante post selections
                    </Text>
                  </View>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{antePostLocked ? 'LOCKED' : 'OPEN'}</Text>
                </View>
              </TouchableOpacity>
            ) : matchDayTipsUnlocked ? (
              <TouchableOpacity
                style={styles.modeRow}
                activeOpacity={0.8}
                onPress={() => router.push(wcHref('/(wc2026)/match-day-tips'))}
              >
                <View style={styles.modeLeft}>
                  <Ionicons name="football-outline" size={18} color={theme.colors.accent} />
                  <View style={styles.modeText}>
                    <Text style={styles.modeTitle} numberOfLines={1}>
                      Match Day picks
                    </Text>
                  </View>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>OPEN</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={[styles.modeRow, { opacity: 0.85 }]}>
                <View style={styles.modeLeft}>
                  <Ionicons name="lock-closed-outline" size={18} color={theme.colors.textMuted} />
                  <View style={styles.modeText}>
                    <Text style={styles.modeTitle} numberOfLines={1}>
                      Match Day picks
                    </Text>
                  </View>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>LOCKED</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Points</Text>
        <View style={styles.selTabsRow}>
          <TouchableOpacity
            style={[styles.selTab, pointsKind === 'ante_post' && styles.selTabActive]}
            onPress={() => setPointsKind('ante_post')}
            activeOpacity={0.8}
          >
            <Text style={[styles.selTabText, pointsKind === 'ante_post' && styles.selTabTextActive]}>Ante post</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.selTab, pointsKind === 'match_day' && styles.selTabActive]}
            onPress={() => setPointsKind('match_day')}
            activeOpacity={0.8}
          >
            <Text style={[styles.selTabText, pointsKind === 'match_day' && styles.selTabTextActive]}>
              Match Day picks
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.pointsCard}>
          {predsLoading ? (
            <View style={styles.pointsLoading}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : pointsKind === 'ante_post' ? (
            <>
              <View style={styles.tierBoxesRow}>
                <View style={[styles.tierBox, styles.tierBoxResult]}>
                  <Text style={[styles.tierCount, styles.tierCountResult]}>{anteTierSummary.result}</Text>
                  <Text style={styles.tierLabel}>Result</Text>
                  <Text style={styles.tierSub}>matches</Text>
                </View>
                <View style={[styles.tierBox, styles.tierBoxClose]}>
                  <Text style={[styles.tierCount, styles.tierCountClose]}>{anteTierSummary.close}</Text>
                  <Text style={styles.tierLabel}>Close</Text>
                  <Text style={styles.tierSub}>matches</Text>
                </View>
                <View style={[styles.tierBox, styles.tierBoxExact]}>
                  <Text style={[styles.tierCount, styles.tierCountExact]}>{anteTierSummary.exact}</Text>
                  <Text style={styles.tierLabel}>Exact</Text>
                  <Text style={styles.tierSub}>matches</Text>
                </View>
                <View style={[styles.tierBox, styles.tierBoxTotal]}>
                  <Text style={[styles.tierCount, styles.tierCountTotal]}>
                    {formatWcPoints(anteTierSummary.totalPoints)}
                  </Text>
                  <Text style={styles.tierLabel}>Total</Text>
                  <Text style={styles.tierSub}>pts</Text>
                </View>
              </View>
              <Text style={styles.pointsFootnote}>Full breakdown on the leaderboard.</Text>
            </>
          ) : (
            <>
              <View style={styles.tierBoxesRow}>
                <View style={[styles.tierBox, styles.tierBoxResult, { flex: 1 }]}>
                  <Text style={[styles.tierCount, styles.tierCountResult]}>{matchDayScoredCount}</Text>
                  <Text style={styles.tierLabel}>Scored</Text>
                  <Text style={styles.tierSub}>matches</Text>
                </View>
                <View style={[styles.tierBox, styles.tierBoxTotal, { flex: 1 }]}>
                  <Text style={[styles.tierCount, styles.tierCountTotal]}>{formatWcPoints(matchDayTotalPoints)}</Text>
                  <Text style={styles.tierLabel}>Total</Text>
                  <Text style={styles.tierSub}>pts</Text>
                </View>
              </View>
              <Text style={styles.pointsFootnote}>Full breakdown on the leaderboard.</Text>
            </>
          )}
        </View>

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
            <TouchableOpacity style={styles.quickLinkBtn} onPress={goFixturesAndResults} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={18} color={theme.colors.accent} />
              <Text style={styles.quickLinkBtnText}>Fixtures & results</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
