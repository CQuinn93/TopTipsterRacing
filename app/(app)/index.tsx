import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Modal,
  Pressable,
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
import { getCompetitionDisplayStatus } from '@/lib/appUtils';
import { decimalToFractional } from '@/lib/oddsFormat';
import { requestPermissionsAndSetup, scheduleSelectionReminders } from '@/lib/selectionReminderNotifications';
import { getNotificationCompetitionIds } from '@/lib/notificationCompetitionPrefs';
import { HomeLeaderboardPanel } from '@/components/HomeLeaderboardPanel';
import { HomeSelectionsAndResults } from '@/components/HomeSelectionsAndResults';
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
  const [compDropdownOpen, setCompDropdownOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { width: windowWidth } = useWindowDimensions();
  const isNarrowWeb = Platform.OS === 'web' && windowWidth < 768;
  const isWideWeb = Platform.OS === 'web' && windowWidth >= 768;

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
    async (forceRefresh = false, isPullRefresh = false) => {
      if (!userId) return;
      if (isPullRefresh) setRefreshing(true);
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
        if (isPullRefresh) setRefreshing(false);
      }
    },
    [userId, selectedCompId]
  );

  const onRefresh = useCallback(() => {
    if (refreshing) return;
    void load(true, true);
  }, [load, refreshing]);

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

  const isWeb = Platform.OS === 'web';

  const styles = useMemo(
    () => {
      const isLight = String(theme.colors.background) === String(lightTheme.colors.background);
      const cardBorder = isLight ? theme.colors.white : theme.colors.border;
      const cardBorderWidth = isLight ? 2 : 1;
      const webCard = isWeb ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 } : {};
      const compact = isNarrowWeb;
      return StyleSheet.create({
        wrapper: { flex: 1, backgroundColor: theme.colors.background, ...(isWeb && { paddingHorizontal: 0 }) },
        container: { flex: 1 },
        webHomeScrollOuter: {
          flex: 1,
          width: '100%',
          alignItems: 'center',
        },
        webHomeScroll: {
          width: '100%',
          maxWidth: 960,
        },
        content: {
          padding: theme.spacing.md,
          ...(isWeb && { padding: 24, paddingBottom: 48 }),
          ...(isWeb && !compact && { paddingHorizontal: 28 }),
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
        headerStrip: {
          marginHorizontal: isWideWeb ? 0 : -theme.spacing.md,
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
        heroCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: isWeb ? 16 : theme.radius.lg,
          padding: isWeb ? 24 : theme.spacing.md,
          marginBottom: theme.spacing.lg,
          borderWidth: 2,
          borderColor: theme.colors.accent,
          overflow: 'hidden',
          ...webCard,
        },
        heroEyebrow: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 10,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.xs,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        },
        heroTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
        },
        heroBody: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
          lineHeight: 21,
          marginBottom: theme.spacing.md,
        },
        heroCta: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.sm,
          alignSelf: 'stretch',
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
        },
        heroCtaText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.black,
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
        competitionsCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: isWeb ? 14 : theme.radius.lg,
          padding: compact ? theme.spacing.sm : (isWeb ? 20 : theme.spacing.sm),
          marginBottom: theme.spacing.sm,
          marginTop: compact ? 0 : theme.spacing.xs,
          borderWidth: cardBorderWidth,
          borderColor: cardBorder,
          overflow: 'hidden',
          ...webCard,
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
          fontSize: compact ? 11 : 12,
          fontWeight: '600',
          color: theme.colors.textMuted,
          marginTop: compact ? 2 : theme.spacing.sm,
          marginBottom: theme.spacing.sm,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        compSection: { marginBottom: theme.spacing.md },
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
        compTabsRow: {
          flexDirection: 'row',
          width: '100%',
          marginBottom: theme.spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        compTab: {
          flex: 1,
          paddingVertical: 11,
          alignItems: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        compTabActive: {
          borderBottomColor: theme.colors.accent,
        },
        compTabText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: compact ? 12 : 13,
          color: theme.colors.textMuted,
        },
        compTabTextActive: {
          color: theme.colors.accent,
        },
        homeCompHint: {
          fontFamily: theme.fontFamily.regular,
          fontSize: compact ? 10 : 11,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.xs,
          lineHeight: compact ? 14 : 15,
        },
        compDropdownTrigger: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          paddingVertical: compact ? theme.spacing.sm : theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          borderWidth: cardBorderWidth,
          borderColor: cardBorder,
          marginBottom: theme.spacing.sm,
          gap: theme.spacing.sm,
          ...webCard,
        },
        compDropdownTextBlock: {
          flex: 1,
          minWidth: 0,
        },
        compDropdownChevron: {
          fontFamily: theme.fontFamily.regular,
          fontSize: compact ? 11 : 12,
          color: theme.colors.textMuted,
          paddingLeft: theme.spacing.xs,
        },
        dropdownOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing.lg,
        },
        dropdownContent: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          padding: theme.spacing.sm,
          width: '100%',
          maxWidth: 360,
          maxHeight: 400,
        },
        dropdownOption: {
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.sm,
        },
        dropdownOptionActive: {
          backgroundColor: theme.colors.accentMuted,
        },
        dropdownOptionText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: compact ? 13 : 15,
          fontWeight: '600',
          color: theme.colors.text,
        },
        dropdownOptionTextActive: {
          color: theme.colors.accent,
        },
        dropdownOptionMeta: {
          fontFamily: theme.fontFamily.regular,
          fontSize: compact ? 11 : 12,
          color: theme.colors.textMuted,
          marginTop: 4,
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
          padding: compact ? theme.spacing.xs : theme.spacing.sm,
          borderWidth: 1,
          borderColor: theme.colors.accentDim ?? theme.colors.accent,
          alignItems: 'center',
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
        muted: {
          fontFamily: theme.fontFamily.regular,
          fontSize: compact ? 11 : 13,
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
    [theme, isWeb, isNarrowWeb, isWideWeb]
  );

  const homeScroll = (
    <ScrollView
        ref={scrollRef}
        style={[styles.container, isWideWeb && styles.webHomeScroll]}
        contentContainerStyle={[styles.content, { paddingBottom: theme.spacing.lg, paddingTop: theme.spacing.sm }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        {/* Header strip */}
        <View style={styles.headerStrip}>
          <View style={styles.headerStripInner}>
            <View>
              <Text style={styles.headerWelcome}>Top Tipster Racing</Text>
              <Text style={styles.headerHello}>Hello {displayName || '…'}</Text>
            </View>
          </View>
        </View>

        {!hasJoinedAny && (
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>Get started</Text>
            <Text style={styles.heroTitle}>Join a competition</Text>
            <Text style={styles.heroBody}>
              Enter an access code to join a private league, then make your daily picks and climb the leaderboard.
            </Text>
            <TouchableOpacity
              style={styles.heroCta}
              onPress={() => router.push('/(app)/competitions?join=1')}
              activeOpacity={0.85}
            >
              <Text style={styles.heroCtaText}>Enter competition</Text>
              <Ionicons name="arrow-forward" size={18} color={theme.colors.black} />
            </TouchableOpacity>
          </View>
        )}

        {hasJoinedAny && (
          <>
            <View style={styles.homePrimaryRow}>
              <TouchableOpacity
                style={styles.homePrimaryBtn}
                onPress={() => router.push('/(app)/selections')}
                activeOpacity={0.85}
              >
                <Ionicons name="list-outline" size={20} color={theme.colors.white} />
                <Text style={styles.homePrimaryBtnText}>My selections</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.homePrimaryBtnSecondary}
                onPress={() => router.push('/(app)/competitions')}
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
              Browse by festival phase. Make picks in My selections when racecards are published.
            </Text>

            {compListFiltered.length === 0 ? (
              <Text style={[styles.muted, { marginBottom: theme.spacing.md }]}>No competitions in this category.</Text>
            ) : null}

            {compListFiltered.length > 0 && effectiveCompId ? (() => {
              const selectedRow = compListFiltered.find((x) => x.id === effectiveCompId) ?? compListFiltered[0];
              const summarySel = summaryByComp?.byComp[effectiveCompId];
              const displayName = summarySel?.name ?? selectedRow.name;
              const multi = compListFiltered.length > 1;
              const metaLine = (compId: string) => {
                const days = compDaysByCompId[compId] ?? 1;
                const range = compDateRangeByCompId[compId];
                return `${days} day event${range ? ` · ${range.start} – ${range.end}` : ''}`;
              };
              const StatBox = ({ label, value }: { label: string; value: React.ReactNode }) => (
                <View style={[styles.statCard, styles.statCardHalf]}>
                  <Text style={styles.statCardValue}>{value}</Text>
                  <Text style={styles.statCardLabel}>{label}</Text>
                </View>
              );
              const renderStatsBody = (c: { id: string; name: string }) => {
                const summary = summaryByComp?.byComp[c.id];
                const isComplete = compStatusByCompId[c.id] === 'complete';
                const position = compPositionByCompId[c.id] ?? null;
                const secondLabel = isComplete ? 'Final position' : 'Daily points';
                const secondValue = isComplete
                  ? (position != null ? `${position}${position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th'}` : '—')
                  : (summary?.dailyPoints ?? 0);
                return (
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
                );
              };
              return (
                <View>
                  <TouchableOpacity
                    style={styles.compDropdownTrigger}
                    onPress={() => multi && setCompDropdownOpen(true)}
                    activeOpacity={multi ? 0.75 : 1}
                    disabled={!multi}
                  >
                    <View style={styles.compDropdownTextBlock}>
                      <Text style={styles.compMeetingNameAbove} numberOfLines={2}>
                        {displayName}
                      </Text>
                      <Text style={styles.compMetaAbove}>{metaLine(effectiveCompId)}</Text>
                    </View>
                    {multi ? <Text style={styles.compDropdownChevron}>▼</Text> : null}
                  </TouchableOpacity>

                  {multi ? (
                    <Modal
                      visible={compDropdownOpen}
                      transparent
                      animationType="fade"
                      onRequestClose={() => setCompDropdownOpen(false)}
                    >
                      <Pressable style={styles.dropdownOverlay} onPress={() => setCompDropdownOpen(false)}>
                        <Pressable style={styles.dropdownContent} onPress={(e) => e.stopPropagation()}>
                          {compListFiltered.map((opt) => {
                            const s = summaryByComp?.byComp[opt.id];
                            const label = s?.name ?? opt.name;
                            return (
                              <TouchableOpacity
                                key={opt.id}
                                style={[styles.dropdownOption, opt.id === effectiveCompId && styles.dropdownOptionActive]}
                                onPress={() => {
                                  setSelectedCompId(opt.id);
                                  setCompDropdownOpen(false);
                                }}
                              >
                                <Text
                                  style={[styles.dropdownOptionText, opt.id === effectiveCompId && styles.dropdownOptionTextActive]}
                                  numberOfLines={2}
                                >
                                  {label}
                                </Text>
                                <Text style={styles.dropdownOptionMeta}>{metaLine(opt.id)}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </Pressable>
                      </Pressable>
                    </Modal>
                  ) : null}

                  {renderStatsBody(selectedRow)}
                </View>
              );
            })() : null}

            {/* Quick links: hidden on web (leaderboard is in sidebar; selections+results below) */}
            {(!isWeb || isNarrowWeb) && (
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
            )}

            {/* Web: selections by day + results with points breakdown */}
            {isWeb && hasJoinedAny && effectiveCompId && (
              <HomeSelectionsAndResults competitionId={effectiveCompId} />
            )}

          </>
        )}
    </ScrollView>
  );

  const mainContent = isWideWeb ? <View style={styles.webHomeScrollOuter}>{homeScroll}</View> : homeScroll;

  if (Platform.OS === 'web' && hasJoinedAny && effectiveCompId && !isNarrowWeb) {
    const compName = summaryByComp?.byComp[effectiveCompId]?.name ?? compListFiltered.find((c) => c.id === effectiveCompId)?.name ?? 'Competition';
    return (
      <View style={[styles.wrapper, { flexDirection: 'row', gap: 24, paddingRight: 24, alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>{mainContent}</View>
        <HomeLeaderboardPanel competitionId={effectiveCompId} competitionName={compName} />
      </View>
    );
  }

  return <View style={styles.wrapper}>{mainContent}</View>;
}
