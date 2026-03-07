import { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';
import {
  computeMySelectionsFromBulk,
  computeOtherUsersSelectionsFromBulk,
  type MySelectionItem,
  type OtherUserSelection,
} from '@/lib/mySelectionsView';
import { getSelectionsBulk, type SelectionsBulkData } from '@/lib/selectionsBulkCache';
import { useTheme } from '@/contexts/ThemeContext';
import { displayHorseName } from '@/lib/displayHorseName';
import type { Race } from '@/types/races';
import { formatDayDate, isSelectionClosed, isCompletedMoreThanOneDay, formatTimeUntilDeadline, getCompetitionDisplayStatus } from '@/lib/appUtils';
import { getAvailableRacesForUser } from '@/lib/availableRacesCache';
import type { AvailableRaceDay } from '@/lib/availableRacesForUser';

type RaceDay = {
  id: string;
  race_date: string;
  first_race_utc: string;
  races: Race[];
};

export default function SelectionsScreen() {
  const theme = useTheme();
  const { userId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ competitionId?: string; raceDate?: string }>();
  const competitionId = params.competitionId as string | undefined;
  const initialRaceDate = params.raceDate as string | undefined;

  const [raceDays, setRaceDays] = useState<RaceDay[]>([]);
  const [selections, setSelections] = useState<Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userCompetitions, setUserCompetitions] = useState<{ id: string; name: string }[]>([]);
  const [mySelectionsList, setMySelectionsList] = useState<MySelectionItem[]>([]);
  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);
  const [competitionDropdownOpen, setCompetitionDropdownOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [selectedCompetitionIdInList, setSelectedCompetitionIdInList] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [expandedDrawer, setExpandedDrawer] = useState<{
    cardKey: string;
    raceTimeUtc: string;
    others: OtherUserSelection[];
  } | null>(null);
  const [selectionsBulk, setSelectionsBulk] = useState<SelectionsBulkData | null>(null);
  const [refreshingMySelections, setRefreshingMySelections] = useState(false);
  const [availableRaces, setAvailableRaces] = useState<AvailableRaceDay[]>([]);
  const [lockingId, setLockingId] = useState<string | null>(null);
  const [pickingDayIndex, setPickingDayIndex] = useState(0);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  const [userLockedInForPickingDay, setUserLockedInForPickingDay] = useState(false);
  const [compTab, setCompTab] = useState<'upcoming' | 'live' | 'complete'>('live');
  const [compStatusByCompId, setCompStatusByCompId] = useState<Record<string, 'upcoming' | 'live' | 'complete'>>({});
  const cameFromRaceDayRef = useRef(false);

  useEffect(() => {
    if (competitionId) cameFromRaceDayRef.current = true;
  }, [competitionId]);

  const refreshMySelections = async () => {
    if (!userId || competitionId) return;
    setRefreshingMySelections(true);
    const { data: parts } = await supabase
      .from('competition_participants')
      .select('competition_id')
      .eq('user_id', userId);
    const allCompIds = (parts ?? []).map((p: { competition_id: string }) => p.competition_id);
    const { data: comps } = await supabase
      .from('competitions')
      .select('id, name, festival_end_date')
      .in('id', allCompIds);
    const ongoing = (comps ?? []).filter(
      (c: { id: string; name: string; festival_end_date: string }) => !isCompletedMoreThanOneDay(c.festival_end_date)
    );
    const compIds = ongoing.map((c: { id: string }) => c.id);
    const compNames = new Map(ongoing.map((c: { id: string; name: string }) => [c.id, c.name]));
    const [bulk, { availableRaces: races }] = await Promise.all([
      getSelectionsBulk(supabase, userId, compIds, true),
      getAvailableRacesForUser(supabase, userId, true),
    ]);
    setSelectionsBulk(bulk);
    setMySelectionsList(computeMySelectionsFromBulk(bulk, userId, compNames));
    setAvailableRaces(races);
    setRefreshingMySelections(false);
  };

  const handleLockIn = async (item: AvailableRaceDay) => {
    if (!userId || item.isLocked || !item.hasAllPicks) return;
    setLockingId(`${item.competitionId}-${item.raceDate}`);
    try {
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
      await refreshMySelections();
    } finally {
      setLockingId(null);
    }
  };

  // When no competitionId: load only ongoing competitions and bulk in one go.
  useEffect(() => {
    if (!userId || competitionId) return;
    const forceRefresh = cameFromRaceDayRef.current;
    cameFromRaceDayRef.current = false;
    (async () => {
      setLoading(true);
      const { data: parts } = await supabase
        .from('competition_participants')
        .select('competition_id')
        .eq('user_id', userId);
      if (!parts?.length) {
        setUserCompetitions([]);
        setSelectionsBulk(null);
        setMySelectionsList([]);
        setAvailableRaces([]);
        setLoading(false);
        return;
      }
      const allCompIds = (parts as { competition_id: string }[]).map((p) => p.competition_id);
      const { data: comps } = await supabase
        .from('competitions')
        .select('id, name, festival_start_date, festival_end_date')
        .in('id', allCompIds);
      const compList = (comps ?? []) as { id: string; name: string; festival_start_date: string; festival_end_date: string }[];
      const statusByComp: Record<string, 'upcoming' | 'live' | 'complete'> = {};
      for (const c of compList) {
        const status = getCompetitionDisplayStatus(c.festival_start_date, c.festival_end_date);
        if (status) statusByComp[c.id] = status;
      }
      setCompStatusByCompId(statusByComp);
      setUserCompetitions(compList.map((c) => ({ id: c.id, name: c.name })));
      const compNames = new Map(compList.map((c) => [c.id, c.name]));
      const compIds = allCompIds;
      const [bulk, { availableRaces: races }] = await Promise.all([
        getSelectionsBulk(supabase, userId, compIds, forceRefresh),
        getAvailableRacesForUser(supabase, userId, forceRefresh),
      ]);
      setSelectionsBulk(bulk);
      setMySelectionsList(computeMySelectionsFromBulk(bulk, userId, compNames));
      setAvailableRaces(races);
      setLoading(false);
    })();
  }, [userId, competitionId]);

  useEffect(() => {
    if (!competitionId) {
      setRaceDays([]);
      return;
    }
    (async () => {
      setLoading(true);
      const data = await fetchRaceDaysForCompetition(supabase, competitionId, 'id, race_date, first_race_utc, races');
      if (data.length) setRaceDays(data as RaceDay[]);
      if (data?.length) {
        const days = data as RaceDay[];
        const idx = initialRaceDate && days.some((d) => d.race_date === initialRaceDate)
          ? days.findIndex((d) => d.race_date === initialRaceDate)
          : 0;
        setPickingDayIndex(Math.max(0, idx));
      }
      setLoading(false);
    })();
  }, [competitionId, initialRaceDate]);

  const currentRaceDay = raceDays[pickingDayIndex] ?? raceDays[0];
  const selectedDate = currentRaceDay?.race_date ?? null;
  const currentRaces = currentRaceDay?.races ?? [];
  const selectedRace = currentRaces[selectedRaceIndex] ?? currentRaces[0];
  const selectionsClosed = currentRaceDay ? isSelectionClosed(currentRaceDay.first_race_utc) : false;

  useEffect(() => {
    if (!userId || !competitionId || !selectedDate) return;
    (async () => {
      const { data } = await supabase
        .from('daily_selections')
        .select('selections, locked_at')
        .eq('competition_id', competitionId)
        .eq('user_id', userId)
        .eq('race_date', selectedDate)
        .maybeSingle();
      setUserLockedInForPickingDay(!!(data?.locked_at));
      if (data?.selections && typeof data.selections === 'object') {
        const sel: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }> = {};
        for (const [k, v] of Object.entries(data.selections as Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>)) {
          sel[k] = v;
        }
        setSelections(sel);
      } else {
        setSelections({});
      }
    })();
  }, [userId, competitionId, selectedDate]);

  useEffect(() => {
    setSelectedRaceIndex(0);
  }, [currentRaces.length, pickingDayIndex]);

  const setSelection = (raceId: string, runnerId: string, runnerName: string, oddsDecimal: number) => {
    setSelections((prev) => ({ ...prev, [raceId]: { runnerId, runnerName, oddsDecimal } }));
  };

  const saveSelections = async () => {
    if (!userId || !competitionId || !selectedDate) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('daily_selections').upsert(
        {
          competition_id: competitionId,
          user_id: userId,
          race_date: selectedDate,
          selections: selections as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'competition_id,user_id,race_date' }
      );
      if (error) throw error;
      Alert.alert('Saved', 'Your selections have been saved.', [
        { text: 'OK', onPress: () => router.replace('/(app)/selections') },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      const isLocked = /locked|1 hour|first race/i.test(msg);
      Alert.alert(isLocked ? 'Selections locked' : 'Error', isLocked ? 'Selections are locked – less than 1 hour until the first race.' : msg);
    } finally {
      setSaving(false);
    }
  };

  /** User may view others' selections only after locking in or once the entry deadline has passed. */
  const canViewOthersForItem = (item: MySelectionItem, bulk: SelectionsBulkData | null): boolean => {
    if (!userId || !bulk) return false;
    const days = bulk.raceDaysByComp[item.competitionId] ?? [];
    const day = days.find((d) => d.race_date === item.raceDate);
    const deadlinePassed = day?.first_race_utc ? isSelectionClosed(day.first_race_utc) : false;
    const userRow = bulk.selections.find(
      (s) => s.competition_id === item.competitionId && s.race_date === item.raceDate && s.user_id === userId
    );
    const userLocked = userRow != null && userRow.locked_at != null;
    return deadlinePassed || userLocked;
  };

  const handleCardPress = (item: MySelectionItem, cardKey: string) => {
    if (!userId || !selectionsBulk) return;
    if (!canViewOthersForItem(item, selectionsBulk)) {
      Alert.alert(
        "Can't view others yet",
        "Lock in your picks for this day, or wait until the entry deadline has passed (1 hour before the first race), to view other users' selections."
      );
      return;
    }
    if (expandedDrawer?.cardKey === cardKey) {
      setExpandedDrawer(null);
      return;
    }
    const others = computeOtherUsersSelectionsFromBulk(
      selectionsBulk,
      item.competitionId,
      item.raceDate,
      item.raceId,
      userId
    );
    setExpandedDrawer({
      cardKey,
      raceTimeUtc: item.raceTimeUtc,
      others,
    });
  };

  const filteredList = mySelectionsList.filter(
    (item) => compStatusByCompId[item.competitionId] === compTab
  );

  const dayNumbersByCompDate = new Map<string, number>();
  if (selectionsBulk) {
    for (const compId of Object.keys(selectionsBulk.raceDaysByComp)) {
      const days = [...(selectionsBulk.raceDaysByComp[compId] ?? [])].sort((a, b) =>
        a.race_date.localeCompare(b.race_date)
      );
      days.forEach((d, i) => dayNumbersByCompDate.set(`${compId}:${d.race_date}`, i + 1));
    }
  }

  const groupedByDay = filteredList.reduce(
    (acc, item) => {
      const key = `${item.competitionId}:${item.raceDate}`;
      if (!acc[key]) {
        acc[key] = {
          competitionId: item.competitionId,
          competitionName: item.competitionName,
          meeting: item.meeting,
          raceDate: item.raceDate,
          dayNumber: dayNumbersByCompDate.get(key) ?? 1,
          items: [],
        };
      }
      const existing = acc[key].items.find((i) => i.raceId === item.raceId);
      if (!existing) acc[key].items.push(item);
      return acc;
    },
    {} as Record<
      string,
      {
        competitionId: string;
        competitionName: string;
        meeting: string;
        raceDate: string;
        dayNumber: number;
        items: MySelectionItem[];
      }
    >
  );
  const dayGroups = Object.values(groupedByDay).sort((a, b) => {
    const nameCmp = a.competitionName.localeCompare(b.competitionName);
    if (nameCmp !== 0) return nameCmp;
    return a.raceDate.localeCompare(b.raceDate);
  });

  const uniqueCourses = [...new Set(dayGroups.map((g) => g.meeting))];
  const effectiveCourse = selectedCourse && uniqueCourses.includes(selectedCourse) ? selectedCourse : uniqueCourses[0] ?? null;
  const courseDayGroups = dayGroups.filter((g) => g.meeting === effectiveCourse);
  const uniqueCompIdsInCourse = [...new Set(courseDayGroups.map((g) => g.competitionId))];
  const effectiveCompId =
    selectedCompetitionIdInList && uniqueCompIdsInCourse.includes(selectedCompetitionIdInList)
      ? selectedCompetitionIdInList
      : uniqueCompIdsInCourse.length === 1
        ? uniqueCompIdsInCourse[0]
        : uniqueCompIdsInCourse[0] ?? null;
  const competitionDayGroups = courseDayGroups.filter((g) => g.competitionId === effectiveCompId);
  const currentGroup = competitionDayGroups[selectedDayIndex] ?? competitionDayGroups[0];

  useEffect(() => {
    setSelectedDayIndex(0);
    if (effectiveCourse && courseDayGroups.length > 0) {
      const compIds = [...new Set(courseDayGroups.map((g) => g.competitionId))];
      setSelectedCompetitionIdInList((prev) => (prev && compIds.includes(prev) ? prev : compIds[0] ?? null));
    }
  }, [effectiveCourse, courseDayGroups.length]);

  useEffect(() => {
    setSelectedDayIndex(0);
  }, [effectiveCompId, competitionDayGroups.length]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
        centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background, padding: theme.spacing.lg },
        text: { fontFamily: theme.fontFamily.regular, fontSize: 16, color: theme.colors.textSecondary, textAlign: 'center' },
        linkButton: {
          marginTop: theme.spacing.xl,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
        },
        linkButtonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.accent,
          textDecorationLine: 'underline',
        },
        sectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          color: theme.colors.textSecondary,
        },
        pickingHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: theme.spacing.sm,
          gap: theme.spacing.md,
        },
        backToSelectionsButton: {
          marginBottom: theme.spacing.sm,
          alignSelf: 'flex-start',
        },
        backToSelectionsButtonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.accent,
          fontWeight: '500',
        },
        saveButtonInline: {
          backgroundColor: theme.colors.accent,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
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
          fontSize: 17,
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
        },
        emptyStateText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textMuted,
          textAlign: 'center',
          marginBottom: theme.spacing.md,
        },
        emptyStateButton: {
          backgroundColor: theme.colors.accent,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
        },
        emptyStateButtonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.black,
          fontWeight: '600',
        },
        lockedNoteBlock: {
          marginTop: theme.spacing.md,
          marginBottom: theme.spacing.lg,
          paddingVertical: theme.spacing.lg,
          paddingHorizontal: theme.spacing.md,
          backgroundColor: theme.colors.backgroundSecondary,
          borderRadius: theme.radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        lockedNoteText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          color: theme.colors.text,
          textAlign: 'center',
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
        makePicksSection: {
          marginBottom: theme.spacing.lg,
        },
        makePicksSectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: 4,
        },
        makePicksSectionSubtitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.sm,
        },
        raceCardsList: { gap: theme.spacing.sm },
        raceCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          borderWidth: 1,
        },
        raceCardOpen: {
          borderColor: theme.colors.border,
        },
        raceCardClosed: {
          borderColor: 'rgba(185, 28, 28, 0.6)',
          opacity: 0.9,
        },
        raceCardHasPicks: {
          borderColor: theme.colors.accent,
          borderWidth: 2,
        },
        raceCardRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        },
        raceCardLeft: { flex: 1, minWidth: 0 },
        raceCardRight: { alignItems: 'flex-end', marginLeft: theme.spacing.sm },
        raceCardTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.text,
        },
        raceCardMeta: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          color: theme.colors.textMuted,
          marginTop: 2,
        },
        raceCardStatus: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          color: theme.colors.accent,
          marginTop: 2,
        },
        raceCardStatusClosed: {
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
        sectionTitleWithTopMargin: {
          marginTop: theme.spacing.lg,
          marginBottom: theme.spacing.md,
        },
        courseDropdown: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.sm,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          marginBottom: theme.spacing.md,
        },
        courseDropdownText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.text,
        },
        courseDropdownChevron: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
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
          padding: theme.spacing.md,
          width: '100%',
          maxWidth: 320,
          maxHeight: 320,
        },
        dropdownOption: {
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.sm,
        },
        dropdownOptionActive: {
          backgroundColor: theme.colors.accentMuted,
        },
        dropdownOptionText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.text,
        },
        dropdownOptionTextActive: {
          color: theme.colors.accent,
          fontWeight: '600',
        },
        dayTabsRow: {
          flexDirection: 'row',
          width: '100%',
          marginBottom: theme.spacing.md,
        },
        dayTab: {
          flex: 1,
          paddingVertical: theme.spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        dayTabActive: {
          borderBottomColor: theme.colors.accent,
        },
        dayTabText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
        },
        dayTabTextActive: {
          color: theme.colors.accent,
          fontWeight: '600',
        },
        meetingSection: {
          marginBottom: theme.spacing.lg,
        },
        meetingSectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.sm,
        },
        raceCardsContainer: { gap: theme.spacing.xs },
        raceCardWithDrawer: { marginBottom: theme.spacing.xs },
        mySelectionCard: {
          position: 'relative',
          flexDirection: 'row',
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          overflow: 'hidden',
        },
        mySelectionCardExpanded: {
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          borderBottomColor: 'transparent',
        },
        drawerChevron: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 10,
          color: theme.colors.textMuted,
          marginLeft: theme.spacing.xs,
        },
        mySelectionCardFade: {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 12,
          borderTopLeftRadius: theme.radius.md - 1,
          borderBottomLeftRadius: theme.radius.md - 1,
        },
        mySelectionCardRow: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
        },
        mySelectionCardTime: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          color: theme.colors.textMuted,
          width: 36,
        },
        mySelectionCardCenter: {
          flex: 1,
          minWidth: 0,
        },
        mySelectionCardPick: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: theme.colors.text,
        },
        mySelectionCardJockey: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          color: theme.colors.textMuted,
          marginTop: 2,
        },
        mySelectionCardPending: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        wplBadge: {
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 2,
          borderRadius: theme.radius.sm,
        },
        wplWon: { backgroundColor: 'rgba(34, 197, 94, 0.2)' },
        wplPlace: { backgroundColor: 'rgba(234, 179, 8, 0.2)' },
        wplLost: { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
        wplBadgeText: { fontFamily: theme.fontFamily.regular, fontSize: 11 },
        wplWonText: { color: '#166534', fontWeight: '600' },
        wplPlaceText: { color: '#a16207' },
        wplLostText: { color: '#991b1b' },
        modalBackdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing.lg,
        },
        modalBox: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          padding: theme.spacing.lg,
          width: '100%',
          maxWidth: 340,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        modalTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: theme.spacing.xs,
        },
        modalSubtitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.md,
        },
        modalSectionLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.sm,
        },
        othersCardsContainer: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        },
        othersCard: {
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.sm,
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        othersCardHighlight: { backgroundColor: theme.colors.accentMuted },
        othersCardRow: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minWidth: 0,
        },
        othersCardName: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.text },
        othersCardNameBold: { fontWeight: '600' },
        othersCardPick: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textSecondary,
          marginLeft: theme.spacing.sm,
          flex: 1,
          textAlign: 'right',
          minWidth: 0,
        },
        othersDrawer: {
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderLeftColor: theme.colors.border,
          borderRightColor: theme.colors.border,
          borderBottomColor: theme.colors.border,
          borderTopColor: 'transparent',
          borderBottomLeftRadius: theme.radius.md,
          borderBottomRightRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.md,
        },
        othersDrawerLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.xs,
        },
        modalClose: {
          marginTop: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          alignItems: 'center',
        },
        modalCloseText: { fontFamily: theme.fontFamily.regular, fontSize: 16, color: theme.colors.accent },
        pickingDayTabsRow: {
          flexDirection: 'row',
          width: '100%',
          marginBottom: theme.spacing.md,
        },
        pickingDayTab: {
          flex: 1,
          paddingVertical: theme.spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        pickingDayTabActive: {
          borderBottomColor: theme.colors.accent,
        },
        pickingDayTabText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
        },
        pickingDayTabTextActive: {
          color: theme.colors.accent,
          fontWeight: '600',
        },
        pickingRaceCountRow: {
          marginBottom: theme.spacing.xs,
        },
        pickingRaceCountText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
        },
        pickingRaceTabsRow: {
          flexDirection: 'row',
          width: '100%',
          marginBottom: theme.spacing.md,
        },
        pickingRaceTab: {
          flex: 1,
          paddingVertical: theme.spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        pickingRaceTabActive: {
          borderBottomColor: theme.colors.accent,
        },
        pickingRaceTabPicked: {
          backgroundColor: theme.colors.accentMuted,
        },
        pickingRaceTabText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
        },
        pickingRaceTabTextActive: {
          color: theme.colors.accent,
          fontWeight: '600',
        },
        pickingRaceTabTextPicked: {
          color: theme.colors.accent,
        },
        pickingRunnerList: { gap: theme.spacing.xs, marginBottom: theme.spacing.lg },
        pickingSelectFavLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.xs,
        },
        pickingDivider: {
          height: 2,
          backgroundColor: theme.colors.accent,
          marginVertical: theme.spacing.md,
          borderRadius: 1,
        },
        pickingOrSelectLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.xs,
        },
        pickingRunnerCard: {
          position: 'relative',
          borderRadius: theme.radius.md,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        pickingRunnerCardSelected: {
          backgroundColor: theme.colors.accent,
          borderColor: theme.colors.accent,
        },
        pickingRunnerCardReadOnly: { opacity: 0.9 },
        pickingRunnerGradient: {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 12,
          borderTopLeftRadius: theme.radius.md - 1,
          borderBottomLeftRadius: theme.radius.md - 1,
        },
        pickingRunnerCardInner: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
        },
        pickingRunnerCardInnerSelected: {
          backgroundColor: 'transparent',
        },
        pickingRunnerCenter: { flex: 1, minWidth: 0 },
        pickingRunnerName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: theme.colors.text,
        },
        pickingRunnerNameSelected: {
          color: theme.colors.black,
        },
        pickingRunnerJockey: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          color: theme.colors.textMuted,
          marginTop: 2,
        },
        pickingRunnerJockeySelected: {
          color: 'rgba(0,0,0,0.7)',
        },
        pickingRunnerNumber: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: theme.spacing.md,
        },
        pickingRunnerNumberSelected: {
          backgroundColor: theme.colors.white,
        },
        pickingRunnerNumberText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.text,
        },
        pickingRunnerNumberTextSelected: {
          color: theme.colors.black,
        },
        pickingRunnerCheck: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '700',
          color: theme.colors.accent,
        },
        pickingRunnerCheckSelected: {
          color: theme.colors.black,
        },
        pickingRunnerSelect: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        closedBanner: {
          backgroundColor: 'rgba(185, 28, 28, 0.15)',
          borderWidth: 1,
          borderColor: '#b91c1c',
          borderRadius: theme.radius.sm,
          padding: theme.spacing.sm,
          marginBottom: theme.spacing.md,
        },
        closedBannerText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: '#b91c1c',
        },
        muted: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textMuted, marginBottom: theme.spacing.lg },
        buttonDisabled: { opacity: 0.7 },
        saveButtonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          color: theme.colors.black,
          fontWeight: '600',
        },
      }),
    [theme]
  );

  if (!competitionId) {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      );
    }
    return (
      <>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshingMySelections}
              onRefresh={refreshMySelections}
              tintColor={theme.colors.accent}
            />
          }
        >
          {userCompetitions.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>Join a competition</Text>
              <Text style={styles.emptyStateText}>Enter an access code from the home screen to join a competition and make your picks.</Text>
              <TouchableOpacity style={styles.emptyStateButton} onPress={() => router.push('/(auth)/access-code')}>
                <Text style={styles.emptyStateButtonText}>Enter access code</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const nonExpiredRaces = availableRaces.filter((item) => item.raceDate >= today);
                const openRaces = nonExpiredRaces.filter((item) => !isSelectionClosed(item.firstRaceUtc));
                const showableRaces = openRaces.filter(
                  (item) => !item.isLocked && compStatusByCompId[item.competitionId] === compTab
                );
                if (showableRaces.length === 0) {
                  return (
                    <View style={styles.makePicksSection}>
                      <Text style={styles.makePicksSectionTitle}>Make your picks</Text>
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
                      <View style={styles.lockedNoteBlock}>
                        <Text style={styles.lockedNoteText}>All selections have been made and are locked in. Good luck!</Text>
                      </View>
                    </View>
                  );
                }
                return (
                <View style={styles.makePicksSection}>
                  <Text style={styles.makePicksSectionTitle}>Make your picks</Text>
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
                  <Text style={styles.makePicksSectionSubtitle}>Select a meeting to make or view your selections</Text>
                  <View style={styles.raceCardsList}>
                    {showableRaces.map((item) => {
                      const closed = isSelectionClosed(item.firstRaceUtc);
                      const cardKey = `${item.competitionId}-${item.raceDate}`;
                      const isLocking = lockingId === cardKey;
                      return (
                        <TouchableOpacity
                          key={cardKey}
                          style={[
                            styles.raceCard,
                            closed ? styles.raceCardClosed : styles.raceCardOpen,
                            item.hasAnyPicks && styles.raceCardHasPicks,
                          ]}
                          onPress={() =>
                            router.push({ pathname: '/(app)/selections', params: { competitionId: item.competitionId, raceDate: item.raceDate } })
                          }
                          activeOpacity={0.8}
                          disabled={isLocking}
                        >
                          <View style={styles.raceCardRow}>
                            <View style={styles.raceCardLeft}>
                              <Text style={styles.raceCardTitle} numberOfLines={1}>{item.competitionName}</Text>
                              <Text style={styles.raceCardMeta}>
                                {item.course} · {new Date(item.raceDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                              </Text>
                              {closed ? (
                                <Text style={styles.raceCardStatusClosed}>Closed – view only</Text>
                              ) : item.hasAllPicks ? (
                                <Text style={styles.raceCardStatus}>Lock in to view others</Text>
                              ) : (
                                <Text style={styles.raceCardStatus}>
                                  {item.pendingCount} pick{item.pendingCount !== 1 ? 's' : ''} left
                                </Text>
                              )}
                            </View>
                            {!closed && (
                              <View style={styles.raceCardRight}>
                                {item.hasAllPicks ? (
                                  <TouchableOpacity
                                    style={[styles.lockInBtn, isLocking && styles.lockInBtnDisabled]}
                                    onPress={(e) => { e?.stopPropagation?.(); handleLockIn(item); }}
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
              );
              })()}

              {(() => {
                return (
                    <>
              <Text style={[styles.sectionTitle, styles.sectionTitleWithTopMargin]}>Your selections</Text>

          {mySelectionsList.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No picks yet</Text>
              <Text style={styles.emptyStateText}>Your picks will appear here once you've made selections for a meeting above.</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.courseDropdown}
                onPress={() => setCourseDropdownOpen(true)}
              >
                <Text style={styles.courseDropdownText}>{effectiveCourse ?? 'Select meeting'}</Text>
                <Text style={styles.courseDropdownChevron}>▼</Text>
              </TouchableOpacity>

              <Modal visible={courseDropdownOpen} transparent animationType="fade">
                <Pressable style={styles.dropdownOverlay} onPress={() => setCourseDropdownOpen(false)}>
                  <Pressable style={styles.dropdownContent} onPress={(e) => e.stopPropagation()}>
                    {uniqueCourses.map((course) => (
                      <TouchableOpacity
                        key={course}
                        style={[styles.dropdownOption, course === effectiveCourse && styles.dropdownOptionActive]}
                        onPress={() => {
                          setSelectedCourse(course);
                          setCourseDropdownOpen(false);
                        }}
                      >
                        <Text style={[styles.dropdownOptionText, course === effectiveCourse && styles.dropdownOptionTextActive]}>{course}</Text>
                      </TouchableOpacity>
                    ))}
                  </Pressable>
                </Pressable>
              </Modal>

              {uniqueCompIdsInCourse.length > 1 && (
                <>
                  <TouchableOpacity
                    style={styles.courseDropdown}
                    onPress={() => setCompetitionDropdownOpen(true)}
                  >
                    <Text style={styles.courseDropdownText}>
                      {competitionDayGroups[0]?.competitionName ?? 'Select competition'}
                    </Text>
                    <Text style={styles.courseDropdownChevron}>▼</Text>
                  </TouchableOpacity>
                  <Modal visible={competitionDropdownOpen} transparent animationType="fade">
                    <Pressable style={styles.dropdownOverlay} onPress={() => setCompetitionDropdownOpen(false)}>
                      <Pressable style={styles.dropdownContent} onPress={(e) => e.stopPropagation()}>
                        {uniqueCompIdsInCourse.map((compId) => {
                          const g = courseDayGroups.find((x) => x.competitionId === compId);
                          return (
                            <TouchableOpacity
                              key={compId}
                              style={[styles.dropdownOption, compId === effectiveCompId && styles.dropdownOptionActive]}
                              onPress={() => {
                                setSelectedCompetitionIdInList(compId);
                                setCompetitionDropdownOpen(false);
                              }}
                            >
                              <Text style={[styles.dropdownOptionText, compId === effectiveCompId && styles.dropdownOptionTextActive]}>
                                {g?.competitionName ?? compId}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </Pressable>
                    </Pressable>
                  </Modal>
                </>
              )}

              {competitionDayGroups.length >= 1 && (
                <View style={styles.dayTabsRow}>
                  {competitionDayGroups.map((g, i) => (
                    <TouchableOpacity
                      key={`${g.competitionId}-${g.raceDate}`}
                      style={[styles.dayTab, selectedDayIndex === i && styles.dayTabActive]}
                      onPress={() => setSelectedDayIndex(i)}
                    >
                      <Text style={[styles.dayTabText, selectedDayIndex === i && styles.dayTabTextActive]}>
                        Day {g.dayNumber}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {currentGroup && (
                <View style={styles.meetingSection}>
                  <Text style={styles.meetingSectionTitle}>
                    {formatDayDate(currentGroup.raceDate)}
                  </Text>
                  <View style={styles.raceCardsContainer}>
                    {currentGroup.items
                      .sort((a, b) => a.raceTimeUtc.localeCompare(b.raceTimeUtc))
                      .map((item, index) => {
                        const cardKey = `${item.competitionId}-${item.raceId}-${item.raceDate}`;
                        const isExpanded = expandedDrawer?.cardKey === cardKey;
                        return (
                          <View key={cardKey} style={styles.raceCardWithDrawer}>
                            <TouchableOpacity
                              style={[styles.mySelectionCard, isExpanded && styles.mySelectionCardExpanded]}
                              onPress={() => handleCardPress(item, cardKey)}
                              activeOpacity={0.7}
                            >
                              <View style={styles.mySelectionCardRow}>
                                <Text style={styles.mySelectionCardTime}>
                                  {new Date(item.raceTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                                <View style={styles.mySelectionCardCenter}>
                                  <Text style={styles.mySelectionCardPick} numberOfLines={1}>{displayHorseName(item.runnerName)}</Text>
                                  {item.jockey && (
                                    <Text style={styles.mySelectionCardJockey} numberOfLines={1}>{item.jockey}</Text>
                                  )}
                                </View>
                                {item.positionLabel ? (
                                <View
                                  style={[
                                    styles.wplBadge,
                                    item.positionLabel === 'won' && styles.wplWon,
                                    item.positionLabel === 'place' && styles.wplPlace,
                                    item.positionLabel === 'lost' && styles.wplLost,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.wplBadgeText,
                                      item.positionLabel === 'won' && styles.wplWonText,
                                      item.positionLabel === 'place' && styles.wplPlaceText,
                                      item.positionLabel === 'lost' && styles.wplLostText,
                                    ]}
                                  >
                                    {item.positionLabel === 'won' ? 'Win' : item.positionLabel === 'place' ? 'Place' : 'Lost'}
                                  </Text>
                                </View>
                              ) : (
                                <Text style={styles.mySelectionCardPending}>—</Text>
                              )}
                                <Text style={styles.drawerChevron}>{isExpanded ? '▲' : '▼'}</Text>
                              </View>
                            </TouchableOpacity>
                            {isExpanded && expandedDrawer && (
                              <View style={styles.othersDrawer}>
                                <Text style={styles.othersDrawerLabel}>Other picks in this race</Text>
                                <View style={styles.othersCardsContainer}>
                                  {expandedDrawer.others.map((o, i) => (
                                    <View
                                      key={`${o.displayName}-${o.runnerName}-${i}`}
                                      style={[styles.othersCard, o.isCurrentUser && styles.othersCardHighlight]}
                                    >
                                      <View style={styles.othersCardRow}>
                                        <Text style={[styles.othersCardName, o.isCurrentUser && styles.othersCardNameBold]} numberOfLines={1}>
                                          {o.displayName}{o.isCurrentUser ? ' (you)' : ''}
                                        </Text>
                                        <Text style={styles.othersCardPick} numberOfLines={1}>{displayHorseName(o.runnerName)}</Text>
                                      </View>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                  </View>
                </View>
              )}
            </>
          )}
                    </>
                );
              })()}
            </>
          )}
        </ScrollView>

      </>
    );
  }

  if (loading && raceDays.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backToSelectionsButton} onPress={() => router.replace('/(app)/selections')}>
        <Text style={styles.backToSelectionsButtonText}>← Back to my selections</Text>
      </TouchableOpacity>
      <View style={styles.pickingHeaderRow}>
        <Text style={styles.sectionTitle}>Make your picks</Text>
        {currentRaces.length > 0 && !selectionsClosed && !userLockedInForPickingDay && (
          <TouchableOpacity
            style={[styles.saveButtonInline, saving && styles.buttonDisabled]}
            onPress={saveSelections}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.black} />
            ) : (
              <Text style={styles.saveButtonText}>Save selections</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {raceDays.length >= 1 && (
        <View style={styles.pickingDayTabsRow}>
          {raceDays.map((d, i) => (
            <TouchableOpacity
              key={d.id}
              style={[styles.pickingDayTab, pickingDayIndex === i && styles.pickingDayTabActive]}
              onPress={() => setPickingDayIndex(i)}
            >
              <Text style={[styles.pickingDayTabText, pickingDayIndex === i && styles.pickingDayTabTextActive]}>
                Day {i + 1}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {selectionsClosed && currentRaces.length > 0 && (
        <View style={styles.closedBanner}>
          <Text style={styles.closedBannerText}>Selections are closed for this race day (1 hour before first race). View only.</Text>
        </View>
      )}

      {userLockedInForPickingDay && currentRaces.length > 0 && !selectionsClosed && (
        <View style={styles.closedBanner}>
          <Text style={styles.closedBannerText}>Your selections have been locked in and cannot be changed.</Text>
        </View>
      )}

      {currentRaces.length === 0 && (
        <Text style={styles.muted}>No races loaded for this day. Race data is updated daily.</Text>
      )}

      {currentRaces.length > 0 && (
        <>
          <View style={styles.pickingRaceCountRow}>
            <Text style={styles.pickingRaceCountText}>
              {currentRaces.filter((r) => selections[r.id]).length} of {currentRaces.length} races picked
            </Text>
          </View>
          <View style={styles.pickingRaceTabsRow}>
            {currentRaces.map((race, idx) => {
              const hasSelection = !!selections[race.id];
              return (
                <TouchableOpacity
                  key={race.id}
                  style={[
                    styles.pickingRaceTab,
                    selectedRaceIndex === idx && styles.pickingRaceTabActive,
                    hasSelection && styles.pickingRaceTabPicked,
                  ]}
                  onPress={() => setSelectedRaceIndex(idx)}
                >
                  <Text style={[styles.pickingRaceTabText, selectedRaceIndex === idx && styles.pickingRaceTabTextActive, hasSelection && styles.pickingRaceTabTextPicked]}>
                    {new Date(race.scheduledTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedRace && (() => {
            const runners = selectedRace.runners ?? [];
            const favRunner = runners.find((r) => r.id === 'FAV');
            const horseRunners = runners.filter((r) => r.id !== 'FAV');
            const renderRunnerCard = (r: { id: string; name: string; number?: number; jockey?: string }) => {
              const isSelected = selections[selectedRace.id]?.runnerId === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[
                    styles.pickingRunnerCard,
                    isSelected && styles.pickingRunnerCardSelected,
                    (selectionsClosed || userLockedInForPickingDay) && styles.pickingRunnerCardReadOnly,
                  ]}
                  onPress={() => !selectionsClosed && !userLockedInForPickingDay && setSelection(selectedRace.id, r.id, r.name, r.oddsDecimal)}
                  disabled={selectionsClosed || userLockedInForPickingDay}
                  activeOpacity={0.7}
                >
                  <View style={[styles.pickingRunnerCardInner, isSelected && styles.pickingRunnerCardInnerSelected]}>
                    <View style={[styles.pickingRunnerNumber, isSelected && styles.pickingRunnerNumberSelected]}>
                      <Text style={[styles.pickingRunnerNumberText, isSelected && styles.pickingRunnerNumberTextSelected]}>{r.id === 'FAV' ? '★' : r.number ?? '—'}</Text>
                    </View>
                    <View style={styles.pickingRunnerCenter}>
                      <Text style={[styles.pickingRunnerName, isSelected && styles.pickingRunnerNameSelected]} numberOfLines={1}>{displayHorseName(r.name)}</Text>
                      {r.jockey ? <Text style={[styles.pickingRunnerJockey, isSelected && styles.pickingRunnerJockeySelected]} numberOfLines={1}>{r.jockey}</Text> : null}
                    </View>
                    {isSelected ? (
                      <Text style={[styles.pickingRunnerCheck, styles.pickingRunnerCheckSelected]}>✓</Text>
                    ) : (
                      <Text style={styles.pickingRunnerSelect}>Select</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            };
            return (
              <View style={styles.pickingRunnerList}>
                <Text style={styles.pickingSelectFavLabel}>Select fav</Text>
                {favRunner && renderRunnerCard(favRunner)}
                <View style={styles.pickingDivider} />
                <Text style={styles.pickingOrSelectLabel}>or select your horse</Text>
                {horseRunners.map((r) => renderRunnerCard(r))}
              </View>
            );
          })()}
        </>
      )}

    </ScrollView>
  );
}

