import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { displayHorseName } from '@/lib/displayHorseName';
import { decimalToFractional } from '@/lib/oddsFormat';
import { getLeaderboardBulkCache, setLeaderboardBulkCache } from '@/lib/leaderboardBulkCache';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';
import { useRealtimeRaces } from '@/lib/useRealtimeRaces';

const LEADERBOARD_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes – use cache to save egress on repeat visits
import type { Race, RaceResult } from '@/types/races';

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
  /** Rank at end of previous complete day (for up/down arrow); null if no previous day. */
  rank_prev_day: number | null;
  /** For Highest SP view: horse name and race name for the pick that gave max_odds. */
  best_sp_runner_name?: string;
  best_sp_race_name?: string;
};

export default function LeaderboardScreen() {
  const theme = useTheme();
  const rankColors = useMemo(() => ({
    1: theme.colors.accent,
    2: '#eab308',
    3: '#06b6d4',
  }), [theme]);
  const { width: screenWidth } = useWindowDimensions();
  const { userId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ competitionId?: string }>();
  const competitionId = params.competitionId as string | undefined;

  const [selectedId, setSelectedId] = useState<string | undefined>(competitionId);
  const [competitionName, setCompetitionName] = useState<string>('');
  const [festivalStart, setFestivalStart] = useState<string | null>(null);
  const [festivalEnd, setFestivalEnd] = useState<string | null>(null);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [raceDates, setRaceDates] = useState<string[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [leaderboardFilter, setLeaderboardFilter] = useState<'daily' | 'overall' | 'sp'>('overall');
  const [hasAnyRaceResult, setHasAnyRaceResult] = useState(false);
  /** Race api_race_ids for current competition; used by Realtime to refetch when results land. */
  const [leaderboardRaceApiIds, setLeaderboardRaceApiIds] = useState<string[]>([]);

  useEffect(() => {
    if (competitionId) setSelectedId(competitionId);
  }, [competitionId]);

  const loadLeaderboard = async (forceRefresh = false) => {
    if (!selectedId) return;
    const now = new Date();
    setRefreshing(true);
    try {
      let raceDaysRows: { id: string; race_date: string; races: unknown[] }[];
      let selectionsDataForPoints: { user_id: string; race_date: string; selections: Record<string, { runnerId?: string; runnerName?: string; oddsDecimal?: number }> | null }[];
      let compRes: { data: { name?: string; festival_start_date?: string; festival_end_date?: string } | null };
      let partsRes: { data: { user_id: string; display_name: string }[] | null };

      const cached = !forceRefresh ? await getLeaderboardBulkCache(selectedId) : null;
      const useCache = cached && (Date.now() - new Date(cached.fetchedAt).getTime() < LEADERBOARD_CACHE_TTL_MS);

      if (useCache && cached) {
        raceDaysRows = cached.raceDays;
        selectionsDataForPoints = [];
        for (const [uid, byDate] of Object.entries(cached.selectionsByUser)) {
          for (const [date, sel] of Object.entries(byDate)) {
            selectionsDataForPoints.push({ user_id: uid, race_date: date, selections: sel });
          }
        }
        const [compResF, partsResF] = await Promise.all([
          supabase.from('competitions').select('name, festival_start_date, festival_end_date').eq('id', selectedId).maybeSingle(),
          supabase.from('competition_participants').select('user_id, display_name').eq('competition_id', selectedId),
        ]);
        compRes = compResF;
        partsRes = partsResF;
      } else {
        const [raceDaysData, partsResF, selectionsRes, compResF] = await Promise.all([
          fetchRaceDaysForCompetition(supabase, selectedId, 'id, race_date, races'),
          supabase.from('competition_participants').select('user_id, display_name').eq('competition_id', selectedId),
          supabase.from('daily_selections').select('user_id, race_date, selections').eq('competition_id', selectedId),
          supabase.from('competitions').select('name, festival_start_date, festival_end_date').eq('id', selectedId).maybeSingle(),
        ]);
        compRes = compResF;
        partsRes = partsResF;
        raceDaysRows = (raceDaysData ?? []) as { id: string; race_date: string; races: unknown[] }[];
        selectionsDataForPoints = (selectionsRes.data ?? []) as { user_id: string; race_date: string; selections: Record<string, { runnerId?: string; runnerName?: string; oddsDecimal?: number }> | null }[];
        const selectionsByUser: Record<string, Record<string, Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>>> = {};
        for (const s of selectionsDataForPoints) {
          const sel = s.selections;
          if (!sel || typeof sel !== 'object') continue;
          if (!selectionsByUser[s.user_id]) selectionsByUser[s.user_id] = {};
          const normalized: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }> = {};
          for (const [raceId, v] of Object.entries(sel)) {
            if (v && typeof v.oddsDecimal === 'number') {
              normalized[raceId] = { runnerId: v.runnerId ?? '', runnerName: v.runnerName ?? '', oddsDecimal: v.oddsDecimal };
            }
          }
          selectionsByUser[s.user_id][s.race_date] = normalized;
        }
        await setLeaderboardBulkCache(selectedId, { raceDays: raceDaysRows.slice(0, 4).map((d) => ({ id: d.id, race_date: d.race_date, races: d.races ?? [] })), selectionsByUser });
      }

      const compRow = compRes.data as { name?: string; festival_start_date?: string; festival_end_date?: string } | null;
      setCompetitionName(compRow?.name ?? '');
      setFestivalStart(compRow?.festival_start_date ?? null);
      setFestivalEnd(compRow?.festival_end_date ?? null);

      const parts = (partsRes.data ?? []) as { user_id: string; display_name: string }[];
      if (!parts.length) {
        setRows([]);
        setRaceDates([]);
        setLeaderboardRaceApiIds([]);
        setCompetitionName(compRow?.name ?? '');
        setFestivalStart(compRow?.festival_start_date ?? null);
        setFestivalEnd(compRow?.festival_end_date ?? null);
        setRefreshing(false);
        return;
      }

      const orderedDates = raceDaysRows.slice(0, 4).map((d) => d.race_date);
      setRaceDates(orderedDates);
      setLeaderboardRaceApiIds([...new Set(raceDaysRows.flatMap((d) => ((d.races ?? []) as Race[]).map((r) => r.id)))]);

      const usernameByUserId: Record<string, string> = {};
      const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', parts.map((p) => p.user_id));
      for (const pr of profiles ?? []) {
        usernameByUserId[pr.id] = pr.username;
      }

      const dateToIndex: Record<string, number> = {};
      orderedDates.forEach((d, i) => { dateToIndex[d] = i; });

      // Lookup race by (race_date, race_id) so we can use DB points (pos_points + sp_points) from points_system
      const raceByDateAndId = new Map<string, Race>();
      for (const d of raceDaysRows.slice(0, 4)) {
        const races = (d.races ?? []) as Race[];
        for (const r of races) {
          raceByDateAndId.set(`${d.race_date}:${r.id}`, r);
        }
      }

      const pointsByUserDay: Record<string, number[]> = {};
      /** Highest SP among winning picks only (blank until at least one race has results). */
      const maxOddsByUser: Record<string, number> = {};
      const bestSpByUser: Record<string, { odds: number; runnerName: string; raceName: string }> = {};
      for (const p of parts) {
        pointsByUserDay[p.user_id] = [0, 0, 0, 0];
        maxOddsByUser[p.user_id] = 0;
      }

      const hasAnyRaceResult = raceDaysRows.some((d) => {
        const races = (d?.races ?? []) as Race[];
        return races.some((r) => r.results != null && Object.keys(r.results ?? {}).length > 0);
      });

      for (const s of selectionsDataForPoints) {
        const row = s;
        const sel = row.selections;
        if (!sel) continue;
        const uid = row.user_id;
        const dayIdx = dateToIndex[row.race_date];
        if (dayIdx === undefined) continue;
        let dayPoints = 0;
        for (const [raceId, v] of Object.entries(sel)) {
          if (!v) continue;
          const race = raceByDateAndId.get(`${row.race_date}:${raceId}`);
          let result: RaceResult | undefined;
          if (race?.results) {
            const runnerId = v.runnerId ?? '';
            if (runnerId === 'FAV') {
              result = (race.results['FAV'] as RaceResult) ?? (() => {
                const favId = Object.entries(race.results).reduce<string | null>((best, [id, r]) => {
                  const sp = (r as RaceResult)?.sp ?? Infinity;
                  return !best || sp < ((race.results?.[best] as RaceResult)?.sp ?? Infinity) ? id : best;
                }, null);
                return favId ? (race.results[favId] as RaceResult) : undefined;
              })();
            } else {
              result = race.results[runnerId] as RaceResult | undefined;
            }
          }
          const pts = result != null && (result.pos_points != null || result.sp_points != null)
            ? (result.pos_points ?? 0) + (result.sp_points ?? 0)
            : 0;
          dayPoints += pts;
          // Highest SP winner: only consider picks that actually won (position 1 / positionLabel 'won')
          const isWin = result != null && (result.position === 1 || result.positionLabel === 'won');
          if (hasAnyRaceResult && isWin && result && typeof result.sp === 'number' && result.sp > (maxOddsByUser[uid] ?? 0)) {
            maxOddsByUser[uid] = result.sp;
            bestSpByUser[uid] = {
              odds: result.sp,
              runnerName: v.runnerName ?? '',
              raceName: race?.name ?? 'Race',
            };
          }
        }
        pointsByUserDay[uid][dayIdx] = (pointsByUserDay[uid]?.[dayIdx] ?? 0) + dayPoints;
      }

      // Last complete day: highest day index where every race has results (event finished)
      let lastCompleteDayIndex = -1;
      for (let dayIdx = 0; dayIdx < raceDaysRows.length; dayIdx++) {
        const d = raceDaysRows[dayIdx];
        const races = (d?.races ?? []) as Race[];
        const allHaveResults = races.length > 0 && races.every((r) => r.results != null);
        if (allHaveResults) lastCompleteDayIndex = dayIdx;
        else break;
      }

      const buildRow = (p: { user_id: string; display_name: string }): LeaderboardRow => {
        const d = pointsByUserDay[p.user_id] ?? [0, 0, 0, 0];
        const day1 = d[0] ?? 0;
        const day2 = d[1] ?? 0;
        const day3 = d[2] ?? 0;
        const day4 = d[3] ?? 0;
        const total = day1 + day2 + day3 + day4;
        const max_odds = maxOddsByUser[p.user_id] ?? 0;
        const bestSp = bestSpByUser[p.user_id];
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
          rank_prev_day: null,
          best_sp_runner_name: bestSp?.runnerName,
          best_sp_race_name: bestSp?.raceName,
        };
      };

      let list: LeaderboardRow[] = parts.map(buildRow);

      function assignTiedRanks<T>(sorted: LeaderboardRow[], getScore: (r: LeaderboardRow) => number, setRank: (r: LeaderboardRow, rank: number) => void): void {
        let rank = 1;
        for (let i = 0; i < sorted.length; i++) {
          if (i > 0 && getScore(sorted[i]) !== getScore(sorted[i - 1])) rank = i + 1;
          setRank(sorted[i], rank);
        }
      }

      list.sort((a, b) => b.total - a.total);
      assignTiedRanks(list, (r) => r.total, (r, rank) => { r.rank_overall = rank; });

      // Rank at end of previous complete day (for position change arrows)
      if (lastCompleteDayIndex >= 1) {
        const prevDayPoints = (r: LeaderboardRow) =>
          [r.day1, r.day2, r.day3, r.day4].slice(0, lastCompleteDayIndex).reduce((s, n) => s + n, 0);
        const byPrev = [...list].sort((a, b) => prevDayPoints(b) - prevDayPoints(a));
        assignTiedRanks(byPrev, prevDayPoints, (r, rank) => { r.rank_prev_day = rank; });
      }

      list.sort((a, b) => {
        const aDay = [a.day1, a.day2, a.day3, a.day4][selectedDayIndex] ?? 0;
        const bDay = [b.day1, b.day2, b.day3, b.day4][selectedDayIndex] ?? 0;
        return bDay - aDay;
      });
      assignTiedRanks(list, (r) => [r.day1, r.day2, r.day3, r.day4][selectedDayIndex] ?? 0, (r, rank) => { r.rank_daily = rank; });

      list.sort((a, b) => b.max_odds - a.max_odds);
      assignTiedRanks(list, (r) => r.max_odds, (r, rank) => { r.rank_odds = rank; });

      list.sort((a, b) => b.total - a.total);
      setRows(list);
      setHasAnyRaceResult(hasAnyRaceResult);
      setLastUpdated(now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) + ', ' + now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setRefreshing(false);
    }
  };

  useRealtimeRaces(leaderboardRaceApiIds, () => loadLeaderboard(true));

  const onRefresh = useCallback(() => {
    if (refreshing) return;
    const now = Date.now();
    if (lastManualRefreshAt != null && now - lastManualRefreshAt < 30_000) return;
    setLastManualRefreshAt(now);
    loadLeaderboard(true);
  }, [lastManualRefreshAt, loadLeaderboard, refreshing]);

  useEffect(() => {
    loadLeaderboard();
  }, [selectedId]);

  useEffect(() => {
    if (raceDates.length > 0) {
      setSelectedDayIndex((i) => Math.min(i, raceDates.length - 1));
    }
  }, [raceDates.length]);

  useEffect(() => {
    if (rows.length === 0) return;
    setRows((prev) => {
      const list = prev.map((r) => ({ ...r }));
      list.sort((a, b) => {
        const aDay = [a.day1, a.day2, a.day3, a.day4][selectedDayIndex] ?? 0;
        const bDay = [b.day1, b.day2, b.day3, b.day4][selectedDayIndex] ?? 0;
        return bDay - aDay;
      });
      let rank = 1;
      for (let i = 0; i < list.length; i++) {
        const curr = [list[i].day1, list[i].day2, list[i].day3, list[i].day4][selectedDayIndex] ?? 0;
        const prevDay = i > 0 ? [list[i - 1].day1, list[i - 1].day2, list[i - 1].day3, list[i - 1].day4][selectedDayIndex] ?? 0 : null;
        if (i > 0 && curr !== prevDay) rank = i + 1;
        list[i].rank_daily = rank;
      }
      return list;
    });
  }, [selectedDayIndex]);

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

  const listRows = [...rows].sort((a, b) => a.rank_overall - b.rank_overall);
  const getDailyPoints = (r: LeaderboardRow) => [r.day1, r.day2, r.day3, r.day4][selectedDayIndex] ?? 0;
  const listRowsForFilter =
    leaderboardFilter === 'daily'
      ? [...rows].sort((a, b) => getDailyPoints(b) - getDailyPoints(a))
      : leaderboardFilter === 'sp'
        ? [...rows].sort((a, b) => b.max_odds - a.max_odds)
        : [...rows].sort((a, b) => a.rank_overall - b.rank_overall);
  const dailyLeader = listRows.find((r) => r.rank_daily === 1);
  const overallLeader = listRows.find((r) => r.rank_overall === 1);
  const spLeader = listRows.find((r) => r.rank_odds === 1);
  const dailyLeaderCount = dailyLeader ? rows.filter((r) => getDailyPoints(r) === getDailyPoints(dailyLeader)).length : 0;
  const overallLeaderCount = overallLeader ? rows.filter((r) => r.total === overallLeader.total).length : 0;
  const spLeaderCount = spLeader ? rows.filter((r) => r.max_odds === spLeader.max_odds).length : 0;
  const dailyHeroLabel = dailyLeaderCount === 1 ? (dailyLeader?.display_name ?? '—') : dailyLeaderCount > 1 ? `${dailyLeaderCount} Users` : '—';
  const overallHeroLabel = overallLeaderCount === 1 ? (overallLeader?.display_name ?? '—') : overallLeaderCount > 1 ? `${overallLeaderCount} Users` : '—';
  const spHeroLabel = spLeaderCount === 1 ? (spLeader?.display_name ?? '—') : spLeaderCount > 1 ? `${spLeaderCount} Users` : '—';
  const eventDaysFromDates =
    festivalStart && festivalEnd
      ? Math.round((new Date(festivalEnd).getTime() - new Date(festivalStart).getTime()) / (24 * 60 * 60 * 1000)) + 1
      : 0;
  const eventDurationText =
    eventDaysFromDates <= 0 ? '' : eventDaysFromDates === 1 ? 'Single day event' : `${eventDaysFromDates} day event`;
  const participantCount = rows.length;

  const PADDING_H = theme.spacing.sm;
  const contentWidth = Math.min(screenWidth - 2 * PADDING_H, 500);
  const circleSize = Math.min((screenWidth - PADDING_H * 2 - 32) / 3, 100);

  const styles = useMemo(() => {
    const padH = theme.spacing.sm;
    return StyleSheet.create({
      container: { flex: 1, backgroundColor: theme.colors.background },
      outerScroll: { flex: 1 },
      outerScrollContent: { paddingBottom: theme.spacing.lg },
      centeredContent: { alignSelf: 'center', alignItems: 'center' },
      competitionHeading: {
        width: '100%',
        paddingHorizontal: padH,
        paddingTop: theme.spacing.md,
        marginBottom: theme.spacing.xs,
        fontFamily: theme.fontFamily.regular,
        fontSize: 22,
        fontWeight: '700',
        color: theme.colors.text,
        textAlign: 'center',
      },
      competitionSubtitle: {
        width: '100%',
        paddingHorizontal: padH,
        marginBottom: theme.spacing.md,
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.textMuted,
        textAlign: 'center',
      },
      heroRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: padH,
        marginBottom: theme.spacing.lg,
        gap: 12,
      },
      heroCircleWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      },
      heroCircle: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
      },
      heroCircleDaily: {
        backgroundColor: 'rgba(59, 130, 246, 0.18)',
        borderWidth: 2,
        borderColor: 'rgba(59, 130, 246, 0.5)',
      },
      heroCircleOverall: {
        backgroundColor: 'rgba(34, 197, 94, 0.18)',
        borderWidth: 2,
        borderColor: 'rgba(34, 197, 94, 0.5)',
      },
      heroCircleSp: {
        backgroundColor: 'rgba(234, 179, 8, 0.18)',
        borderWidth: 2,
        borderColor: 'rgba(234, 179, 8, 0.5)',
      },
      heroCircleSelected: {
        borderWidth: 3,
        borderColor: theme.colors.accent,
        opacity: 1,
      },
      heroName: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        fontWeight: '700',
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: 2,
        paddingHorizontal: 2,
      },
      heroDesc: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 10,
        color: theme.colors.textMuted,
        textAlign: 'center',
      },
      heroStat: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 10,
        color: theme.colors.textSecondary,
        marginTop: 2,
      },
      dayTabsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: padH,
        marginBottom: theme.spacing.md,
      },
      dayTab: {
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surface,
        borderWidth: 2,
        borderColor: 'transparent',
      },
      dayTabSelected: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentMuted ?? 'rgba(21, 128, 61, 0.15)',
      },
      dayTabText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
      },
      dayTabTextSelected: {
        color: theme.colors.accent,
      },
      keyInfoBlock: {
        width: '100%',
        paddingHorizontal: padH,
        marginBottom: theme.spacing.sm,
      },
      keyInfoText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.text,
        marginBottom: 2,
      },
      keyInfoMuted: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 11,
        color: theme.colors.textMuted,
        marginTop: 2,
      },
      leaderboardListTitle: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.sm,
        paddingHorizontal: padH,
      },
      listWrap: { paddingHorizontal: padH },
      listRowWrap: { marginBottom: theme.spacing.xs },
      listRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        borderWidth: 2,
        borderColor: 'transparent',
      },
      rankCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: theme.spacing.sm,
      },
      rankCircleText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.black,
      },
      rankCircleTextMuted: { color: theme.colors.textMuted },
      rankChangeWrap: { marginRight: theme.spacing.xs, justifyContent: 'center' },
      rankChangeText: { fontSize: 14, fontWeight: '700' },
      listRowCenter: { flex: 1 },
      listRowNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      },
      listRowName: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.text,
      },
      starDaily: { fontSize: 14, color: '#3b82f6' },
      starSp: { fontSize: 14, color: '#eab308' },
      listRowSubtitle: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 11,
        color: theme.colors.textMuted,
        marginTop: 2,
      },
      listRowTotal: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 11,
        color: theme.colors.textMuted,
        marginTop: 1,
      },
      listRowTotalRight: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.accent,
        marginRight: theme.spacing.xs,
      },
      expandedStats: {
        flexDirection: 'row',
        flex: 1,
        justifyContent: 'space-around',
        marginTop: theme.spacing.xs,
        paddingTop: theme.spacing.xs,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      },
      expandedStat: { alignItems: 'center' },
      expandedStatValue: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text,
      },
      expandedStatLabel: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 10,
        color: theme.colors.textMuted,
        marginTop: 1,
      },
      seeSelectionsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.xs,
        gap: theme.spacing.xs,
        marginTop: 2,
      },
      seeSelectionsButtonText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        color: theme.colors.accent,
        fontWeight: '600',
      },
    });
  }, [theme]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.outerScroll}
        contentContainerStyle={styles.outerScrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
        showsVerticalScrollIndicator={true}
      >
        <View style={[styles.centeredContent, { width: screenWidth }]}>
          {competitionName ? (
            <Text style={styles.competitionHeading} numberOfLines={1}>{competitionName}</Text>
          ) : null}
          {eventDurationText ? (
            <Text style={styles.competitionSubtitle}>{eventDurationText}</Text>
          ) : null}

          {rows.length > 0 && (
            <View style={styles.heroRow}>
              <View style={styles.heroCircleWrap}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setLeaderboardFilter('daily')}
                  style={[styles.heroCircle, styles.heroCircleDaily, { width: circleSize, height: circleSize, borderRadius: circleSize / 2 }, leaderboardFilter === 'daily' && styles.heroCircleSelected]}
                >
                  <Text style={styles.heroName} numberOfLines={1}>{dailyHeroLabel}</Text>
                  <Text style={styles.heroDesc}>Daily leader</Text>
                  {dailyLeader != null && (
                    <Text style={styles.heroStat}>{getDailyPoints(dailyLeader)} pts</Text>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.heroCircleWrap}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setLeaderboardFilter('overall')}
                  style={[styles.heroCircle, styles.heroCircleOverall, { width: circleSize, height: circleSize, borderRadius: circleSize / 2 }, leaderboardFilter === 'overall' && styles.heroCircleSelected]}
                >
                  <Text style={styles.heroName} numberOfLines={1}>{overallHeroLabel}</Text>
                  <Text style={styles.heroDesc}>Overall leader</Text>
                  {overallLeader != null && (
                    <Text style={styles.heroStat}>{overallLeader.total} pts</Text>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.heroCircleWrap}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setLeaderboardFilter('sp')}
                  style={[styles.heroCircle, styles.heroCircleSp, { width: circleSize, height: circleSize, borderRadius: circleSize / 2 }, leaderboardFilter === 'sp' && styles.heroCircleSelected]}
                >
                  <Text style={styles.heroName} numberOfLines={1}>{spHeroLabel}</Text>
                  <Text style={styles.heroDesc}>Highest SP winner</Text>
                  {hasAnyRaceResult && spLeader != null && spLeader.max_odds > 0 ? (
                    <Text style={styles.heroStat}>SP {decimalToFractional(spLeader.max_odds)}</Text>
                  ) : (
                    <Text style={styles.heroStat}>—</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {rows.length > 0 && leaderboardFilter === 'daily' && raceDates.length > 1 && (
            <View style={styles.dayTabsRow}>
              {raceDates.map((dateStr, index) => {
                const shortDate = (() => {
                  try {
                    const d = new Date(dateStr);
                    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
                  } catch {
                    return '';
                  }
                })();
                const label = shortDate ? `Day ${index + 1} (${shortDate})` : `Day ${index + 1}`;
                const isSelected = selectedDayIndex === index;
                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={[styles.dayTab, isSelected && styles.dayTabSelected]}
                    onPress={() => setSelectedDayIndex(index)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.dayTabText, isSelected && styles.dayTabTextSelected]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {rows.length > 0 && (
            <View style={styles.keyInfoBlock}>
              <Text style={styles.keyInfoText}>{participantCount} {participantCount === 1 ? 'participant' : 'participants'}</Text>
              {lastUpdated ? (
                <Text style={styles.keyInfoMuted}>Updated {lastUpdated}</Text>
              ) : null}
            </View>
          )}

          {rows.length > 0 && (
            <Text style={styles.leaderboardListTitle}>
              {leaderboardFilter === 'daily'
                ? `Daily leaderboard${raceDates.length > 1 ? ` · Day ${selectedDayIndex + 1}` : ''}`
                : leaderboardFilter === 'sp'
                  ? 'Highest SP'
                  : 'Overall leaderboard'}
            </Text>
          )}

          {rows.length > 0 && (() => {
            const rankCounts: Record<number, number> = {};
            listRowsForFilter.forEach((item) => {
              const r = leaderboardFilter === 'daily' ? item.rank_daily : leaderboardFilter === 'sp' ? item.rank_odds : item.rank_overall;
              rankCounts[r] = (rankCounts[r] ?? 0) + 1;
            });
            return (
              <View style={[styles.listWrap, { width: contentWidth }]}>
                {listRowsForFilter.map((item) => {
                  const rank = leaderboardFilter === 'daily' ? item.rank_daily : leaderboardFilter === 'sp' ? item.rank_odds : item.rank_overall;
                  const isTied = (rankCounts[rank] ?? 0) > 1;
                  const rankDisplay = isTied ? `T-${rank}` : String(rank);
                  const isExpanded = expandedUserId === item.user_id;
                  const isTopDaily = item.rank_daily === 1;
                  const isTopSp = item.rank_odds === 1;
                  const circleColor = rank <= 3 ? rankColors[rank as 1 | 2 | 3] : theme.colors.border;
                  const showPrevDayArrow = leaderboardFilter === 'overall' && item.rank_prev_day != null;
                  const subtitleSp =
                    leaderboardFilter === 'sp' && item.best_sp_runner_name && item.best_sp_race_name
                      ? `${displayHorseName(item.best_sp_runner_name)} · ${item.best_sp_race_name}`
                      : leaderboardFilter === 'sp' ? (item.best_sp_runner_name || item.best_sp_race_name || '—') : null;
                  const rightValue =
                    leaderboardFilter === 'daily'
                      ? `${getDailyPoints(item)} pts`
                      : leaderboardFilter === 'sp'
                        ? (hasAnyRaceResult && item.max_odds > 0 ? `SP ${decimalToFractional(item.max_odds)}` : '—')
                        : `${item.total} pts`;

                  const rowContent = (
                    <>
                      <View style={[styles.rankCircle, { backgroundColor: circleColor }]}>
                        <Text style={[styles.rankCircleText, rank > 3 && styles.rankCircleTextMuted]}>{rankDisplay}</Text>
                      </View>
                      {showPrevDayArrow && (
                        <View style={styles.rankChangeWrap}>
                          {rank < item.rank_prev_day! ? (
                            <Text style={[styles.rankChangeText, { color: '#22c55e' }]}>↑</Text>
                          ) : rank > item.rank_prev_day! ? (
                            <Text style={[styles.rankChangeText, { color: '#ef4444' }]}>↓</Text>
                          ) : null}
                        </View>
                      )}
                      <View style={styles.listRowCenter}>
                        <View style={styles.listRowNameRow}>
                          <Text style={styles.listRowName} numberOfLines={1}>{item.display_name}</Text>
                          {isTopDaily && <Text style={styles.starDaily}>★</Text>}
                          {isTopSp && hasAnyRaceResult && item.max_odds > 0 && <Text style={styles.starSp}>★</Text>}
                        </View>
                        {!isExpanded ? (
                          subtitleSp != null ? (
                            <Text style={styles.listRowSubtitle} numberOfLines={2}>{subtitleSp}</Text>
                          ) : null
                        ) : (
                          <View style={styles.expandedStats}>
                            <View style={styles.expandedStat}>
                              <Text style={styles.expandedStatLabel}>Daily</Text>
                              <Text style={styles.expandedStatValue}>{getDailyPoints(item)}</Text>
                            </View>
                            <View style={styles.expandedStat}>
                              <Text style={styles.expandedStatLabel}>Overall</Text>
                              <Text style={styles.expandedStatValue}>{item.total}</Text>
                            </View>
                            <View style={styles.expandedStat}>
                              <Text style={styles.expandedStatLabel}>Best SP</Text>
                              <Text style={styles.expandedStatValue}>{hasAnyRaceResult && item.max_odds > 0 ? decimalToFractional(item.max_odds) : '—'}</Text>
                            </View>
                          </View>
                        )}
                      </View>
                      {!isExpanded && (
                        <Text style={styles.listRowTotalRight}>{rightValue}</Text>
                      )}
                    </>
                  );

                  return (
                    <View key={item.user_id} style={styles.listRowWrap}>
                      <TouchableOpacity
                        style={styles.listRow}
                        onPress={() => setExpandedUserId(isExpanded ? null : item.user_id)}
                        activeOpacity={0.7}
                      >
                        {rowContent}
                      </TouchableOpacity>
                      {isExpanded && (
                      <TouchableOpacity
                        style={styles.seeSelectionsButton}
                        onPress={() => openParticipantSelections(item)}
                      >
                        <Text style={styles.seeSelectionsButtonText}>See selections</Text>
                      </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })()}
        </View>
      </ScrollView>
    </View>
  );
}

