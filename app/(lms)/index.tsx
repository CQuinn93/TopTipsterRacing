import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  lmsCreateCompetition,
  lmsGetGameweekPickStats,
  lmsGetHome,
  lmsJoinErrorMessage,
  lmsListGameweeks,
  lmsRequestJoin,
  type LmsCompetitionHomeSummary,
  type LmsFixture,
  type LmsGameweek,
  type LmsGameweekPickStats,
  type LmsPendingJoin,
  type LmsPickStatOutcome,
} from '@/lib/lms/api';
import { getProfileRole, isStaffRole } from '@/lib/adminSession';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import { LeagueTablePanel } from '@/components/lms/LeagueTablePanel';
import { lmsDisplayTeamName } from '@/lib/lms/teamColours';
import { LmsTrademarkDisclaimer } from '@/components/lms/LmsTrademarkDisclaimer';
import { LmsPushNotificationsCard } from '@/components/lms/LmsPushNotificationsCard';

type HomeTab = 'competitions' | 'join' | 'table';

/** Pause between fixture slides (auto-advance). */
const FIXTURE_CYCLE_MS = 6500;
/** Exit / enter duration for the swipe-left transition. */
const FIXTURE_SLIDE_MS = 380;
const LMS_MANUAL_REFRESH_COOLDOWN_MS = 60_000;

