import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { getAvailableRacesForUser } from '@/lib/availableRacesCache';
import { fetchHomeSummaryByComp, type HomeSummaryByComp } from '@/lib/homeSummary';
import { useForceRefresh } from '@/contexts/ForceRefreshContext';
import { getOrCreateTabletCode } from '@/lib/tabletCode';
import type { ParticipationRow } from '@/lib/availableRacesCache';
import type { AvailableRaceDay } from '@/lib/availableRacesForUser';
import { isSelectionClosed, getCompetitionDisplayStatus } from '@/lib/appUtils';
import { decimalToFractional } from '@/lib/oddsFormat';
import { requestPermissionsAndSetup, scheduleSelectionReminders } from '@/lib/selectionReminderNotifications';
import { getNotificationCompetitionIds } from '@/lib/notificationCompetitionPrefs';

const TABLET_MODE_INFO =
  'Use this code on a shared device to make selections without logging in. Hold Sign in for 7s on the login screen to open tablet mode.';

export default function HomeScreen() {
  const theme = useTheme();
  const { userId, session } = useAuth();
  const [displayName, setDisplayName] = useState<string>('');
  const [participations, setParticipations] = useState<ParticipationRow[]>([]);
  const [availableRaces, setAvailableRaces] = useState<AvailableRaceDay[]>([]);
  const [summaryByComp, setSummaryByComp] = useState<HomeSummaryByComp | null>(null);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null); // null = Overall
  const [refreshing, setRefreshing] = useState(false);
  const [tabletCode, setTabletCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(true);
  const [compStatusByCompId, setCompStatusByCompId] = useState<Record<string, 'upcoming' | 'live' | 'complete'>>({});
  const [compPositionByCompId, setCompPositionByCompId] = useState<Record<string, number | null>>({});
  const [participantCountByCompId, setParticipantCountByCompId] = useState<Record<string, number>>({});
  const [compDaysByCompId, setCompDaysByCompId] = useState<Record<string, number>>({});
  const [compDateRangeByCompId, setCompDateRangeByCompId] = useState<Record<string, { start: string; end: string }>>({});
  const scrollRef = useRef<ScrollView>(null);

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
        const optedIn = await getNotificationCompetitionIds(userId);
        const optedInSet = new Set(optedIn);
        const toSchedule = r.filter((day) => optedInSet.has(day.competitionId));
        if (toSchedule.length > 0) {
          requestPermissionsAndSetup().then((granted) => {
            if (granted) scheduleSelectionReminders(toSchedule);
          });
        }
        if (p.length > 0) {
          const compIds = p.map((x) => x.competition_id);
          const [summary, compsRes, partsCountRes] = await Promise.all([
            fetchHomeSummaryByComp(supabase, userId, compIds),
            supabase.from('competitions').select('id, festival_start_date, festival_end_date').in('id', compIds),
            supabase.from('competition_participants').select('competition_id').in('competition_id', compIds),
          ]);
          setSummaryByComp(summary);
          const statusByComp: Record<string, 'upcoming' | 'live' | 'complete'> = {};
          const daysByComp: Record<string, number> = {};
          const dateRangeByComp: Record<string, { start: string; end: string }> = {};
          const countByComp: Record<string, number> = {};
          for (const c of compsRes.data ?? []) {
            const row = c as { id: string; festival_start_date: string; festival_end_date: string };
            statusByComp[row.id] = getCompetitionDisplayStatus(row.festival_start_date, row.festival_end_date) ?? 'live';
            const start = new Date(row.festival_start_date).getTime();
            const end = new Date(row.festival_end_date).getTime();
            daysByComp[row.id] = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1);
            dateRangeByComp[row.id] = {
              start: new Date(row.festival_start_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
              end: new Date(row.festival_end_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
            };
          }
          for (const p of partsCountRes.data ?? []) {
            const compId = (p as { competition_id: string }).competition_id;
            countByComp[compId] = (countByComp[compId] ?? 0) + 1;
          }
          setCompStatusByCompId(statusByComp);
          setCompDaysByCompId(daysByComp);
          setCompDateRangeByCompId(dateRangeByComp);
          setParticipantCountByCompId(countByComp);

          if (compIds.length > 0) {
            const { data: allSelections } = await supabase
              .from('daily_selections')
              .select('competition_id, user_id, selections')
              .in('competition_id', compIds);
            type SelRow = { competition_id: string; user_id: string; selections: Record<string, { oddsDecimal?: number }> | null };
            const rows = (allSelections ?? []) as SelRow[];
            const totalByCompUser: Record<string, Record<string, number>> = {};
            const positionByComp: Record<string, number | null> = {};
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
          setParticipantCountByCompId({});
          setCompDaysByCompId({});
          setCompDateRangeByCompId({});
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
    return {
      label: 'Next race off',
      course: first.course,
      dateStr,
      timeStr,
      raceName: first.firstRaceName ?? 'Race',
      runnerCount: first.firstRaceRunnerCount ?? 0,
    };
  })();

  const styles = useMemo(
    () => {
      const isLight = String(theme.colors.background) === String(lightTheme.colors.background);
      const cardBorder = isLight ? theme.colors.white : theme.colors.border;
      const cardBorderWidth = isLight ? 2 : 1;
      return StyleSheet.create({
        wrapper: { flex: 1, backgroundColor: theme.colors.background },
        container: { flex: 1 },
        content: { padding: theme.spacing.md },
        sectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
          marginTop: theme.spacing.lg,
          marginBottom: theme.spacing.sm,
        },
        sectionTitleFirst: {
          marginTop: 0,
        },
        headerStrip: {
          marginHorizontal: -theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          marginBottom: theme.spacing.md,
          overflow: 'hidden',
          position: 'relative',
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
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.md,
          borderWidth: cardBorderWidth,
          borderColor: cardBorder,
          overflow: 'hidden',
        },
        nextRaceCardTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: 6,
        },
        nextRaceCardRaceName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 17,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: 4,
        },
        nextRaceCardCourse: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.sm,
        },
        nextRaceCardRow: {
          flexDirection: 'row',
          gap: theme.spacing.lg,
          marginBottom: theme.spacing.md,
        },
        nextRaceCardMeta: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        nextRaceCardTime: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.text,
        },
        nextRaceCardRunners: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.text,
        },
        nextRaceCardBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          backgroundColor: theme.colors.accent,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.sm,
          alignSelf: 'flex-start',
        },
        nextRaceCardBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: '#000000',
        },
        nextRaceCardMuted: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.textMuted,
        },
        nextRaceCardEmptyMessage: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.md,
        },
        nextRaceCardBtnFull: {
          alignSelf: 'stretch',
        },
        competitionsCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.md,
          marginTop: theme.spacing.sm,
          borderWidth: cardBorderWidth,
          borderColor: cardBorder,
          overflow: 'hidden',
        },
        compInfoInnerCard: {
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.md,
          overflow: 'hidden',
          position: 'relative',
        },
        compCardHeader: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: theme.spacing.md,
        },
        compCardHeaderCentered: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          fontWeight: '600',
          color: theme.colors.text,
          textAlign: 'center',
        },
        compCardMeetingName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: 4,
        },
        compCardMeetingNameCentered: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 19,
          fontWeight: '700',
          color: theme.colors.text,
          textAlign: 'center',
          marginBottom: 4,
        },
        compCardMetaRow: {
          flexDirection: 'row',
          gap: theme.spacing.lg,
          marginBottom: theme.spacing.md,
        },
        compCardMetaRowCentered: {
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        },
        compCardMeta: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        statsTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
        },
        compSection: { marginBottom: theme.spacing.md },
        compScroll: { marginHorizontal: -theme.spacing.md, marginBottom: theme.spacing.sm },
        compScrollInCard: { marginHorizontal: 0, marginBottom: theme.spacing.sm },
        compScrollContent: {
          paddingHorizontal: theme.spacing.md,
          gap: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
          flexDirection: 'row',
          alignItems: 'flex-start',
        },
        compCircle: {
          alignItems: 'center',
          width: 72,
        },
        compCircleSelected: {},
        compCircleInner: {
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: theme.colors.surface,
          borderWidth: 2,
          borderColor: cardBorder,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: theme.spacing.xs,
        },
        compCircleInnerSelected: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.surfaceElevated,
        },
        compCircleLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
        compCircleLabelSelected: {
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
        cardsSection: {
          marginTop: theme.spacing.sm,
        },
        threeBoxRow: {
          flexDirection: 'row',
          gap: theme.spacing.sm,
        },
        statsGrid: {
          gap: theme.spacing.sm,
        },
        statsRow: {
          flexDirection: 'row',
          gap: theme.spacing.sm,
        },
        statCardHalf: {
          flex: 1,
        },
        statCard: {
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.md,
          padding: theme.spacing.sm,
          borderWidth: cardBorderWidth,
          borderColor: cardBorder,
          alignItems: 'center',
        },
        statCardLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          color: theme.colors.textMuted,
          marginTop: 4,
          textAlign: 'center',
        },
        statCardValue: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 22,
          fontWeight: '700',
          color: theme.colors.text,
        },
        statCardFull: {
          width: '100%',
        },
        muted: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
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
          marginBottom: theme.spacing.md,
        },
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
    },
    [theme]
  );

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: theme.spacing.lg, paddingTop: theme.spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header strip */}
        <View style={styles.headerStrip}>
          <View style={styles.headerStripInner}>
            <View>
              <Text style={styles.headerWelcome}>Top Tipster Racing</Text>
              <Text style={styles.headerHello}>Hello {displayName || '…'}</Text>
            </View>
            <TouchableOpacity style={styles.accountLink} onPress={() => router.push('/(app)/account')} activeOpacity={0.7}>
              <Ionicons name="person-circle-outline" size={28} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tablet mode code */}
        <View style={styles.tabletStrip}>
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

        {!hasJoinedAny && (
          <View style={styles.nextRaceCard}>
            <Text style={styles.nextRaceCardTitle}>Next race</Text>
            <Text style={styles.nextRaceCardEmptyMessage}>
              You have no upcoming competitions or races. Join one now.
            </Text>
            <TouchableOpacity
              style={[styles.nextRaceCardBtn, styles.nextRaceCardBtnFull]}
              onPress={() => router.push('/(auth)/access-code')}
              activeOpacity={0.8}
            >
              <Text style={styles.nextRaceCardBtnText}>Enter competition (access code)</Text>
              <Ionicons name="arrow-forward" size={14} color="#000000" />
            </TouchableOpacity>
          </View>
        )}

        {hasJoinedAny && (
          <>
            {/* Next race card – own card, above competitions */}
            <TouchableOpacity
              style={styles.nextRaceCard}
              onPress={() => router.push('/(app)/selections')}
              activeOpacity={0.8}
            >
              <Text style={styles.nextRaceCardTitle}>Next race</Text>
              {nextRaceOff ? (
                <>
                  <Text style={styles.nextRaceCardRaceName} numberOfLines={1}>{nextRaceOff.raceName}</Text>
                  <Text style={styles.nextRaceCardCourse}>{nextRaceOff.course} · {nextRaceOff.dateStr}</Text>
                  <View style={styles.nextRaceCardRow}>
                    <View style={styles.nextRaceCardMeta}>
                      <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
                      <Text style={styles.nextRaceCardTime}>{nextRaceOff.timeStr}</Text>
                    </View>
                    {nextRaceOff.runnerCount > 0 && (
                      <View style={styles.nextRaceCardMeta}>
                        <Ionicons name="people-outline" size={14} color={theme.colors.textMuted} />
                        <Text style={styles.nextRaceCardRunners}>{nextRaceOff.runnerCount} runners</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.nextRaceCardBtn}>
                    <Text style={styles.nextRaceCardBtnText}>My selections</Text>
                    <Ionicons name="arrow-forward" size={14} color="#000000" />
                  </View>
                </>
              ) : (
                <Text style={styles.nextRaceCardMuted}>—</Text>
              )}
            </TouchableOpacity>

            {/* Your competitions – title and icons outside card */}
            <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>Your competitions</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.compScrollContent}
              style={styles.compScroll}
            >
              {compList.map((c) => {
                const isOverall = c.id === null;
                const isSelected = selectedCompId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id ?? 'overall'}
                    style={[styles.compCircle, isSelected && styles.compCircleSelected]}
                    onPress={() => setSelectedCompId(c.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.compCircleInner, isSelected && styles.compCircleInnerSelected]}>
                      <Ionicons
                        name={isOverall ? 'trophy' : 'flag'}
                        size={22}
                        color={isSelected ? theme.colors.accent : theme.colors.textSecondary}
                      />
                    </View>
                    <Text style={[styles.compCircleLabel, isSelected && styles.compCircleLabelSelected]} numberOfLines={1}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* White card: selected tab info + Your stats (4 boxes, 2x2) */}
            <View style={styles.competitionsCard}>
              <View style={styles.compInfoInnerCard}>
                {selectedCompId === null ? (
                  <Text style={styles.compCardHeaderCentered}>
                    {participations.length} {participations.length === 1 ? 'competition' : 'competitions'}
                  </Text>
                ) : (
                  <>
                    <Text style={styles.compCardMeetingNameCentered} numberOfLines={1}>
                      {summaryByComp?.byComp[selectedCompId]?.name ?? 'Competition'}
                    </Text>
                    <View style={styles.compCardMetaRowCentered}>
                      <Text style={styles.compCardMeta}>
                        {compDaysByCompId[selectedCompId] ?? 1} day event
                      </Text>
                      {compDateRangeByCompId[selectedCompId] && (
                        <Text style={styles.compCardMeta}>
                          {compDateRangeByCompId[selectedCompId].start} – {compDateRangeByCompId[selectedCompId].end}
                        </Text>
                      )}
                    </View>
                  </>
                )}
              </View>

              <Text style={styles.statsTitle}>Your stats</Text>
              {(() => {
                const isOverall = selectedCompId === null;
                const isComplete = selectedCompId != null && compStatusByCompId[selectedCompId] === 'complete';
                const position = selectedCompId != null ? compPositionByCompId[selectedCompId] : null;
                const secondLabel = isOverall ? 'Highest daily' : isComplete ? 'Final position' : 'Daily points';
                const secondValue = isOverall
                  ? (summaryByComp?.overall?.highestDailyPoints ?? 0)
                  : isComplete
                    ? (position != null ? `${position}${position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}` : '—')
                    : (currentSummary?.dailyPoints ?? 0);
                const fourthLabel = isOverall ? 'Competitions' : 'Participants';
                const fourthValue = isOverall
                  ? participations.length
                  : (participantCountByCompId[selectedCompId!] ?? 0);

                const StatBox = ({ label, value }: { label: string; value: React.ReactNode }) => (
                  <View style={[styles.statCard, styles.statCardHalf]}>
                    <Text style={styles.statCardValue}>{value}</Text>
                    <Text style={styles.statCardLabel}>{label}</Text>
                  </View>
                );

                return (
                  <View style={styles.statsGrid}>
                    <View style={styles.statsRow}>
                      <StatBox label="Points" value={currentSummary?.totalPoints ?? 0} />
                      <StatBox label={secondLabel} value={typeof secondValue === 'number' ? secondValue : secondValue} />
                    </View>
                    <View style={styles.statsRow}>
                      <StatBox
                        label="Best odds"
                        value={currentSummary?.highestSpWin != null ? decimalToFractional(currentSummary.highestSpWin) : '—'}
                      />
                      <StatBox label={fourthLabel} value={fourthValue} />
                    </View>
                  </View>
                );
              })()}
            </View>

          </>
        )}
      </ScrollView>
    </View>
  );
}
