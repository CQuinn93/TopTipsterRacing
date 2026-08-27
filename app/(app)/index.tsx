import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Pressable,
  TextInput,
  Alert,
  Animated,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { getAvailableRacesForUser } from '@/lib/availableRacesCache';
import { fetchHomeSummaryByComp, type HomeSummaryByComp } from '@/lib/homeSummary';
import { useForceRefresh } from '@/contexts/ForceRefreshContext';
import type { ParticipationRow } from '@/lib/availableRacesCache';
import type { AvailableRaceDay } from '@/lib/availableRacesForUser';
import { getCompetitionDisplayStatus } from '@/lib/appUtils';
import { joinCompetitionWithAccessCode } from '@/lib/joinCompetitionWithAccessCode';
import { HomeLeaderboardPanel } from '@/components/HomeLeaderboardPanel';

const RACE_CYCLE_MS = 6500;
const RACE_SLIDE_MS = 380;

type HomeTab = 'competitions' | 'join' | 'table';

type PendingJoin = {
  competition_id: string;
  name: string;
};

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { openSidebar } = useSidebar();
  const { userId, session } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [displayName, setDisplayName] = useState('');
  const [participations, setParticipations] = useState<ParticipationRow[]>([]);
  const [availableRaces, setAvailableRaces] = useState<AvailableRaceDay[]>([]);
  const [summaryByComp, setSummaryByComp] = useState<HomeSummaryByComp | null>(null);
  const [pending, setPending] = useState<PendingJoin[]>([]);
  const [compStatusByCompId, setCompStatusByCompId] = useState<
    Record<string, 'upcoming' | 'live' | 'complete'>
  >({});
  const [compDateRangeByCompId, setCompDateRangeByCompId] = useState<
    Record<string, { start: string; end: string }>
  >({});
  const [creatorByCompId, setCreatorByCompId] = useState<Record<string, string | null>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<HomeTab>('competitions');
  const [homePanelExpanded, setHomePanelExpanded] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [raceIndex, setRaceIndex] = useState(0);
  const [raceCardWidth, setRaceCardWidth] = useState(0);
  const raceSlideX = useRef(new Animated.Value(0)).current;
  const raceCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const isNarrowWeb = Platform.OS === 'web' && windowWidth < 768;
  const isWideWeb = Platform.OS === 'web' && windowWidth >= 768;
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    const next = String(params.tab ?? '').trim();
    if (next === 'join' || next === 'table' || next === 'competitions') {
      setTab(next);
      setHomePanelExpanded(true);
    }
  }, [params.tab]);

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
    return () => {
      cancelled = true;
    };
  }, [userId, session?.user?.email]);

  const load = useCallback(
    async (forceRefresh = false, isPullRefresh = false) => {
      if (!userId) return;
      if (isPullRefresh) setRefreshing(true);
      try {
        const [{ participations: p, availableRaces: r }, pendingRes] = await Promise.all([
          getAvailableRacesForUser(supabase, userId, forceRefresh),
          supabase
            .from('competition_join_requests')
            .select('competition_id')
            .eq('user_id', userId)
            .eq('status', 'pending'),
        ]);
        setParticipations(p);
        setAvailableRaces(r);

        const pendingIds = (pendingRes.data ?? []).map(
          (row) => (row as { competition_id: string }).competition_id
        );
        if (pendingIds.length > 0) {
          const { data: pendingComps } = await supabase
            .from('competitions')
            .select('id, name')
            .in('id', pendingIds);
          const nameById = new Map(
            (pendingComps ?? []).map((c) => {
              const row = c as { id: string; name: string };
              return [row.id, row.name] as const;
            })
          );
          setPending(
            pendingIds.map((id) => ({
              competition_id: id,
              name: nameById.get(id) ?? 'Competition',
            }))
          );
        } else {
          setPending([]);
        }

        if (p.length === 0) {
          setSummaryByComp(null);
          setCompStatusByCompId({});
          setCompDateRangeByCompId({});
          setCreatorByCompId({});
          setTab((prev) => (prev === 'competitions' ? 'join' : prev));
          return;
        }

        const compIds = p.map((x) => x.competition_id);
        const [summary, compsRes] = await Promise.all([
          fetchHomeSummaryByComp(supabase, userId, compIds),
          supabase
            .from('competitions')
            .select('id, festival_start_date, festival_end_date, created_by_user_id')
            .in('id', compIds),
        ]);
        setSummaryByComp(summary);

        const statusByComp: Record<string, 'upcoming' | 'live' | 'complete'> = {};
        const dateRangeByComp: Record<string, { start: string; end: string }> = {};
        const creatorByComp: Record<string, string | null> = {};
        for (const c of compsRes.data ?? []) {
          const row = c as {
            id: string;
            festival_start_date: string;
            festival_end_date: string;
            created_by_user_id: string | null;
          };
          statusByComp[row.id] =
            getCompetitionDisplayStatus(row.festival_start_date, row.festival_end_date) ?? 'live';
          dateRangeByComp[row.id] = {
            start: new Date(row.festival_start_date).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
            }),
            end: new Date(row.festival_end_date).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
            }),
          };
          creatorByComp[row.id] = row.created_by_user_id;
        }
        setCompStatusByCompId(statusByComp);
        setCompDateRangeByCompId(dateRangeByComp);
        setCreatorByCompId(creatorByComp);
      } finally {
        if (isPullRefresh) setRefreshing(false);
      }
    },
    [userId]
  );

  const onRefresh = useCallback(() => {
    if (refreshing) return;
    void load(true, true);
  }, [load, refreshing]);

  useFocusEffect(
    useCallback(() => {
      if (userId) void load(false);
    }, [userId, load])
  );

  const { homeTrigger } = useForceRefresh();
  useEffect(() => {
    if (userId && homeTrigger > 0) void load(true);
  }, [userId, homeTrigger, load]);

  const nowMs = Date.now();
  const upcomingRaces = useMemo(
    () =>
      availableRaces
        .filter((d) => new Date(d.lastRaceUtc).getTime() > nowMs)
        .sort((a, b) => a.firstRaceUtc.localeCompare(b.firstRaceUtc)),
    [availableRaces, nowMs]
  );

  const dayNumberByKey = useMemo(() => {
    const map = new Map<string, number>();
    const byComp = new Map<string, string[]>();
    for (const d of availableRaces) {
      const list = byComp.get(d.competitionId) ?? [];
      if (!list.includes(d.raceDate)) list.push(d.raceDate);
      byComp.set(d.competitionId, list);
    }
    for (const [compId, dates] of byComp) {
      const sorted = [...dates].sort();
      sorted.forEach((date, i) => map.set(`${compId}:${date}`, i + 1));
    }
    return map;
  }, [availableRaces]);

  useEffect(() => {
    if (raceIndex >= upcomingRaces.length) setRaceIndex(0);
  }, [upcomingRaces.length, raceIndex]);

  const goToRace = useCallback(
    (next: number, opts?: { direction?: 'left' | 'right' }) => {
      if (upcomingRaces.length === 0) return;
      const target = ((next % upcomingRaces.length) + upcomingRaces.length) % upcomingRaces.length;
      if (target === raceIndex) return;
      const width = raceCardWidth > 0 ? raceCardWidth : 280;
      const dir = opts?.direction === 'right' ? 1 : -1;
      raceSlideX.setValue(-dir * width);
      setRaceIndex(target);
      Animated.timing(raceSlideX, {
        toValue: 0,
        duration: RACE_SLIDE_MS,
        useNativeDriver: true,
      }).start();
    },
    [upcomingRaces.length, raceIndex, raceCardWidth, raceSlideX]
  );

  useEffect(() => {
    if (raceCycleRef.current) clearInterval(raceCycleRef.current);
    if (upcomingRaces.length <= 1) return;
    raceCycleRef.current = setInterval(() => {
      goToRace(raceIndex + 1, { direction: 'left' });
    }, RACE_CYCLE_MS);
    return () => {
      if (raceCycleRef.current) clearInterval(raceCycleRef.current);
    };
  }, [upcomingRaces.length, raceIndex, goToRace]);

  const activeRace = upcomingRaces[raceIndex] ?? null;
  const comps = participations.map((p) => {
    const id = p.competition_id;
    const name = summaryByComp?.byComp[id]?.name ?? id;
    const status = compStatusByCompId[id] ?? 'live';
    const range = compDateRangeByCompId[id];
    const nextDay = upcomingRaces.find((d) => d.competitionId === id);
    return {
      id,
      name,
      status,
      range,
      isCreator: creatorByCompId[id] === userId,
      pickHint: nextDay
        ? nextDay.hasAllPicks
          ? nextDay.isLocked
            ? 'Selections locked'
            : 'Picks complete'
          : nextDay.isLocked
            ? 'Selections locked'
            : 'Pick available'
        : status === 'complete'
          ? 'Festival complete'
          : null,
    };
  });

  const tableCompId = comps.find((c) => c.status === 'live')?.id ?? comps[0]?.id ?? null;
  const tableCompName =
    (tableCompId && summaryByComp?.byComp[tableCompId]?.name) ||
    comps.find((c) => c.id === tableCompId)?.name ||
    'Competition';

  const onJoin = async () => {
    if (!userId) {
      Alert.alert('Error', 'You must be signed in.');
      return;
    }
    setJoining(true);
    try {
      const outcome = await joinCompetitionWithAccessCode({
        userId,
        code: joinCode,
        displayNameToUse: displayName.trim() || 'Tipster',
      });
      if (outcome.kind === 'error') {
        Alert.alert('Error', outcome.message);
        return;
      }
      if (outcome.kind === 'invalid_code') {
        Alert.alert('Invalid code', 'This access code is not recognised.');
        return;
      }
      if (outcome.kind === 'already_in') {
        Alert.alert('Already in', `You're already in "${outcome.competitionName}".`);
        setTab('competitions');
        await load(true);
        return;
      }
      Alert.alert(
        'Request sent',
        `Your request to join "${outcome.competitionName}" has been sent. An admin will approve you soon.`
      );
      setJoinCode('');
      setTab('competitions');
      await load(true);
    } finally {
      setJoining(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrapper: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          paddingTop:
            Platform.OS === 'web'
              ? Math.max(theme.spacing.md, insets.top + 6)
              : insets.top + theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        },
        headerMenu: { padding: 4 },
        titleBlock: { flex: 1 },
        headerRefresh: {
          padding: 6,
          minWidth: 36,
          alignItems: 'center',
          justifyContent: 'center',
        },
        title: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 20,
          color: theme.colors.text,
        },
        sub: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.accent,
          marginTop: 2,
        },
        spotlightWrap: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
        },
        spotlight: {
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.lg,
          borderWidth: 1.5,
          borderColor: theme.colors.accent,
          paddingVertical: 16,
          paddingHorizontal: 16,
          gap: 12,
          shadowColor: theme.colors.accent,
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        },
        spotlightHead: {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        },
        spotlightTitle: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 12,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: theme.colors.accent,
        },
        spotlightMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
          flexShrink: 1,
          textAlign: 'right',
        },
        cardTap: { paddingVertical: 6, overflow: 'hidden' },
        cardSlide: { width: '100%' },
        cardRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        cardSide: { flex: 1, alignItems: 'center', gap: 6, minWidth: 0 },
        cardCourse: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 15,
          color: theme.colors.text,
          textAlign: 'center',
        },
        cardComp: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
          textAlign: 'center',
        },
        cardMid: { alignItems: 'center', minWidth: 72, gap: 4 },
        cardVs: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        cardTime: {
          fontFamily: theme.fontFamily.baiExtraLight,
          fontSize: 11,
          color: theme.colors.textMuted,
          textAlign: 'center',
        },
        cardRaceName: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.text,
          textAlign: 'center',
        },
        cardHint: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: theme.colors.accent,
          textAlign: 'center',
        },
        dots: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 5,
          paddingTop: 2,
        },
        dot: {
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: theme.colors.borderLight,
        },
        dotActive: {
          backgroundColor: theme.colors.accent,
          width: 14,
          borderRadius: 3,
        },
        mainScroll: { flex: 1 },
        mainScrollContent: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.md,
          flexGrow: 1,
          ...(isWideWeb ? { maxWidth: 960, width: '100%', alignSelf: 'center' as const } : null),
        },
        homePanel: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          overflow: 'hidden',
        },
        homePanelTabsRow: {
          flexDirection: 'row',
          alignItems: 'stretch',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        tabs: { flex: 1, flexDirection: 'row', backgroundColor: theme.colors.surface },
        tab: {
          flex: 1,
          paddingVertical: 11,
          paddingHorizontal: 2,
          alignItems: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        tabActive: { borderBottomColor: theme.colors.accent },
        tabCollapsedActive: { borderBottomColor: 'transparent' },
        tabText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: isNarrowWeb ? 11 : 12,
          color: theme.colors.textMuted,
          textAlign: 'center',
        },
        tabTextActive: { color: theme.colors.accent },
        homePanelCollapseBtn: {
          paddingHorizontal: 10,
          alignItems: 'center',
          justifyContent: 'center',
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderLeftColor: theme.colors.border,
        },
        panelBody: {
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.md,
          gap: theme.spacing.lg,
        },
        sectionLabel: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 11,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          color: theme.colors.textMuted,
          marginBottom: 8,
        },
        joinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        input: {
          flex: 1,
          fontFamily: theme.fontFamily.input,
          fontSize: 14,
          color: theme.colors.text,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
          paddingHorizontal: 12,
          paddingVertical: 8,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          backgroundColor: theme.colors.surface,
        },
        joinBtn: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.sm,
          paddingVertical: 9,
          paddingHorizontal: 14,
          minWidth: 72,
          alignItems: 'center',
        },
        joinBtnText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.black,
        },
        joinHint: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginTop: 8,
          lineHeight: 16,
        },
        list: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        rowLast: { borderBottomWidth: 0 },
        rowCopy: { flex: 1, minWidth: 0, gap: 3 },
        rowTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        },
        rowTitle: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 15,
          color: theme.colors.text,
        },
        rowMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        rowPickHint: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.accent,
        },
        manageChip: {
          paddingVertical: 2,
          paddingHorizontal: 6,
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.accent,
        },
        manageChipText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: theme.colors.accent,
        },
        badge: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        empty: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
          lineHeight: 18,
        },
        emptyBlock: { gap: 10 },
        emptyAction: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
        },
        emptyActionText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.accent,
        },
        tableWrap: { minHeight: 120 },
      }),
    [theme, insets.top, insets.bottom, isNarrowWeb, isWideWeb]
  );

  const raceSlideStyle = { transform: [{ translateX: raceSlideX }] };

  const renderNextRace = () => {
    if (upcomingRaces.length === 0 && participations.length === 0) return null;
    const dayNum = activeRace
      ? dayNumberByKey.get(`${activeRace.competitionId}:${activeRace.raceDate}`)
      : null;
    const inPlay =
      activeRace &&
      new Date(activeRace.firstRaceUtc).getTime() <= nowMs &&
      new Date(activeRace.lastRaceUtc).getTime() > nowMs;

    return (
      <View style={styles.spotlightWrap}>
        <View style={styles.spotlight}>
          <View style={styles.spotlightHead}>
            <Text style={styles.spotlightTitle}>
              {dayNum != null ? `Next race · Day ${dayNum}` : 'Next race'}
            </Text>
            <Text style={styles.spotlightMeta} numberOfLines={1}>
              {upcomingRaces.length ? `${raceIndex + 1}/${upcomingRaces.length}` : 'No races'}
            </Text>
          </View>

          {activeRace ? (
            <Pressable
              style={styles.cardTap}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w > 0 && Math.abs(w - raceCardWidth) > 1) setRaceCardWidth(w);
              }}
              onPress={() => {
                if (upcomingRaces.length > 1) {
                  goToRace(raceIndex + 1, { direction: 'left' });
                } else {
                  router.push('/(app)/selections' as any);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel="Next race"
            >
              <Animated.View style={[styles.cardSlide, raceSlideStyle]}>
                <View style={styles.cardRow}>
                  <View style={styles.cardSide}>
                    <Text style={styles.cardCourse} numberOfLines={2}>
                      {activeRace.course}
                    </Text>
                    <Text style={styles.cardComp} numberOfLines={1}>
                      {activeRace.competitionName}
                    </Text>
                  </View>
                  <View style={styles.cardMid}>
                    {inPlay ? (
                      <>
                        <Text style={styles.cardVs}>Live</Text>
                        <Text style={styles.cardHint}>In play</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.cardVs}>starts</Text>
                        <Text style={styles.cardTime}>
                          {new Date(activeRace.firstRaceUtc).toLocaleString(undefined, {
                            weekday: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </>
                    )}
                  </View>
                  <View style={styles.cardSide}>
                    <Text style={styles.cardRaceName} numberOfLines={2}>
                      {activeRace.firstRaceName ?? 'Racecard'}
                    </Text>
                    <Text style={styles.cardComp}>
                      {activeRace.firstRaceRunnerCount
                        ? `${activeRace.firstRaceRunnerCount} runners`
                        : activeRace.hasAllPicks
                          ? 'Picks in'
                          : `${activeRace.pendingCount} to pick`}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            </Pressable>
          ) : (
            <Text style={styles.empty}>No upcoming race days yet.</Text>
          )}

          {upcomingRaces.length > 1 ? (
            <View style={styles.dots}>
              {upcomingRaces.map((d, i) => (
                <Pressable
                  key={`${d.competitionId}:${d.raceDayId}`}
                  onPress={() => goToRace(i)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Show race day ${i + 1}`}
                >
                  <View style={[styles.dot, i === raceIndex && styles.dotActive]} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Pressable
          style={styles.headerMenu}
          onPress={openSidebar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Ionicons name="menu" size={24} color={theme.colors.text} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Top Tipster Racing</Text>
          <Text style={styles.sub}>Racing festivals</Text>
        </View>
        <Pressable
          style={styles.headerRefresh}
          onPress={onRefresh}
          disabled={refreshing}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : (
            <Ionicons name="refresh" size={22} color={theme.colors.text} />
          )}
        </Pressable>
      </View>

      {renderNextRace()}

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainScrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        }
      >
        <View style={styles.homePanel}>
          <View style={styles.homePanelTabsRow}>
            <View style={styles.tabs}>
              {(
                [
                  { key: 'competitions' as const, label: 'My competitions' },
                  { key: 'join' as const, label: 'Join' },
                  { key: 'table' as const, label: 'Table' },
                ] as const
              ).map((t) => {
                const active = tab === t.key;
                return (
                  <Pressable
                    key={t.key}
                    style={[
                      styles.tab,
                      active && styles.tabActive,
                      active && !homePanelExpanded && styles.tabCollapsedActive,
                    ]}
                    onPress={() => {
                      setTab(t.key);
                      if (!homePanelExpanded) setHomePanelExpanded(true);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={styles.homePanelCollapseBtn}
              onPress={() => setHomePanelExpanded((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: homePanelExpanded }}
              accessibilityLabel={
                homePanelExpanded ? 'Collapse competitions panel' : 'Expand competitions panel'
              }
              hitSlop={6}
            >
              <Ionicons
                name={homePanelExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={theme.colors.textMuted}
              />
            </Pressable>
          </View>

          {homePanelExpanded ? (
            <View style={styles.panelBody}>
              {tab === 'competitions' ? (
                <>
                  {pending.length > 0 ? (
                    <View>
                      <Text style={styles.sectionLabel}>Pending approval</Text>
                      <View style={styles.list}>
                        {pending.map((p, i) => (
                          <View
                            key={p.competition_id}
                            style={[styles.row, i === pending.length - 1 && styles.rowLast]}
                          >
                            <View style={styles.rowCopy}>
                              <Text style={styles.rowTitle}>{p.name}</Text>
                              <Text style={styles.rowMeta}>Waiting for admin</Text>
                            </View>
                            <Text style={styles.badge}>Pending</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  <View>
                    <Text style={styles.sectionLabel}>Your leagues</Text>
                    {comps.length === 0 ? (
                      <View style={styles.emptyBlock}>
                        <Text style={styles.empty}>
                          No competitions yet. Got a competition code? Enter it on the Join tab to
                          get started.
                        </Text>
                        <Pressable
                          style={styles.emptyAction}
                          onPress={() => setTab('join')}
                          accessibilityRole="button"
                          accessibilityLabel="Enter competition code"
                        >
                          <Text style={styles.emptyActionText}>Enter competition code</Text>
                          <Ionicons name="arrow-forward" size={14} color={theme.colors.accent} />
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.list}>
                        {comps.map((c, i) => (
                          <Pressable
                            key={c.id}
                            style={[styles.row, i === comps.length - 1 && styles.rowLast]}
                            onPress={() =>
                              router.push({
                                pathname: '/(app)/competition/[competitionId]',
                                params: { competitionId: c.id },
                              } as any)
                            }
                          >
                            <View style={styles.rowCopy}>
                              <View style={styles.rowTitleRow}>
                                <Text style={styles.rowTitle}>{c.name}</Text>
                                {c.isCreator ? (
                                  <View style={styles.manageChip}>
                                    <Text style={styles.manageChipText}>Admin</Text>
                                  </View>
                                ) : null}
                              </View>
                              <Text style={styles.rowMeta}>
                                {c.range
                                  ? `${c.status} · ${c.range.start} – ${c.range.end}`
                                  : c.status}
                              </Text>
                              {c.pickHint ? (
                                <Text
                                  style={
                                    c.pickHint === 'Pick available'
                                      ? styles.rowPickHint
                                      : styles.rowMeta
                                  }
                                >
                                  {c.pickHint}
                                </Text>
                              ) : null}
                            </View>
                            <Ionicons
                              name="chevron-forward"
                              size={16}
                              color={theme.colors.textMuted}
                            />
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                </>
              ) : null}

              {tab === 'join' ? (
                <View>
                  <Text style={styles.sectionLabel}>Competition code</Text>
                  <View style={styles.joinRow}>
                    <TextInput
                      style={styles.input}
                      value={joinCode}
                      onChangeText={setJoinCode}
                      placeholder="CODE"
                      placeholderTextColor={theme.colors.textMuted}
                      autoCapitalize="characters"
                      maxLength={12}
                      autoCorrect={false}
                    />
                    <Pressable style={styles.joinBtn} onPress={() => void onJoin()} disabled={joining}>
                      {joining ? (
                        <ActivityIndicator color={theme.colors.black} size="small" />
                      ) : (
                        <Text style={styles.joinBtnText}>Join</Text>
                      )}
                    </Pressable>
                  </View>
                  <Text style={styles.joinHint}>
                    Ask the competition organiser for the access code, then enter it here. You’ll
                    appear in My competitions once they approve you.
                  </Text>
                </View>
              ) : null}

              {tab === 'table' ? (
                <View style={styles.tableWrap}>
                  {tableCompId ? (
                    <HomeLeaderboardPanel
                      competitionId={tableCompId}
                      competitionName={tableCompName}
                    />
                  ) : (
                    <Text style={styles.empty}>Join a competition to see the table.</Text>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
