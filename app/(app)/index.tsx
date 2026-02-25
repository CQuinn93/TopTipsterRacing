import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { getAvailableRacesForUser } from '@/lib/availableRacesCache';
import { fetchHomeSummaryByComp, type HomeSummaryByComp } from '@/lib/homeSummary';
import { useForceRefresh } from '@/contexts/ForceRefreshContext';
import { getOrCreateTabletCode } from '@/lib/tabletCode';
import type { AvailableRaceDay } from '@/lib/availableRacesForUser';
import type { ParticipationRow } from '@/lib/availableRacesCache';
import { isSelectionClosed, formatTimeUntilDeadline, getCompetitionDisplayStatus } from '@/lib/appUtils';

const TABLET_MODE_INFO =
  'Use this code on a shared device to make selections without logging in. Hold Sign in for 7s on the login screen to open tablet mode.';

export default function HomeScreen() {
  const { userId, session } = useAuth();
  const { width } = useWindowDimensions();
  const [displayName, setDisplayName] = useState<string>('');
  const [participations, setParticipations] = useState<ParticipationRow[]>([]);
  const [availableRaces, setAvailableRaces] = useState<AvailableRaceDay[]>([]);
  const [summaryByComp, setSummaryByComp] = useState<HomeSummaryByComp | null>(null);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null); // null = Overall
  const [refreshing, setRefreshing] = useState(false);
  const [lockingId, setLockingId] = useState<string | null>(null);
  const [tabletCode, setTabletCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(true);
  const [compStatusByCompId, setCompStatusByCompId] = useState<Record<string, 'upcoming' | 'live' | 'complete'>>({});
  const [compPositionByCompId, setCompPositionByCompId] = useState<Record<string, number | null>>({});
  const scrollRef = useRef<ScrollView>(null);
  const racesSectionY = useRef(0);
  const livePulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', userId)
          .maybeSingle();
        if (cancelled) return;
        const name = (data as { username?: string } | null)?.username ?? null;
        if (name) setDisplayName(name);
        else setDisplayName(session?.user?.email?.split('@')[0] ?? 'there');
      } catch {
        if (!cancelled) setDisplayName(session?.user?.email?.split('@')[0] ?? 'there');
      }
    })();
    return () => { cancelled = true; };
  }, [userId, session?.user?.email]);

  useEffect(() => {
    if (!userId) return;
    getOrCreateTabletCode(userId)
      .then(setTabletCode)
      .catch(() => setTabletCode(null))
      .finally(() => setCodeLoading(false));
  }, [userId]);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!userId) return;
      setRefreshing(true);
      try {
        const { participations: p, availableRaces: r } = await getAvailableRacesForUser(supabase, userId, forceRefresh);
        setParticipations(p);
        setAvailableRaces(r);
        if (p.length > 0) {
          const compIds = p.map((x) => x.competition_id);
          const [summary, compsRes] = await Promise.all([
            fetchHomeSummaryByComp(supabase, userId, compIds),
            supabase.from('competitions').select('id, festival_start_date, festival_end_date').in('id', compIds),
          ]);
          setSummaryByComp(summary);
          const statusByComp: Record<string, 'upcoming' | 'live' | 'complete'> = {};
          const positionByComp: Record<string, number | null> = {};
          for (const c of compsRes.data ?? []) {
            const row = c as { id: string; festival_start_date: string; festival_end_date: string };
            const status = getCompetitionDisplayStatus(row.festival_start_date, row.festival_end_date);
            statusByComp[row.id] = status ?? 'live';
          }
          setCompStatusByCompId(statusByComp);

          if (compIds.length > 0) {
            const { data: allSelections } = await supabase
              .from('daily_selections')
              .select('competition_id, user_id, selections')
              .in('competition_id', compIds);
            type SelRow = { competition_id: string; user_id: string; selections: Record<string, { oddsDecimal?: number }> | null };
            const rows = (allSelections ?? []) as SelRow[];
            const totalByCompUser: Record<string, Record<string, number>> = {};
            for (const compId of compIds) totalByCompUser[compId] = {};
            for (const row of rows) {
              const sel = row.selections;
              if (!sel) continue;
              const compId = row.competition_id;
              const uid = row.user_id;
              let sum = 0;
              for (const v of Object.values(sel)) {
                if (v?.oddsDecimal != null) sum += Math.round(v.oddsDecimal * 10);
              }
              totalByCompUser[compId][uid] = (totalByCompUser[compId][uid] ?? 0) + sum;
            }
            for (const compId of compIds) {
              const byUser = totalByCompUser[compId] ?? {};
              const sorted = Object.entries(byUser).sort((a, b) => b[1] - a[1]);
              const idx = sorted.findIndex(([uid]) => uid === userId);
              positionByComp[compId] = idx >= 0 ? idx + 1 : null;
            }
            setCompPositionByCompId(positionByComp);
          }

          if (selectedCompId !== null && !p.some((x) => x.competition_id === selectedCompId)) {
            setSelectedCompId(null);
          }
        } else {
          setSummaryByComp(null);
          setSelectedCompId(null);
          setCompStatusByCompId({});
          setCompPositionByCompId({});
        }
      } finally {
        setRefreshing(false);
      }
    },
    [userId, selectedCompId]
  );

  useFocusEffect(
    useCallback(() => {
      if (userId) load(false);
    }, [userId, load])
  );

  const { homeTrigger } = useForceRefresh();
  useEffect(() => {
    if (userId && homeTrigger > 0) load(true);
  }, [userId, homeTrigger, load]);

  const hasJoinedAny = participations.length > 0;
  const isLive =
    hasJoinedAny &&
    selectedCompId != null &&
    compStatusByCompId[selectedCompId] === 'live';
  useEffect(() => {
    if (!isLive) {
      livePulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulseAnim, {
          toValue: 0.5,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(livePulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isLive, livePulseAnim]);
  const compList = summaryByComp
    ? [{ id: null, name: 'Overall' } as const, ...participations.map((p) => ({ id: p.competition_id, name: summaryByComp.byComp[p.competition_id]?.name ?? p.competition_id }))]
    : [];

  const currentSummary =
    summaryByComp && selectedCompId === null
      ? summaryByComp.overall
      : summaryByComp && selectedCompId
        ? summaryByComp.byComp[selectedCompId]
        : null;

  const racesAvailable = availableRaces.filter((item) => !isSelectionClosed(item.firstRaceUtc));
  const nextRaceOff = (() => {
    const open = [...racesAvailable].sort((a, b) => new Date(a.firstRaceUtc).getTime() - new Date(b.firstRaceUtc).getTime());
    if (open.length === 0) return null;
    const first = open[0];
    const dateStr = new Date(first.raceDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = new Date(first.firstRaceUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return { label: 'Next race off', value: `${first.course}, ${dateStr} · ${timeStr}` };
  })();
  const scrollToRacesSection = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, racesSectionY.current - 8), animated: true });
  }, []);

  const handleLockIn = async (item: AvailableRaceDay) => {
    if (!userId || item.isLocked || !item.hasAllPicks) return;
    setLockingId(`${item.competitionId}-${item.raceDate}`);
    try {
      // Generated Supabase types omit lock_selections args; RPC requires p_competition_id, p_race_date
      // @ts-expect-error - lock_selections RPC args not in generated types
      const { data, error } = await supabase.rpc('lock_selections', {
        p_competition_id: item.competitionId,
        p_race_date: item.raceDate,
      });
      const result = data as { success?: boolean; error?: string } | null;
      if (error || !result?.success) {
        Alert.alert('Error', result?.error ?? error?.message ?? 'Failed to lock');
        return;
      }
      await load(true);
    } finally {
      setLockingId(null);
    }
  };

  const threeCardWidth = (width - theme.spacing.md * 2 - theme.spacing.sm * 2) / 3;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome + tagline */}
        <Text style={styles.welcomeTitle}>Welcome to Top Tipster Racing</Text>
        <Text style={styles.welcomeTagline}>A Fantasy sports racing app</Text>

        {/* Top bar: Hello + Account */}
        <View style={styles.topBar}>
          <Text style={styles.hello}>Hello {displayName || '…'}</Text>
          <TouchableOpacity style={styles.accountLink} onPress={() => router.push('/(app)/account')} activeOpacity={0.7}>
            <Ionicons name="person-circle-outline" size={24} color={theme.colors.text} />
            <Text style={styles.accountLinkText}>Account</Text>
          </TouchableOpacity>
        </View>

        {/* Races available: tap to scroll down to selections section */}
        {hasJoinedAny && racesAvailable.length > 0 && (
          <TouchableOpacity style={styles.racesAvailableCta} onPress={scrollToRacesSection} activeOpacity={0.8}>
            <Ionicons name="flag" size={24} color={theme.colors.statusAccent} />
            <Text style={styles.racesAvailableCtaText}>Races available – tap to view</Text>
          </TouchableOpacity>
        )}

        {!hasJoinedAny && (
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(auth)/access-code')}>
            <Text style={styles.primaryButtonText}>Enter competition (access code)</Text>
          </TouchableOpacity>
        )}

        {hasJoinedAny && (
          <>
            {/* Full-width next race off card */}
            <View style={styles.nextRaceCard}>
              {nextRaceOff ? (
                <>
                  <Ionicons name="flag-outline" size={20} color={theme.colors.accent} style={styles.nextRaceIcon} />
                  <Text style={styles.nextRaceLabel}>{nextRaceOff.label}</Text>
                  <Text style={styles.nextRaceValue} numberOfLines={2}>{nextRaceOff.value}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="flag-outline" size={20} color={theme.colors.textMuted} style={styles.nextRaceIcon} />
                  <Text style={styles.nextRaceLabel}>Next race off</Text>
                  <Text style={styles.nextRaceValueMuted}>—</Text>
                </>
              )}
            </View>

            {/* Competition horizontal scroll */}
            <View style={styles.compSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.compScrollContent}
                style={styles.compScroll}
              >
                {compList.map((c) => (
                  <TouchableOpacity
                    key={c.id ?? 'overall'}
                    style={[styles.compPill, (selectedCompId === c.id) && styles.compPillSelected]}
                    onPress={() => setSelectedCompId(c.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.compPillText, (selectedCompId === c.id) && styles.compPillTextSelected]} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Current status card (centred): Upcoming=orange, Live=green pulse, Complete=red */}
              {(() => {
                const status =
                  selectedCompId === null
                    ? 'Your competitions'
                    : compStatusByCompId[selectedCompId] === 'complete'
                      ? 'Complete'
                      : compStatusByCompId[selectedCompId] === 'upcoming'
                        ? 'Upcoming'
                        : 'Live';
                const statusStyle =
                  selectedCompId !== null && compStatusByCompId[selectedCompId] === 'upcoming'
                    ? styles.statusCardTextUpcoming
                    : selectedCompId !== null && compStatusByCompId[selectedCompId] === 'live'
                      ? styles.statusCardTextLive
                      : selectedCompId !== null && compStatusByCompId[selectedCompId] === 'complete'
                        ? styles.statusCardTextComplete
                        : styles.statusCardText;
                if (selectedCompId !== null && compStatusByCompId[selectedCompId] === 'live') {
                  return (
                    <View style={styles.statusCard}>
                      <Animated.Text style={[styles.statusCardTextLive, { opacity: livePulseAnim }]}>
                        {status}
                      </Animated.Text>
                    </View>
                  );
                }
                return (
                  <View style={styles.statusCard}>
                    <Text style={statusStyle}>{status}</Text>
                  </View>
                );
              })()}

              {/* 3 boxes: Overall = Points | Highest daily points | Highest SP. Comp = Points | Daily/Final position | Highest SP */}
              {(() => {
                const isOverall = selectedCompId === null;
                const isComplete = selectedCompId != null && compStatusByCompId[selectedCompId] === 'complete';
                const position = selectedCompId != null ? compPositionByCompId[selectedCompId] : null;
                const secondLabel = isOverall
                  ? 'Highest daily points'
                  : isComplete
                    ? 'Final position'
                    : 'Daily points';
                const secondValue = isOverall
                  ? (summaryByComp?.overall?.highestDailyPoints ?? 0)
                  : isComplete
                    ? (position != null ? `${position}${position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}` : '—')
                    : (currentSummary?.dailyPoints ?? 0);
                return (
                  <View style={styles.threeBoxRow}>
                    <View style={[styles.statCard, { width: threeCardWidth }]}>
                      <Ionicons name="trophy-outline" size={18} color={theme.colors.accent} />
                      <Text style={styles.statCardLabel}>Points</Text>
                      <Text style={styles.statCardValue}>{currentSummary?.totalPoints ?? 0}</Text>
                    </View>
                    <View style={[styles.statCard, { width: threeCardWidth }]}>
                      {isOverall ? (
                        <Ionicons name="trending-up-outline" size={18} color={theme.colors.accent} />
                      ) : isComplete ? (
                        <Ionicons name="podium-outline" size={18} color={theme.colors.accent} />
                      ) : (
                        <Ionicons name="calendar-outline" size={18} color={theme.colors.accent} />
                      )}
                      <Text style={styles.statCardLabel}>{secondLabel}</Text>
                      <Text style={styles.statCardValue}>{typeof secondValue === 'number' ? secondValue : secondValue}</Text>
                    </View>
                    <View style={[styles.statCard, { width: threeCardWidth }]}>
                      <Ionicons name="flash-outline" size={18} color={theme.colors.accent} />
                      <Text style={styles.statCardLabel}>Highest odds winner</Text>
                      <Text style={styles.statCardValue}>
                        {currentSummary?.highestSpWin != null ? currentSummary.highestSpWin.toFixed(2) : '—'}
                      </Text>
                    </View>
                  </View>
                );
              })()}
            </View>

            {racesAvailable.length > 0 && (
              <View
                style={styles.cardsSection}
                onLayout={(e) => {
                  const layout = e.nativeEvent?.layout ?? (e as { layout?: { y?: number } }).layout;
                  racesSectionY.current = layout?.y ?? 0;
                }}
              >
                <View style={styles.cards}>
                  {racesAvailable.map((item) => {
                  const closed = isSelectionClosed(item.firstRaceUtc);
                  const cardKey = `${item.competitionId}-${item.raceDate}`;
                  const isLocking = lockingId === cardKey;
                  return (
                    <TouchableOpacity
                      key={cardKey}
                      style={[styles.card, closed && styles.cardClosed]}
                      onPress={() =>
                        closed || item.isLocked
                          ? router.push('/(app)/selections')
                          : router.push({
                              pathname: '/(app)/selections',
                              params: { competitionId: item.competitionId, raceDate: item.raceDate },
                            })
                      }
                      activeOpacity={0.8}
                      disabled={isLocking}
                    >
                      <View style={styles.cardRow}>
                        <View style={styles.cardLeft}>
                          <Text style={styles.cardTitle} numberOfLines={1}>
                            {item.competitionName}
                          </Text>
                          <Text style={styles.cardMeta}>
                            {item.course} · {new Date(item.raceDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                          </Text>
                          {closed ? (
                            <Text style={styles.cardStatusClosed}>Closed – view in My selections</Text>
                          ) : item.isLocked ? (
                            <Text style={styles.cardStatus}>Locked – tap to view</Text>
                          ) : item.hasAllPicks ? (
                            <Text style={styles.cardStatus}>Lock in to view others</Text>
                          ) : (
                            <Text style={styles.cardStatus}>
                              {item.pendingCount} pick{item.pendingCount !== 1 ? 's' : ''} left
                            </Text>
                          )}
                        </View>
                        {!closed && !item.isLocked && (
                          <View style={styles.cardRight}>
                            {item.hasAllPicks ? (
                              <TouchableOpacity
                                style={[styles.lockInBtn, isLocking && styles.lockInBtnDisabled]}
                                onPress={(e) => {
                                  e?.stopPropagation?.();
                                  handleLockIn(item);
                                }}
                                disabled={isLocking}
                              >
                                {isLocking ? (
                                  <ActivityIndicator size="small" color={theme.colors.black} />
                                ) : (
                                  <Text style={styles.lockInBtnText}>Lock in</Text>
                                )}
                              </TouchableOpacity>
                            ) : (
                              <View style={styles.timeBlock}>
                                <Text style={styles.timeLabel}>Closes</Text>
                                <Text style={styles.timeValue}>{formatTimeUntilDeadline(item.firstRaceUtc)}</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Fixed tablet code strip directly above nav bar */}
      <View style={styles.tabletStrip}>
        <View style={styles.tabletStripInner}>
          <View style={styles.tabletCodeRow}>
            <Text style={styles.tabletCodeLabel}>Tablet mode code</Text>
            {codeLoading ? (
              <ActivityIndicator size="small" color={theme.colors.textMuted} />
            ) : tabletCode ? (
              <Text style={styles.tabletCodeValue} selectable>{tabletCode}</Text>
            ) : (
              <Text style={styles.tabletCodeMuted}>—</Text>
            )}
            <TouchableOpacity
              hitSlop={12}
              onPress={() => Alert.alert('Tablet mode', TABLET_MODE_INFO)}
              style={styles.infoBtn}
            >
              <Ionicons name="information-circle-outline" size={22} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1 },
  content: { padding: theme.spacing.md },
  welcomeTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  welcomeTagline: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  hello: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  accountLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  accountLinkText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.text,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  primaryButtonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.black,
    fontWeight: '600',
  },
  nextRaceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    marginHorizontal: -theme.spacing.md,
    paddingHorizontal: theme.spacing.md + theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  nextRaceIcon: { marginBottom: theme.spacing.xs },
  nextRaceLabel: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 11,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  nextRaceValue: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  nextRaceValueMuted: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 15,
    color: theme.colors.textMuted,
  },
  compSection: { marginBottom: theme.spacing.md },
  compScroll: { marginHorizontal: -theme.spacing.md },
  compScrollContent: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    flexDirection: 'row',
  },
  compPill: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  compPillSelected: {
    borderColor: theme.colors.barAccent,
    backgroundColor: theme.colors.surfaceElevated,
  },
  compPillText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  compPillTextSelected: {
    color: theme.colors.text,
    fontWeight: '600',
  },
  statusCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  statusCardText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  statusCardTextUpcoming: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    fontWeight: '600',
    color: '#f97316',
  },
  statusCardTextLive: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.accent,
  },
  statusCardTextComplete: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.error,
  },
  racesAvailableCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  racesAvailableCtaText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.text,
  },
  cardsSection: {
    marginTop: theme.spacing.sm,
  },
  threeBoxRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  statCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statCardLabel: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  statCardValue: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  statCardFull: {
    width: '100%',
  },
  muted: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  cards: { gap: theme.spacing.sm },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardClosed: {
    borderColor: '#b91c1c',
    borderWidth: 1,
    opacity: 0.9,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLeft: { flex: 1, minWidth: 0 },
  cardRight: { alignItems: 'flex-end', marginLeft: theme.spacing.sm },
  cardTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  cardMeta: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  cardStatus: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 11,
    color: theme.colors.accent,
    marginTop: 2,
  },
  cardStatusClosed: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 11,
    color: '#b91c1c',
    marginTop: 2,
    fontStyle: 'italic',
  },
  timeBlock: { alignItems: 'flex-end' },
  timeLabel: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  timeValue: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.accent,
    marginTop: 2,
  },
  lockInBtn: {
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
  },
  lockInBtnDisabled: { opacity: 0.7 },
  lockInBtnText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.black,
    fontWeight: '600',
  },
  tabletStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 2,
    borderTopColor: theme.colors.barAccent,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  tabletStripInner: {},
  tabletCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  tabletCodeLabel: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  tabletCodeValue: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    letterSpacing: 2,
  },
  tabletCodeMuted: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  infoBtn: {
    marginLeft: 'auto',
  },
});
