import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
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
import type { ParticipationRow } from '@/lib/availableRacesCache';
import type { AvailableRaceDay } from '@/lib/availableRacesForUser';
import { isSelectionClosed, getCompetitionDisplayStatus } from '@/lib/appUtils';
import { decimalToFractional } from '@/lib/oddsFormat';
import { requestPermissionsAndSetup, scheduleSelectionReminders } from '@/lib/selectionReminderNotifications';
import { getNotificationCompetitionIds } from '@/lib/notificationCompetitionPrefs';

export default function HomeScreen() {
  const theme = useTheme();
  const { userId, session } = useAuth();
  const [displayName, setDisplayName] = useState<string>('');
  const [participations, setParticipations] = useState<ParticipationRow[]>([]);
  const [availableRaces, setAvailableRaces] = useState<AvailableRaceDay[]>([]);
  const [summaryByComp, setSummaryByComp] = useState<HomeSummaryByComp | null>(null);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [compStatusByCompId, setCompStatusByCompId] = useState<Record<string, 'upcoming' | 'live' | 'complete'>>({});
  const [compPositionByCompId, setCompPositionByCompId] = useState<Record<string, number | null>>({});
  const [participantCountByCompId, setParticipantCountByCompId] = useState<Record<string, number>>({});
  const [compDaysByCompId, setCompDaysByCompId] = useState<Record<string, number>>({});
  const [compDateRangeByCompId, setCompDateRangeByCompId] = useState<Record<string, { start: string; end: string }>>({});
  const [compTab, setCompTab] = useState<'upcoming' | 'live' | 'complete'>('live');
  const scrollRef = useRef<ScrollView>(null);
  const compScrollRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();

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
          requestPermissionsAndSetup().then((granted: boolean) => {
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
            setSelectedCompId(p[0]?.competition_id ?? null);
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
    ? participations.map((p) => ({ id: p.competition_id, name: summaryByComp.byComp[p.competition_id]?.name ?? p.competition_id }))
    : [];
  const compListFiltered = compList.filter((c) => compStatusByCompId[c.id] === compTab);
  const effectiveCompId =
    selectedCompId && compListFiltered.some((c) => c.id === selectedCompId)
      ? selectedCompId
      : compListFiltered[0]?.id ?? null;

  const currentSummary = summaryByComp && effectiveCompId ? summaryByComp.byComp[effectiveCompId] : null;

  const scrollToCompIndex = useCallback((index: number) => {
    if (compScrollRef.current && index >= 0) {
      compScrollRef.current.scrollTo({ x: index * windowWidth, animated: true });
    }
  }, [windowWidth]);

  const compListFilteredIds = compListFiltered.map((c) => c.id).join(',');
  useEffect(() => {
    if (compListFiltered.length === 0) {
      setSelectedCompId(null);
      return;
    }
    if (!compListFiltered.some((c) => c.id === selectedCompId)) {
      setSelectedCompId(compListFiltered[0]?.id ?? null);
    }
  }, [compTab, compListFilteredIds]);

  useEffect(() => {
    if (compListFiltered.length === 0) return;
    const index = compListFiltered.findIndex((c) => c.id === effectiveCompId);
    if (index <= 0) return;
    const t = setTimeout(() => {
      if (compScrollRef.current) {
        compScrollRef.current.scrollTo({ x: index * windowWidth, animated: false });
      }
    }, 100);
    return () => clearTimeout(t);
  }, [effectiveCompId, compListFiltered.length, windowWidth]);

  // Next race: show chronologically next race day (from DB) – open or closed. Data is from Supabase, cached in AsyncStorage.
  const nextRaceOff = (() => {
    if (availableRaces.length === 0) return null;
    const sorted = [...availableRaces].sort((a, b) => new Date(a.firstRaceUtc).getTime() - new Date(b.firstRaceUtc).getTime());
    const now = Date.now();
    const RACE_FINISHED_BUFFER_MS = 20 * 60 * 1000; // 20 min after first race we treat as "races finished"
    const next = sorted.find((d) => new Date(d.firstRaceUtc).getTime() > now) ?? sorted[sorted.length - 1];
    const dateStr = new Date(next.raceDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const timeStr = new Date(next.firstRaceUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const closed = isSelectionClosed(next.firstRaceUtc);
    const raceTimePassed = new Date(next.firstRaceUtc).getTime() + RACE_FINISHED_BUFFER_MS < now;
    return {
      label: 'Next race off',
      course: next.course,
      dateStr,
      timeStr,
      raceName: next.firstRaceName ?? 'Race',
      runnerCount: next.firstRaceRunnerCount ?? 0,
      isClosed: closed,
      raceTimePassed,
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
          fontSize: 15,
          fontWeight: '700',
          color: theme.colors.text,
          marginTop: theme.spacing.lg,
          marginBottom: theme.spacing.sm,
        },
        sectionTitleFirst: {
          marginTop: 0,
          marginBottom: theme.spacing.sm,
        },
        headerStrip: {
          marginHorizontal: -theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.lg,
          paddingTop: theme.spacing.lg + 4,
          marginBottom: theme.spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        },
        headerStripInner: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        headerWelcome: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        headerHello: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 22,
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
          padding: theme.spacing.md,
          marginBottom: theme.spacing.md,
          borderWidth: 2,
          borderColor: theme.colors.accent,
          overflow: 'hidden',
        },
        nextRaceCardTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 10,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.xs,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        },
        nextRaceCardTouchable: {},
        nextRaceCardContentRow: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        nextRaceCardContent: {
          flex: 1,
          minWidth: 0,
        },
        nextRaceCardArrow: {
          marginLeft: theme.spacing.sm,
        },
        nextRaceCardHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginBottom: 2,
        },
        nextRaceCardRaceName: {
          flex: 1,
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '700',
          color: theme.colors.text,
        },
        nextRaceCardClosedBadge: {
          backgroundColor: theme.colors.textMuted + '20',
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 2,
          borderRadius: theme.radius.sm,
        },
        nextRaceCardClosedBadgeText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        nextRaceCardCourse: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.xs,
        },
        nextRaceCardRow: {
          flexDirection: 'row',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.sm,
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
          justifyContent: 'flex-end',
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
        },
        nextRaceCardBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: theme.colors.accent,
        },
        nextRaceCardBtnCompact: {
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          backgroundColor: theme.colors.accent,
        },
        nextRaceCardBtnTextWhite: {
          color: theme.colors.white,
        },
        nextRaceCardMuted: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textMuted,
          fontStyle: 'italic',
        },
        lockedNoteText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          color: theme.colors.text,
          textAlign: 'center',
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
          padding: theme.spacing.sm,
          marginBottom: theme.spacing.sm,
          marginTop: theme.spacing.xs,
          borderWidth: cardBorderWidth,
          borderColor: cardBorder,
          overflow: 'hidden',
        },
        compInfoInnerCard: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.xs,
          marginBottom: theme.spacing.sm,
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
          fontSize: 16,
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
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
          textAlign: 'center',
          marginBottom: 0,
        },
        compCardMetaRow: {
          flexDirection: 'row',
          gap: theme.spacing.lg,
          marginBottom: theme.spacing.md,
        },
        compCardMetaRowCentered: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
        },
        compCardMeta: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        compStatusPill: {
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 2,
          borderRadius: theme.radius.sm,
        },
        compStatusPillLive: { backgroundColor: theme.colors.accentMuted },
        compStatusPillUpcoming: { backgroundColor: 'rgba(249, 115, 22, 0.2)' },
        compStatusPillComplete: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
        compStatusPillText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 10,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.3,
        },
        compStatusPillTextLive: { color: theme.colors.accent },
        compStatusPillTextUpcoming: { color: '#ea580c' },
        compStatusPillTextComplete: { color: theme.colors.error },
        statsTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.textMuted,
          marginTop: theme.spacing.sm,
          marginBottom: theme.spacing.sm,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        compSection: { marginBottom: theme.spacing.md },
        compSlide: {
          paddingHorizontal: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
        },
        compMeetingNameAbove: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: 2,
        },
        compMetaAbove: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
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
          paddingVertical: theme.spacing.sm,
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
          fontSize: 13,
          color: theme.colors.textSecondary,
        },
        compTabTextActive: {
          color: theme.colors.white,
          fontWeight: '600',
        },
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
          gap: theme.spacing.xs,
        },
        statsRow: {
          flexDirection: 'row',
          gap: theme.spacing.xs,
        },
        statCardHalf: {
          flex: 1,
        },
        statCard: {
          backgroundColor: theme.colors.accentMuted ?? 'rgba(21, 128, 61, 0.15)',
          borderRadius: theme.radius.md,
          padding: theme.spacing.sm,
          borderWidth: 1,
          borderColor: theme.colors.accentDim ?? theme.colors.accent,
          alignItems: 'center',
        },
        statCardLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          color: theme.colors.textSecondary,
          marginTop: 4,
          textAlign: 'center',
        },
        statCardValue: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '700',
          color: theme.colors.accent,
        },
        statCardFull: {
          width: '100%',
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
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        quickLinkBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: theme.colors.accent,
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
            <View style={styles.nextRaceCard}>
              {nextRaceOff && !nextRaceOff.raceTimePassed ? (
                nextRaceOff.isClosed ? (
                  <>
                    <Text style={styles.nextRaceCardTitle}>Next race</Text>
                    <Text style={styles.lockedNoteText}>All selections have been made and are locked in. Good luck!</Text>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.nextRaceCardTouchable}
                    onPress={() => router.push('/(app)/selections')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.nextRaceCardTitle}>Next race</Text>
                    <View style={styles.nextRaceCardContentRow}>
                      <View style={styles.nextRaceCardContent}>
                        <View style={styles.nextRaceCardHeaderRow}>
                          <Text style={styles.nextRaceCardRaceName} numberOfLines={1}>{nextRaceOff.raceName}</Text>
                        </View>
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
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={theme.colors.accent} style={styles.nextRaceCardArrow} />
                    </View>
                  </TouchableOpacity>
                )
              ) : (
                <>
                  <Text style={styles.nextRaceCardTitle}>Next race</Text>
                  <Text style={styles.nextRaceCardEmptyMessage}>
                    All of today's races have finished. Don't forget to check the leaderboard to see how you got on.
                  </Text>
                  <TouchableOpacity
                    style={[styles.nextRaceCardBtn, styles.nextRaceCardBtnCompact]}
                    onPress={() => router.push('/(app)/competitions')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.nextRaceCardBtnTextWhite}>My Competitions</Text>
                    <Ionicons name="arrow-forward" size={14} color="#ffffff" />
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Your competitions – title and tabs */}
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.compScrollContent}
              style={styles.compScroll}
            >
              {compListFiltered.map((c) => {
                const isSelected = effectiveCompId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.compCircle, isSelected && styles.compCircleSelected]}
                    onPress={() => {
                      const index = compListFiltered.findIndex((x) => x.id === c.id);
                      setSelectedCompId(c.id);
                      scrollToCompIndex(index);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.compCircleInner, isSelected && styles.compCircleInnerSelected]}>
                      <Ionicons
                        name="medal-outline"
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

            {/* Horizontal snap scroll: one slide per competition (meeting name + meta above, stats-only card) */}
            {compListFiltered.length > 0 && (
              <ScrollView
                ref={compScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                  const x = e.nativeEvent.contentOffset.x;
                  const slideWidth = windowWidth;
                  const index = Math.round(x / slideWidth);
                  const comp = compListFiltered[index];
                  if (comp) setSelectedCompId(comp.id);
                }}
                contentContainerStyle={{ flexDirection: 'row' }}
                style={{ marginHorizontal: -theme.spacing.md, marginBottom: theme.spacing.sm }}
              >
                {compListFiltered.map((c) => {
                  const summary = summaryByComp?.byComp[c.id];
                  const isComplete = compStatusByCompId[c.id] === 'complete';
                  const position = compPositionByCompId[c.id] ?? null;
                  const secondLabel = isComplete ? 'Final position' : 'Daily points';
                  const secondValue = isComplete
                    ? (position != null ? `${position}${position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}` : '—')
                    : (summary?.dailyPoints ?? 0);
                  const StatBox = ({ label, value }: { label: string; value: React.ReactNode }) => (
                    <View style={[styles.statCard, styles.statCardHalf]}>
                      <Text style={styles.statCardValue}>{value}</Text>
                      <Text style={styles.statCardLabel}>{label}</Text>
                    </View>
                  );
                  return (
                    <View key={c.id} style={[styles.compSlide, { width: windowWidth }]}>
                      <Text style={styles.compMeetingNameAbove} numberOfLines={1}>
                        {summary?.name ?? c.name}
                      </Text>
                      <Text style={styles.compMetaAbove}>
                        {compDaysByCompId[c.id] ?? 1} day event
                        {compDateRangeByCompId[c.id]
                          ? ` · ${compDateRangeByCompId[c.id].start} – ${compDateRangeByCompId[c.id].end}`
                          : ''}
                      </Text>
                      <View style={styles.competitionsCard}>
                        <Text style={styles.statsTitle}>Your stats</Text>
                        <View style={styles.statsGrid}>
                          <View style={styles.statsRow}>
                            <StatBox label="Points" value={summary?.totalPoints ?? 0} />
                            <StatBox label={secondLabel} value={typeof secondValue === 'number' ? secondValue : secondValue} />
                          </View>
                          <View style={styles.statsRow}>
                            <StatBox
                              label="Top pick"
                              value={summary?.highestSpWin != null ? decimalToFractional(summary.highestSpWin) : '—'}
                            />
                            <StatBox label="Participants" value={participantCountByCompId[c.id] ?? 0} />
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            {/* Quick links */}
            <View style={styles.quickLinksRow}>
              <TouchableOpacity
                style={styles.quickLinkBtn}
                onPress={() => router.push({ pathname: '/(app)/leaderboard', params: effectiveCompId ? { competitionId: effectiveCompId } : {} })}
                activeOpacity={0.8}
              >
                <Ionicons name="podium-outline" size={18} color={theme.colors.accent} />
                <Text style={styles.quickLinkBtnText}>Leaderboard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.quickLinkBtn}
                onPress={() => router.push('/(app)/results')}
                activeOpacity={0.8}
              >
                <Ionicons name="trophy-outline" size={18} color={theme.colors.accent} />
                <Text style={styles.quickLinkBtnText}>Results</Text>
              </TouchableOpacity>
            </View>

          </>
        )}
      </ScrollView>
    </View>
  );
}
