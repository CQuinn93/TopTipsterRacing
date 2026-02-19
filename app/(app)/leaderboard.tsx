import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { setLeaderboardBulkCache } from '@/lib/leaderboardBulkCache';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';

type LeaderboardRow = {
  display_name: string;
  user_id: string;
  day1: number;
  day2: number;
  day3: number;
  day4: number;
  total: number;
  max_odds: number;
  rank_overall: number;
  rank_daily: number;
  rank_odds: number;
};

type ViewMode = 'overall' | 'daily' | 'highest_odds';

const POINTS_PER_ODDS = 10; // round(oddsDecimal * 10) per selection
const WIDTH_TOTAL_ONLY = 260;   // below this: show only # Name Total
const WIDTH_LONG_LABELS = 500;  // above this: "Day 1" etc.; below: "D1" etc.
const WIDTH_WIDE_SCREEN = 768;  // above this: double column widths (web/tablet)
const CUTOFF_HOUR_1PM = 13;     // daily leaderboard only fetches after 1PM, once per day

export default function LeaderboardScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ competitionId?: string }>();
  const competitionId = params.competitionId as string | undefined;

  const showTotalOnly = screenWidth < WIDTH_TOTAL_ONLY;
  const useLongDayLabels = screenWidth >= WIDTH_LONG_LABELS;
  const isWideScreen = screenWidth >= WIDTH_WIDE_SCREEN;
  const dayHeaders = useLongDayLabels ? ['Day 1', 'Day 2', 'Day 3', 'Day 4'] : ['D1', 'D2', 'D3', 'D4'];

  const [competitions, setCompetitions] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(competitionId);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [raceDates, setRaceDates] = useState<string[]>([]); // [Day1 date, Day2, ...] up to 4
  const [viewMode, setViewMode] = useState<ViewMode>('overall');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0); // 0 = Day 1
  const [refreshing, setRefreshing] = useState(false);
  const lastFetchedAfter1PMDateRef = useRef<string | null>(null); // YYYY-MM-DD when we last fetched after 1PM

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: parts } = await supabase
        .from('competition_participants')
        .select('competition_id')
        .eq('user_id', userId);
      if (!parts?.length) return;
      const compIds = (parts as { competition_id: string }[]).map((p) => p.competition_id);
      const { data: comps } = await supabase
        .from('competitions')
        .select('id, name, festival_start_date')
        .in('id', compIds)
        .order('festival_start_date', { ascending: false });
      if (comps?.length) {
        setCompetitions(comps.map((c) => ({ id: c.id, name: c.name })));
        if (!selectedId) setSelectedId(comps[0].id);
      }
    })();
  }, [userId]);

  useEffect(() => {
    if (competitionId) setSelectedId(competitionId);
  }, [competitionId]);

  const loadLeaderboard = async () => {
    if (!selectedId) return;
    const now = new Date();
    const isAfter1PM = now.getHours() >= CUTOFF_HOUR_1PM;
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    if (!isAfter1PM) {
      setRefreshing(false);
      return;
    }
    if (lastFetchedAfter1PMDateRef.current === todayStr) {
      setRefreshing(false);
      return;
    }
    setRefreshing(true);
    try {
      const [raceDaysData, partsRes, selectionsRes] = await Promise.all([
        fetchRaceDaysForCompetition(supabase, selectedId, 'id, race_date, races'),
        supabase
          .from('competition_participants')
          .select('user_id, display_name')
          .eq('competition_id', selectedId),
        supabase
          .from('daily_selections')
          .select('user_id, race_date, selections')
          .eq('competition_id', selectedId),
      ]);

      const parts = (partsRes.data ?? []) as { user_id: string; display_name: string }[];
      if (!parts.length) {
        setRows([]);
        setRaceDates([]);
        setRefreshing(false);
        return;
      }

      const raceDaysRows = (raceDaysData ?? []) as { id: string; race_date: string; races: unknown[] }[];
      const orderedDates = raceDaysRows.slice(0, 4).map((d) => d.race_date);
      setRaceDates(orderedDates);

      const selectionsByUser: Record<string, Record<string, Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>>> = {};
      for (const s of selectionsRes.data ?? []) {
        const row = s as { user_id: string; race_date: string; selections: Record<string, { runnerId?: string; runnerName?: string; oddsDecimal?: number }> | null };
        const sel = row.selections;
        if (!sel || typeof sel !== 'object') continue;
        if (!selectionsByUser[row.user_id]) selectionsByUser[row.user_id] = {};
        const normalized: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }> = {};
        for (const [raceId, v] of Object.entries(sel)) {
          if (v && typeof v.oddsDecimal === 'number') {
            normalized[raceId] = {
              runnerId: v.runnerId ?? '',
              runnerName: v.runnerName ?? '',
              oddsDecimal: v.oddsDecimal,
            };
          }
        }
        selectionsByUser[row.user_id][row.race_date] = normalized;
      }
      const bulkRaceDays = raceDaysRows.slice(0, 4).map((d) => ({ id: d.id, race_date: d.race_date, races: d.races ?? [] }));
      await setLeaderboardBulkCache(selectedId, { raceDays: bulkRaceDays, selectionsByUser });

      const usernameByUserId: Record<string, string> = {};
      const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', parts.map((p) => p.user_id));
      for (const pr of profiles ?? []) {
        usernameByUserId[pr.id] = pr.username;
      }

      const dateToIndex: Record<string, number> = {};
      orderedDates.forEach((d, i) => { dateToIndex[d] = i; });

      const pointsByUserDay: Record<string, number[]> = {};
      const maxOddsByUser: Record<string, number> = {};
      for (const p of parts) {
        pointsByUserDay[p.user_id] = [0, 0, 0, 0];
        maxOddsByUser[p.user_id] = 0;
      }

      for (const s of selectionsRes.data ?? []) {
        const row = s as { user_id: string; race_date: string; selections: Record<string, { oddsDecimal?: number }> | null };
        const sel = row.selections;
        if (!sel) continue;
        const uid = row.user_id;
        const dayIdx = dateToIndex[row.race_date];
        if (dayIdx === undefined) continue;
        let dayPoints = 0;
        for (const v of Object.values(sel)) {
          if (v?.oddsDecimal) {
            const pts = Math.round(v.oddsDecimal * POINTS_PER_ODDS);
            dayPoints += pts;
            if (v.oddsDecimal > (maxOddsByUser[uid] ?? 0)) maxOddsByUser[uid] = v.oddsDecimal;
          }
        }
        pointsByUserDay[uid][dayIdx] = (pointsByUserDay[uid]?.[dayIdx] ?? 0) + dayPoints;
      }

      const buildRow = (p: { user_id: string; display_name: string }): LeaderboardRow => {
        const d = pointsByUserDay[p.user_id] ?? [0, 0, 0, 0];
        const day1 = d[0] ?? 0;
        const day2 = d[1] ?? 0;
        const day3 = d[2] ?? 0;
        const day4 = d[3] ?? 0;
        const total = day1 + day2 + day3 + day4;
        const max_odds = maxOddsByUser[p.user_id] ?? 0;
        return {
          display_name: usernameByUserId[p.user_id] ?? p.display_name,
          user_id: p.user_id,
          day1,
          day2,
          day3,
          day4,
          total,
          max_odds,
          rank_overall: 0,
          rank_daily: 0,
          rank_odds: 0,
        };
      };

      let list: LeaderboardRow[] = parts.map(buildRow);

      list.sort((a, b) => b.total - a.total);
      list.forEach((e, i) => { e.rank_overall = i + 1; });

      list.sort((a, b) => {
        const aDay = [a.day1, a.day2, a.day3, a.day4][selectedDayIndex] ?? 0;
        const bDay = [b.day1, b.day2, b.day3, b.day4][selectedDayIndex] ?? 0;
        return bDay - aDay;
      });
      list.forEach((e, i) => { e.rank_daily = i + 1; });

      list.sort((a, b) => b.max_odds - a.max_odds);
      list.forEach((e, i) => { e.rank_odds = i + 1; });

      list.sort((a, b) => b.total - a.total);
      setRows(list);
      if (now.getHours() >= CUTOFF_HOUR_1PM) {
        lastFetchedAfter1PMDateRef.current = now.toISOString().slice(0, 10);
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, [selectedId]);

  useEffect(() => {
    if (rows.length === 0) return;
    setRows((prev) => {
      const list = prev.map((r) => ({ ...r }));
      list.sort((a, b) => {
        const aDay = [a.day1, a.day2, a.day3, a.day4][selectedDayIndex] ?? 0;
        const bDay = [b.day1, b.day2, b.day3, b.day4][selectedDayIndex] ?? 0;
        return bDay - aDay;
      });
      list.forEach((e, i) => { e.rank_daily = i + 1; });
      return list;
    });
  }, [selectedDayIndex]);

  const getSortedRows = (): LeaderboardRow[] => {
    if (viewMode === 'overall') return [...rows].sort((a, b) => a.rank_overall - b.rank_overall);
    if (viewMode === 'daily') return [...rows].sort((a, b) => a.rank_daily - b.rank_daily);
    return [...rows].sort((a, b) => a.rank_odds - b.rank_odds);
  };

  const getRank = (r: LeaderboardRow) => {
    if (viewMode === 'overall') return r.rank_overall;
    if (viewMode === 'daily') return r.rank_daily;
    return r.rank_odds;
  };

  const openParticipantSelections = (row: LeaderboardRow) => {
    if (!selectedId) return;
    router.push({
      pathname: '/(app)/participant-selections',
      params: {
        competitionId: selectedId,
        participantUserId: row.user_id,
        displayName: row.display_name,
      },
    });
  };

  const sortedRows = getSortedRows();

  const renderRow = ({ item }: { item: LeaderboardRow }) => {
    const rank = getRank(item);
    return (
      <TouchableOpacity
        style={[styles.row, item.user_id === userId && styles.rowHighlight]}
        onPress={() => openParticipantSelections(item)}
        activeOpacity={0.7}
      >
        <Text style={cellStyles.rank}>{rank}</Text>
        <Text style={cellStyles.name} numberOfLines={1}>{item.display_name}</Text>
        {viewMode === 'overall' && (
          <>
            {!showTotalOnly && (
              <>
                <Text style={cellStyles.num}>{item.day1}</Text>
                <Text style={cellStyles.num}>{item.day2}</Text>
                <Text style={cellStyles.num}>{item.day3}</Text>
                <Text style={cellStyles.num}>{item.day4}</Text>
              </>
            )}
            <Text style={cellStyles.total}>{item.total}</Text>
          </>
        )}
        {viewMode === 'daily' && (
          <Text style={cellStyles.points}>
            {([item.day1, item.day2, item.day3, item.day4][selectedDayIndex] ?? 0)} pts
          </Text>
        )}
        {viewMode === 'highest_odds' && (
          <Text style={cellStyles.odds}>{item.max_odds > 0 ? item.max_odds.toFixed(2) : '—'}</Text>
        )}
      </TouchableOpacity>
    );
  };

  const dayLabels = raceDates.map((d, i) => `Day ${i + 1}`);

  const contentWidth = screenWidth - 2 * PADDING_H;
  const colMultiplier = isWideScreen ? 2 : 1;
  const cellStyles = {
    rank: [styles.rankCell, { width: 32 * colMultiplier }],
    name: [styles.nameCell, { width: 96 * colMultiplier }],
    num: [styles.numCell, { width: 48 * colMultiplier }],
    dayHeader: [styles.dayHeaderCell, { width: 58 * colMultiplier }],
    total: [styles.totalCell, { width: 52 * colMultiplier }],
    points: [styles.pointsCell, { width: 76 * colMultiplier }],
    odds: [styles.oddsCell, { width: 76 * colMultiplier }],
  };

  const now = new Date();
  const isAfter1PM = now.getHours() >= CUTOFF_HOUR_1PM;
  const showAfter1PMMessage = !isAfter1PM && rows.length === 0 && selectedId;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.outerScroll}
        contentContainerStyle={styles.outerScrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={loadLeaderboard} tintColor={theme.colors.accent} />
        }
        showsVerticalScrollIndicator={true}
      >
        <View style={[styles.centeredContent, { width: screenWidth }]}>
          <View style={styles.topSpacer} />
          {competitions.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[styles.compList, { width: contentWidth }]}
              contentContainerStyle={styles.compListContent}
            >
              {competitions.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.compChip, selectedId === c.id && styles.compChipActive]}
                  onPress={() => setSelectedId(c.id)}
                >
                  <Text style={[styles.compChipText, selectedId === c.id && styles.compChipTextActive]} numberOfLines={1}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={[styles.viewModeRow, { width: contentWidth }]}>
            <TouchableOpacity
              style={[styles.viewModeChip, styles.viewModeChipEqual, viewMode === 'overall' && styles.viewModeChipActive]}
              onPress={() => setViewMode('overall')}
            >
              <Text style={[styles.viewModeChipText, viewMode === 'overall' && styles.viewModeChipTextActive]}>Overall</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewModeChip, styles.viewModeChipEqual, viewMode === 'daily' && styles.viewModeChipActive]}
              onPress={() => setViewMode('daily')}
            >
              <Text style={[styles.viewModeChipText, viewMode === 'daily' && styles.viewModeChipTextActive]}>Daily</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewModeChip, styles.viewModeChipEqual, viewMode === 'highest_odds' && styles.viewModeChipActive]}
              onPress={() => setViewMode('highest_odds')}
            >
              <Text style={[styles.viewModeChipText, viewMode === 'highest_odds' && styles.viewModeChipTextActive]}>Highest Odds</Text>
            </TouchableOpacity>
          </View>

          {viewMode === 'daily' && (
            <View style={[styles.dayFilterWrap, { width: contentWidth }]}>
              <View style={styles.dayFilterRow}>
                {(['Day 1', 'Day 2', 'Day 3', 'Day 4'] as const).map((label, i) => (
                  <TouchableOpacity
                    key={label}
                    style={[styles.dayChip, styles.dayChipEqual, selectedDayIndex === i && styles.dayChipActive]}
                    onPress={() => setSelectedDayIndex(i)}
                  >
                    <Text style={[styles.dayChipText, selectedDayIndex === i && styles.dayChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {showAfter1PMMessage && (
            <Text style={styles.after1PMMessage}>Leaderboard updates after 1 PM.</Text>
          )}

          <View style={[styles.tableWrap, { width: contentWidth }]}>
            <View style={styles.table}>
              {viewMode === 'overall' && (
                <View style={styles.headerRow}>
                  <Text style={cellStyles.rank}>#</Text>
                  <Text style={cellStyles.name}>Name</Text>
                  {!showTotalOnly && dayHeaders.map((h, i) => (
                    <Text key={i} style={useLongDayLabels ? cellStyles.dayHeader : cellStyles.num}>{h}</Text>
                  ))}
                  <Text style={cellStyles.total}>Total</Text>
                </View>
              )}
              {(viewMode === 'daily' || viewMode === 'highest_odds') && (
                <View style={styles.headerRow}>
                  <Text style={cellStyles.rank}>#</Text>
                  <Text style={cellStyles.name}>Name</Text>
                  <Text style={viewMode === 'daily' ? cellStyles.points : cellStyles.odds}>
                    {viewMode === 'daily' ? 'Points' : 'Best SP'}
                  </Text>
                </View>
              )}
              {sortedRows.map((item) => (
                <View key={item.user_id}>
                  {renderRow({ item })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const PADDING_H = theme.spacing.sm;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  outerScroll: { flex: 1 },
  outerScrollContent: { paddingBottom: theme.spacing.xxl },
  centeredContent: { alignSelf: 'center', alignItems: 'center' },
  topSpacer: { height: theme.spacing.md },
  compList: { maxHeight: 48, marginBottom: theme.spacing.sm },
  compListContent: { paddingHorizontal: 0, gap: theme.spacing.sm },
  compChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  compChipActive: { backgroundColor: theme.colors.accentMuted, borderColor: theme.colors.accent },
  compChipText: { fontFamily: theme.fontFamily.regular, fontSize: 15, color: theme.colors.textSecondary },
  compChipTextActive: { color: theme.colors.accent },
  viewModeRow: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  viewModeChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  viewModeChipEqual: { flex: 1 },
  viewModeChipActive: { backgroundColor: theme.colors.accentMuted, borderColor: theme.colors.accent },
  viewModeChipText: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary },
  viewModeChipTextActive: { color: theme.colors.accent },
  dayFilterWrap: { marginBottom: theme.spacing.sm },
  dayFilterEmpty: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.textMuted },
  dayFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    marginBottom: 0,
    gap: theme.spacing.sm,
  },
  dayChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dayChipEqual: { flex: 1 },
  dayChipActive: { borderColor: theme.colors.accent },
  after1PMMessage: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  dayChipText: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.textSecondary },
  dayChipTextActive: { color: theme.colors.accent },
  tableWrap: {},
  table: { paddingHorizontal: 0 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginBottom: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowHighlight: { backgroundColor: theme.colors.accentMuted },
  rankCell: { width: 32, fontFamily: theme.fontFamily.regular, fontSize: 16, color: theme.colors.text },
  nameCell: { width: 96, fontFamily: theme.fontFamily.regular, fontSize: 16, color: theme.colors.text },
  numCell: { width: 48, fontFamily: theme.fontFamily.regular, fontSize: 15, color: theme.colors.textMuted, textAlign: 'right' },
  dayHeaderCell: { width: 58, fontFamily: theme.fontFamily.regular, fontSize: 15, color: theme.colors.textMuted, textAlign: 'right' },
  totalCell: { width: 52, fontFamily: theme.fontFamily.regular, fontSize: 15, fontWeight: '600', color: theme.colors.accent, textAlign: 'right' },
  pointsCell: { width: 76, fontFamily: theme.fontFamily.regular, fontSize: 16, color: theme.colors.accent, textAlign: 'right' },
  oddsCell: { width: 76, fontFamily: theme.fontFamily.regular, fontSize: 16, color: theme.colors.accent, textAlign: 'right' },
});
