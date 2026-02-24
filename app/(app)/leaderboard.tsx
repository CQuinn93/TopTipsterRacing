import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

const POINTS_PER_ODDS = 10; // round(oddsDecimal * 10) per selection

const RANK_COLORS = {
  1: theme.colors.accent,
  2: '#eab308',
  3: '#06b6d4',
} as const;

export default function LeaderboardScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const { userId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ competitionId?: string }>();
  const competitionId = params.competitionId as string | undefined;

  const [selectedId, setSelectedId] = useState<string | undefined>(competitionId);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [raceDates, setRaceDates] = useState<string[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (competitionId) setSelectedId(competitionId);
  }, [competitionId]);

  const loadLeaderboard = async () => {
    if (!selectedId) return;
    const now = new Date();
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
      setLastUpdated(now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) + ', ' + now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLeaderboard();
  }, [selectedId]);

  useEffect(() => {
    const loop = () => {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]).start(() => loop());
    };
    loop();
  }, [pulseAnim]);

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

  const contentWidth = Math.min(screenWidth - 2 * PADDING_H, 500);

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
          <View style={styles.headerBlock}>
            <Text style={styles.rankTitle}>Rank</Text>
            {lastUpdated && (
              <Text style={styles.lastUpdated}>Last updated: {lastUpdated}</Text>
            )}
          </View>

          {rows.length > 0 && (
              <View style={[styles.listWrap, { width: contentWidth }]}>
                {listRows.map((item) => {
                  const rank = item.rank_overall;
                  const isExpanded = expandedUserId === item.user_id;
                  const isTopDaily = item.rank_daily === 1;
                  const isTopSp = item.rank_odds === 1;
                  const circleColor = rank <= 3 ? RANK_COLORS[rank as 1 | 2 | 3] : theme.colors.border;
                  const rankNum = String(rank).padStart(2, '0');

                  return (
                    <View key={item.user_id} style={styles.listRowWrap}>
                      {isTopSp ? (
                        <View style={styles.listRowPulseWrap}>
                          <TouchableOpacity
                            style={[
                              styles.listRow,
                              item.user_id === userId && styles.rowHighlight,
                              isTopDaily && styles.listRowGreenOutline,
                            ]}
                            onPress={() => setExpandedUserId(isExpanded ? null : item.user_id)}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.rankCircle, { backgroundColor: circleColor }]}>
                              <Text style={[styles.rankCircleText, rank > 3 && styles.rankCircleTextMuted]}>{rankNum}</Text>
                            </View>
                            <View style={styles.listRowCenter}>
                              <Text style={styles.listRowName} numberOfLines={1}>{item.display_name}</Text>
                              {!isExpanded && (
                                <Text style={styles.listRowTotal}>{item.total} pts</Text>
                              )}
                              {isExpanded && (
                                <View style={styles.expandedStats}>
                                  <View style={styles.expandedStat}>
                                    <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
                                    <Text style={styles.expandedStatValue}>{getDailyPoints(item)}</Text>
                                    <Text style={styles.expandedStatLabel}>Daily</Text>
                                  </View>
                                  <View style={styles.expandedStat}>
                                    <Ionicons name="trophy-outline" size={18} color={theme.colors.textMuted} />
                                    <Text style={styles.expandedStatValue}>{item.total}</Text>
                                    <Text style={styles.expandedStatLabel}>Overall</Text>
                                  </View>
                                  <View style={styles.expandedStat}>
                                    <Ionicons name="flash-outline" size={18} color={theme.colors.textMuted} />
                                    <Text style={styles.expandedStatValue}>{item.max_odds > 0 ? item.max_odds.toFixed(2) : '—'}</Text>
                                    <Text style={styles.expandedStatLabel}>Best SP</Text>
                                  </View>
                                </View>
                              )}
                            </View>
                            {!isExpanded && (
                              <Text style={styles.listRowTotalRight}>{item.total}</Text>
                            )}
                          </TouchableOpacity>
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              StyleSheet.absoluteFill,
                              styles.pulseBorderOverlay,
                              { opacity: pulseAnim },
                            ]}
                          />
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.listRow,
                            item.user_id === userId && styles.rowHighlight,
                            isTopDaily && styles.listRowGreenOutline,
                          ]}
                          onPress={() => setExpandedUserId(isExpanded ? null : item.user_id)}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.rankCircle, { backgroundColor: circleColor }]}>
                            <Text style={[styles.rankCircleText, rank > 3 && styles.rankCircleTextMuted]}>{rankNum}</Text>
                          </View>
                          <View style={styles.listRowCenter}>
                            <Text style={styles.listRowName} numberOfLines={1}>{item.display_name}</Text>
                            {!isExpanded && (
                              <Text style={styles.listRowTotal}>{item.total} pts</Text>
                            )}
                            {isExpanded && (
                              <View style={styles.expandedStats}>
                                <View style={styles.expandedStat}>
                                  <Ionicons name="calendar-outline" size={18} color={theme.colors.textMuted} />
                                  <Text style={styles.expandedStatValue}>{getDailyPoints(item)}</Text>
                                  <Text style={styles.expandedStatLabel}>Daily</Text>
                                </View>
                                <View style={styles.expandedStat}>
                                  <Ionicons name="trophy-outline" size={18} color={theme.colors.textMuted} />
                                  <Text style={styles.expandedStatValue}>{item.total}</Text>
                                  <Text style={styles.expandedStatLabel}>Overall</Text>
                                </View>
                                <View style={styles.expandedStat}>
                                  <Ionicons name="flash-outline" size={18} color={theme.colors.textMuted} />
                                  <Text style={styles.expandedStatValue}>{item.max_odds > 0 ? item.max_odds.toFixed(2) : '—'}</Text>
                                  <Text style={styles.expandedStatLabel}>Best SP</Text>
                                </View>
                              </View>
                            )}
                          </View>
                          {!isExpanded && (
                            <Text style={styles.listRowTotalRight}>{item.total}</Text>
                          )}
                        </TouchableOpacity>
                      )}
                      {isExpanded && (
                        <TouchableOpacity
                          style={styles.seeSelectionsButton}
                          onPress={() => openParticipantSelections(item)}
                        >
                          <Text style={styles.seeSelectionsButtonText}>See selections</Text>
                          <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
          )}
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
  headerBlock: { width: '100%', paddingHorizontal: PADDING_H, marginBottom: theme.spacing.sm },
  rankTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.accent,
  },
  lastUpdated: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
  rowHighlight: { backgroundColor: theme.colors.accentMuted },
  listWrap: { paddingHorizontal: PADDING_H },
  listRowWrap: { marginBottom: theme.spacing.sm },
  listRowPulseWrap: {
    position: 'relative',
    borderRadius: theme.radius.md,
  },
  pulseBorderOverlay: {
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: 'transparent',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  listRowGreenOutline: { borderColor: theme.colors.accent },
  rankCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  rankCircleText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.black,
  },
  rankCircleTextMuted: { color: theme.colors.textMuted },
  listRowCenter: { flex: 1 },
  listRowName: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  listRowTotal: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  listRowTotalRight: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.accent,
  },
  expandedStats: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-around',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  expandedStat: { alignItems: 'center' },
  expandedStatValue: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  expandedStatLabel: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  seeSelectionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  seeSelectionsButtonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.accent,
    fontWeight: '600',
  },
});