export default function LmsHomeScreen() {
  const theme = useTheme();
  const { openSidebar } = useSidebar();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [comps, setComps] = useState<LmsCompetitionHomeSummary[]>([]);
  const [pending, setPending] = useState<LmsPendingJoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [tab, setTab] = useState<HomeTab>('competitions');
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  const [gw, setGw] = useState<LmsGameweek | null>(null);
  const [fixtures, setFixtures] = useState<LmsFixture[]>([]);
  const [fxIndex, setFxIndex] = useState(0);
  const [pickStats, setPickStats] = useState<LmsGameweekPickStats | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEntry, setCreateEntry] = useState('');
  const [createExtraLives, setCreateExtraLives] = useState(0);
  const [createGwId, setCreateGwId] = useState<string | null>(null);
  const [createGws, setCreateGws] = useState<LmsGameweek[]>([]);
  const [creating, setCreating] = useState(false);
  const [fixtureCardWidth, setFixtureCardWidth] = useState(280);
  const homeLoadedRef = useRef(false);
  const createGwsLoadedRef = useRef(false);
  const lastManualRefreshAtRef = useRef<number | null>(null);
  const fixtureSlideAnim = useRef(new Animated.Value(0)).current;
  const fixtureAnimatingRef = useRef(false);
  const fxIndexRef = useRef(0);

  useEffect(() => {
    if (tabParam === 'table' || tabParam === 'join' || tabParam === 'competitions') {
      setTab(tabParam);
    }
  }, [tabParam]);

  const upcomingFixtures = useMemo(() => {
    const open = fixtures.filter((f) => f.status !== 'finished' && !f.excluded_from_lms);
    return open.length ? open : fixtures.filter((f) => !f.excluded_from_lms);
  }, [fixtures]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [home, role] = await Promise.all([
        lmsGetHome('2026/27'),
        getProfileRole(userId),
      ]);
      const staff = isStaffRole(role);
      setIsStaff(staff);
      setComps(home.competitions);
      setPending(home.pending);
      setGw(home.nextUp.gameweek);
      setFixtures(home.nextUp.fixtures);
      fxIndexRef.current = 0;
      setFxIndex(0);
      fixtureSlideAnim.setValue(0);
      fixtureAnimatingRef.current = false;
      setTab((prev) => {
        if (tabParam === 'table' || tabParam === 'join' || tabParam === 'competitions') {
          return tabParam;
        }
        if (prev === 'join' || prev === 'table') return prev;
        return home.competitions.length === 0 && home.pending.length === 0
          ? 'join'
          : 'competitions';
      });

      if (home.nextUp.gameweek?.id) {
        const stats = await lmsGetGameweekPickStats(home.nextUp.gameweek.id);
        setPickStats(stats.revealed ? stats : null);
      } else {
        setPickStats(null);
      }

      if (staff && !createGwsLoadedRef.current) {
        const gws = await lmsListGameweeks('2026/27');
        createGwsLoadedRef.current = true;
        setCreateGws(gws);
        const defaultGw =
          home.nextUp.gameweek?.id ??
          gws.find((g) => g.status !== 'complete')?.id ??
          gws[0]?.id ??
          null;
        setCreateGwId((prev) => prev ?? defaultGw);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load competitions';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, tabParam]);

  const loadRef = useRef(load);
  loadRef.current = load;

  const requestManualRefresh = useCallback(() => {
    if (refreshing || loading) return;
    const now = Date.now();
    const last = lastManualRefreshAtRef.current;
    if (last != null && now - last < LMS_MANUAL_REFRESH_COOLDOWN_MS) {
      const waitSec = Math.ceil((LMS_MANUAL_REFRESH_COOLDOWN_MS - (now - last)) / 1000);
      Alert.alert('Slow down', `You can refresh again in ${waitSec}s.`);
      return;
    }
    lastManualRefreshAtRef.current = now;
    setRefreshing(true);
    if (tab === 'table') setTableRefreshKey((k) => k + 1);
    void load();
  }, [refreshing, loading, tab, load]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      if (homeLoadedRef.current) return;
      homeLoadedRef.current = true;
      void loadRef.current();
    }, [userId])
  );

  useEffect(() => {
    fxIndexRef.current = fxIndex;
  }, [fxIndex]);

  const goToFixture = useCallback(
    (nextIndex: number, opts?: { animated?: boolean; direction?: 'left' | 'right' }) => {
      const count = upcomingFixtures.length;
      if (count < 1) return;
      const target = ((nextIndex % count) + count) % count;
      const animated = opts?.animated !== false;
      const current = fxIndexRef.current;

      if (target === current) return;
      if (fixtureAnimatingRef.current) return;

      if (!animated || count < 2) {
        fxIndexRef.current = target;
        setFxIndex(target);
        fixtureSlideAnim.setValue(0);
        return;
      }

      const direction =
        opts?.direction ??
        (target === (current + 1) % count || (current === count - 1 && target === 0)
          ? 'left'
          : target === (current - 1 + count) % count || (current === 0 && target === count - 1)
            ? 'right'
            : 'left');

      const exitTo = direction === 'left' ? -1 : 1;
      const enterFrom = direction === 'left' ? 1 : -1;

      fixtureAnimatingRef.current = true;
      Animated.timing(fixtureSlideAnim, {
        toValue: exitTo,
        duration: FIXTURE_SLIDE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          fixtureAnimatingRef.current = false;
          return;
        }
        fxIndexRef.current = target;
        setFxIndex(target);
        fixtureSlideAnim.setValue(enterFrom);
        Animated.timing(fixtureSlideAnim, {
          toValue: 0,
          duration: FIXTURE_SLIDE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          fixtureAnimatingRef.current = false;
        });
      });
    },
    [upcomingFixtures.length, fixtureSlideAnim]
  );

  useEffect(() => {
    if (upcomingFixtures.length < 2) return;
    const id = setInterval(() => {
      const next = (fxIndexRef.current + 1) % upcomingFixtures.length;
      goToFixture(next, { direction: 'left' });
    }, FIXTURE_CYCLE_MS);
    return () => clearInterval(id);
  }, [upcomingFixtures.length, goToFixture]);

  useEffect(() => {
    if (fxIndex >= upcomingFixtures.length) {
      fxIndexRef.current = 0;
      setFxIndex(0);
      fixtureSlideAnim.setValue(0);
    }
  }, [fxIndex, upcomingFixtures.length, fixtureSlideAnim]);

  const fixtureSlideStyle = useMemo(() => {
    const travel = Math.max(120, fixtureCardWidth * 0.55);
    return {
      opacity: fixtureSlideAnim.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
      }),
      transform: [
        {
          translateX: fixtureSlideAnim.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-travel, 0, travel],
          }),
        },
      ],
    };
  }, [fixtureSlideAnim, fixtureCardWidth]);

  const onJoin = async () => {
    if (!code.trim()) {
      Alert.alert('Competition code', 'Enter the competition code to join.');
      return;
    }
    setJoining(true);
    try {
      const res = await lmsRequestJoin(code);
      if (!res.success) {
        Alert.alert('Join failed', lmsJoinErrorMessage(res.error));
        return;
      }
      setCode('');
      const compName = res.competition_name?.trim() || 'the competition';
      const joinMsg =
        `You have successfully requested to join ${compName}. ` +
        `Please contact one of the admins for this competition so they can verify you. ` +
        `Once verified, the admin will accept your request.`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(joinMsg);
      } else {
        Alert.alert('Request sent', joinMsg);
      }
      await load();
      setTab('competitions');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Join failed');
    } finally {
      setJoining(false);
    }
  };

  const onCreateCompetition = async () => {
    if (!createName.trim()) {
      Alert.alert('Name required', 'Enter a competition name.');
      return;
    }
    if (!createGwId) {
      Alert.alert('Starting week required', 'Choose which gameweek this competition starts on.');
      return;
    }
    setCreating(true);
    try {
      const res = await lmsCreateCompetition(
        createName.trim(),
        createGwId,
        '2026/27',
        createEntry.trim() || undefined,
        createExtraLives
      );
      if (!res.success) {
        Alert.alert('Failed', res.error ?? 'Could not create competition');
        return;
      }
      setCreateName('');
      setCreateEntry('');
      setCreateExtraLives(0);
      setShowCreate(false);
      Alert.alert(
        'Created',
        `Join code: ${res.access_code ?? '—'}${
          res.start_gameweek_number != null ? `\nStarts GW${res.start_gameweek_number}` : ''
        }`
      );
      await load();
      if (res.competition_id) {
        router.push(`/(lms)/${res.competition_id}` as any);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const activeFixture = upcomingFixtures[fxIndex] ?? null;

  const statusLabel = (status: string) => {
    if (status === 'active') return 'Still standing';
    if (status === 'winner') return 'Champion';
    if (status === 'eliminated') return 'Eliminated';
    return status;
  };

  const outcomeLabel = (outcome: LmsPickStatOutcome) => {
    switch (outcome) {
      case 'won':
        return 'W';
      case 'lost':
        return 'L';
      case 'draw':
        return 'D';
      case 'pending':
        return '—';
      case 'excluded':
        return 'X';
      default:
        return '—';
    }
  };

  const outcomeColor = (outcome: LmsPickStatOutcome) => {
    switch (outcome) {
      case 'won':
        return theme.colors.accent;
      case 'lost':
        return theme.colors.error;
      case 'draw':
        return theme.colors.textMuted;
      default:
        return theme.colors.textMuted;
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
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
        back: { padding: 4 },
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
        deadlineAlertsWrap: {
          paddingBottom: theme.spacing.sm,
        },
        mainScroll: {
          flex: 1,
        },
        mainScrollContent: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.md,
          flexGrow: 1,
        },
        homePanel: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          overflow: 'hidden',
        },
        panelBody: {
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.md,
          gap: theme.spacing.lg,
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
        cardTap: {
          paddingVertical: 6,
          overflow: 'hidden',
        },
        cardSlide: {
          width: '100%',
        },
        cardRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        cardSide: {
          flex: 1,
          alignItems: 'center',
          gap: 6,
        },
        cardName: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.text,
          textAlign: 'center',
        },
        cardMid: {
          alignItems: 'center',
          minWidth: 64,
          gap: 4,
        },
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
        tabs: {
          flexDirection: 'row',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        tab: {
          flex: 1,
          paddingVertical: 11,
          paddingHorizontal: 2,
          alignItems: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        tabActive: { borderBottomColor: theme.colors.accent },
        tabText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.textMuted,
          textAlign: 'center',
        },
        tabTextActive: { color: theme.colors.accent },
        sectionLabel: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 11,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          color: theme.colors.textMuted,
          marginBottom: 8,
        },
        joinRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
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
          color: theme.colors.white,
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
        rowTitle: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 15,
          color: theme.colors.text,
        },
        rowTitleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        },
        manageChip: {
          paddingVertical: 2,
          paddingHorizontal: 6,
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        manageChipText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: theme.colors.accent,
        },
        createToggle: {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 6,
          marginBottom: 8,
        },
        createToggleText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.accent,
        },
        createPanel: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          padding: 12,
          gap: 10,
          marginBottom: 12,
        },
        createInput: {
          fontFamily: theme.fontFamily.input,
          fontSize: 14,
          color: theme.colors.text,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: theme.colors.background,
        },
        createFieldLabel: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 11,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.colors.textMuted,
        },
        createHint: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
          lineHeight: 16,
        },
        createGwScroll: {
          marginHorizontal: -4,
        },
        createGwRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 4,
        },
        createGwChip: {
          paddingVertical: 7,
          paddingHorizontal: 12,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.background,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        createGwChipActive: {
          backgroundColor: theme.colors.accentMuted,
          borderColor: theme.colors.accent,
        },
        createGwChipText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.textSecondary,
        },
        createGwChipTextActive: {
          color: theme.colors.accent,
        },
        createSubmit: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.sm,
          paddingVertical: 10,
          alignItems: 'center',
        },
        createSubmitText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.white,
        },
        rowMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textSecondary,
        },
        rowPickHint: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.accent,
          marginTop: 2,
        },
        pickCol: {
          alignItems: 'center',
          minWidth: 52,
          gap: 3,
        },
        pickAbbr: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 10,
          color: theme.colors.textSecondary,
          textTransform: 'uppercase',
        },
        empty: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
          paddingVertical: 8,
          lineHeight: 18,
        },
        emptyBlock: {
          gap: 10,
          paddingVertical: 4,
        },
        emptyAction: {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 6,
        },
        emptyActionText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.accent,
        },
        badge: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 11,
          color: theme.colors.statusAccent,
          textTransform: 'uppercase',
        },
        pickStatsCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          paddingVertical: 12,
          paddingHorizontal: 12,
          gap: 8,
        },
        pickStatsHead: {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        },
        pickStatsTitle: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 11,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          color: theme.colors.textMuted,
        },
        pickStatsMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        pickStatRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 4,
        },
        pickStatName: {
          width: 36,
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 11,
          color: theme.colors.textSecondary,
        },
        pickStatBarTrack: {
          flex: 1,
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.colors.surfaceElevated,
          overflow: 'hidden',
        },
        pickStatBarFill: {
          height: '100%',
          borderRadius: 4,
          backgroundColor: theme.colors.accent,
          minWidth: 0,
        },
        pickStatPct: {
          width: 40,
          textAlign: 'right',
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          color: theme.colors.text,
        },
        pickStatOutcome: {
          width: 16,
          textAlign: 'center',
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 11,
        },
      }),
    [theme, insets.top, insets.bottom]
  );

  const renderNextUp = () => {
    if (!gw) return null;
    return (
      <View style={styles.spotlightWrap}>
        <View style={styles.spotlight}>
          <View style={styles.spotlightHead}>
            <Text style={styles.spotlightTitle}>Next up · GW{gw.number}</Text>
            <Text style={styles.spotlightMeta} numberOfLines={1}>
              {upcomingFixtures.length
                ? `${fxIndex + 1}/${upcomingFixtures.length}`
                : 'No fixtures'}
            </Text>
          </View>

          {activeFixture ? (
            <Pressable
              style={styles.cardTap}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w > 0 && Math.abs(w - fixtureCardWidth) > 1) setFixtureCardWidth(w);
              }}
              onPress={() =>
                goToFixture(
                  upcomingFixtures.length ? (fxIndex + 1) % upcomingFixtures.length : 0,
                  { direction: 'left' }
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Next fixture"
            >
              <Animated.View style={[styles.cardSlide, fixtureSlideStyle]}>
                <View style={styles.cardRow}>
                  <View style={styles.cardSide}>
                    <TeamColourChip
                      shortName={activeFixture.home_team?.short_name}
                      name={activeFixture.home_team?.name}
                      slug={activeFixture.home_team?.slug}
                      size={44}
                    />
                    <Text style={styles.cardName} numberOfLines={1}>
                      {activeFixture.home_team?.short_name ?? 'H'}
                    </Text>
                  </View>
                  <View style={styles.cardMid}>
                    <Text style={styles.cardVs}>vs</Text>
                    <Text style={styles.cardTime}>
                      {new Date(activeFixture.kickoff_at).toLocaleString(undefined, {
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <View style={styles.cardSide}>
                    <TeamColourChip
                      shortName={activeFixture.away_team?.short_name}
                      name={activeFixture.away_team?.name}
                      slug={activeFixture.away_team?.slug}
                      size={44}
                    />
                    <Text style={styles.cardName} numberOfLines={1}>
                      {activeFixture.away_team?.short_name ?? 'A'}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            </Pressable>
          ) : (
            <Text style={styles.empty}>Fixtures not loaded yet.</Text>
          )}

          {upcomingFixtures.length > 1 ? (
            <View style={styles.dots}>
              {upcomingFixtures.map((f, i) => (
                <Pressable
                  key={f.id}
                  onPress={() => goToFixture(i)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Show fixture ${i + 1}`}
                >
                  <View style={[styles.dot, i === fxIndex && styles.dotActive]} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  const renderPickStats = () => {
    if (!gw || !pickStats?.revealed || pickStats.teams.length === 0) return null;
    return (
      <View style={styles.pickStatsCard}>
        <View style={styles.pickStatsHead}>
          <Text style={styles.pickStatsTitle}>
            GW{pickStats.gameweek_number ?? gw.number} picks
          </Text>
          <Text style={styles.pickStatsMeta}>
            {pickStats.total_picks} pick{pickStats.total_picks === 1 ? '' : 's'} · all leagues
          </Text>
        </View>
        {pickStats.teams.map((t) => {
          const widthPct = Math.min(100, Math.max(0, t.pick_pct));
          return (
            <View key={t.team_id} style={styles.pickStatRow}>
              <TeamColourChip
                shortName={t.short_name}
                name={t.name}
                slug={t.slug}
                size={22}
              />
              <Text style={styles.pickStatName} numberOfLines={1}>
                {t.short_name || lmsDisplayTeamName(t.name).slice(0, 3)}
              </Text>
              <View style={styles.pickStatBarTrack}>
                <View
                  style={[
                    styles.pickStatBarFill,
                    {
                      width: `${widthPct}%`,
                      opacity: t.pick_count > 0 ? 1 : 0.25,
                    },
                  ]}
                />
              </View>
              <Text style={styles.pickStatPct}>
                {t.pick_pct.toFixed(t.pick_pct % 1 === 0 ? 0 : 1)}%
              </Text>
              <Text style={[styles.pickStatOutcome, { color: outcomeColor(t.outcome) }]}>
                {outcomeLabel(t.outcome)}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          onPress={openSidebar}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Ionicons name="menu" size={24} color={theme.colors.text} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Last Man Standing</Text>
          <Text style={styles.sub}>Premier League 2026/27</Text>
        </View>
        <Pressable
          style={styles.headerRefresh}
          onPress={requestManualRefresh}
          disabled={refreshing || loading}
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

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.accent} />
      ) : (
        <>
          {renderNextUp()}

          <ScrollView
            style={styles.mainScroll}
            contentContainerStyle={styles.mainScrollContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={requestManualRefresh}
                tintColor={theme.colors.accent}
                colors={[theme.colors.accent]}
              />
            }
          >
            {renderPickStats()}

            <View style={styles.deadlineAlertsWrap}>
              <LmsPushNotificationsCard />
            </View>

            <View style={styles.homePanel}>
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
                      style={[styles.tab, active && styles.tabActive]}
                      onPress={() => setTab(t.key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.tabText, active && styles.tabTextActive]}>
                        {t.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

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
                      {isStaff ? (
                        <>
                          <Pressable
                            style={styles.createToggle}
                            onPress={() => setShowCreate((v) => !v)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: showCreate }}
                            accessibilityLabel="Create competition"
                          >
                            <Ionicons
                              name={showCreate ? 'chevron-up' : 'add-circle-outline'}
                              size={18}
                              color={theme.colors.accent}
                            />
                            <Text style={styles.createToggleText}>Create competition</Text>
                          </Pressable>
                          {showCreate ? (
                            <View style={styles.createPanel}>
                              <TextInput
                                style={styles.createInput}
                                value={createName}
                                onChangeText={setCreateName}
                                placeholder="e.g. Office LMS"
                                placeholderTextColor={theme.colors.textMuted}
                                autoCorrect={false}
                              />
                              <Text style={styles.createFieldLabel}>Starting gameweek</Text>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.createGwScroll}
                                contentContainerStyle={styles.createGwRow}
                                nestedScrollEnabled
                              >
                                {createGws.slice(0, 20).map((g) => {
                                  const active = createGwId === g.id;
                                  return (
                                    <Pressable
                                      key={g.id}
                                      style={[
                                        styles.createGwChip,
                                        active && styles.createGwChipActive,
                                      ]}
                                      onPress={() => setCreateGwId(g.id)}
                                    >
                                      <Text
                                        style={[
                                          styles.createGwChipText,
                                          active && styles.createGwChipTextActive,
                                        ]}
                                      >
                                        GW{g.number}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </ScrollView>
                              <Text style={styles.createFieldLabel}>Extra lives</Text>
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.createGwScroll}
                                contentContainerStyle={styles.createGwRow}
                                nestedScrollEnabled
                              >
                                {[0, 1, 2, 3].map((n) => {
                                  const active = createExtraLives === n;
                                  return (
                                    <Pressable
                                      key={n}
                                      style={[
                                        styles.createGwChip,
                                        active && styles.createGwChipActive,
                                      ]}
                                      onPress={() => setCreateExtraLives(n)}
                                    >
                                      <Text
                                        style={[
                                          styles.createGwChipText,
                                          active && styles.createGwChipTextActive,
                                        ]}
                                      >
                                        {n}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </ScrollView>
                              <Text style={styles.createHint}>
                                0 = out on first loss. Missed picks still go out immediately.
                              </Text>
                              <Text style={styles.createFieldLabel}>Entry fee (optional)</Text>
                              <TextInput
                                style={styles.createInput}
                                value={createEntry}
                                onChangeText={setCreateEntry}
                                placeholder="e.g. £10 cash to organiser"
                                placeholderTextColor={theme.colors.textMuted}
                                autoCorrect={false}
                              />
                              <Pressable
                                style={styles.createSubmit}
                                onPress={() => void onCreateCompetition()}
                                disabled={creating}
                              >
                                {creating ? (
                                  <ActivityIndicator color={theme.colors.white} size="small" />
                                ) : (
                                  <Text style={styles.createSubmitText}>Create</Text>
                                )}
                              </Pressable>
                            </View>
                          ) : null}
                        </>
                      ) : null}
                      {comps.length === 0 ? (
                        <View style={styles.emptyBlock}>
                          <Text style={styles.empty}>
                            No competitions yet. Got a competition code? Enter it on the Join tab
                            to get started.
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
                          {comps.map((c, i) => {
                            const remainLabel =
                              c.totalCount > 0
                                ? `${c.aliveCount} of ${c.totalCount} remain`
                                : statusLabel(c.participant_status);
                            return (
                              <Pressable
                                key={c.competition_id}
                                style={[styles.row, i === comps.length - 1 && styles.rowLast]}
                                onPress={() => router.push(`/(lms)/${c.competition_id}` as any)}
                              >
                                <View style={styles.rowCopy}>
                                  <View style={styles.rowTitleRow}>
                                    <Text style={styles.rowTitle}>{c.name}</Text>
                                    {c.isCreator ? (
                                      <View style={styles.manageChip}>
                                        <Text style={styles.manageChipText}>Admin</Text>
                                      </View>
                                    ) : c.canManage ? (
                                      <View style={styles.manageChip}>
                                        <Text style={styles.manageChipText}>Owner</Text>
                                      </View>
                                    ) : c.isManager || c.canHandleJoins ? (
                                      <View style={styles.manageChip}>
                                        <Text style={styles.manageChipText}>Manager</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                  <Text style={styles.rowMeta}>{remainLabel}</Text>
                                  {c.participant_status === 'active' && c.pickAvailable ? (
                                    <Text style={styles.rowPickHint}>Pick available</Text>
                                  ) : c.participant_status !== 'active' ? (
                                    <Text style={styles.rowMeta}>
                                      {statusLabel(c.participant_status)}
                                    </Text>
                                  ) : null}
                                </View>
                                {c.pickTeam ? (
                                  <View style={styles.pickCol}>
                                    <TeamColourChip
                                      shortName={c.pickTeam.short_name}
                                      name={c.pickTeam.name}
                                      slug={c.pickTeam.slug}
                                      size={28}
                                    />
                                    <Text style={styles.pickAbbr} numberOfLines={1}>
                                      {c.pickTeam.short_name || c.pickTeam.name.slice(0, 3)}
                                    </Text>
                                  </View>
                                ) : (
                                  <Ionicons
                                    name="chevron-forward"
                                    size={16}
                                    color={theme.colors.textMuted}
                                  />
                                )}
                              </Pressable>
                            );
                          })}
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
                        value={code}
                        onChangeText={setCode}
                        placeholder="CODE"
                        placeholderTextColor={theme.colors.textMuted}
                        autoCapitalize="characters"
                        maxLength={6}
                        autoCorrect={false}
                      />
                      <Pressable
                        style={styles.joinBtn}
                        onPress={() => void onJoin()}
                        disabled={joining}
                      >
                        {joining ? (
                          <ActivityIndicator color={theme.colors.white} size="small" />
                        ) : (
                          <Text style={styles.joinBtnText}>Join</Text>
                        )}
                      </Pressable>
                    </View>
                    <Text style={styles.joinHint}>
                      Ask the competition organiser for the 6-character code, then enter it here.
                      You’ll appear in My competitions once they approve you.
                    </Text>
                  </View>
                ) : null}

                {tab === 'table' ? <LeagueTablePanel refreshKey={tableRefreshKey} /> : null}
              </View>
            </View>

            <LmsTrademarkDisclaimer />
          </ScrollView>
        </>
      )}
    </View>
  );
}
