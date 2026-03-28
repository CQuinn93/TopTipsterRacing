import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { displayHorseName } from '@/lib/displayHorseName';
import { decimalToFractional } from '@/lib/oddsFormat';
import { POSITION_POINTS } from '@/lib/appUtils';
import { isSelectionClosed } from '@/lib/appUtils';
import { getLatestResultsForUser } from '@/lib/latestResultsCache';
import type { MeetingResults, RaceResultTemplate } from '@/lib/resultsTemplateForUser';
import { useRealtimeRaces } from '@/lib/useRealtimeRaces';

const RESULTS_COMP_IDS_TTL_MS = 60 * 1000; // 1 min – avoid refetching competition_participants on every load
const RESULTS_VISIT_REFRESH_COOLDOWN_MS = 30 * 1000; // avoid repeat refreshes on rapid revisits
let resultsCompIdsCache: { userId: string; compIds: string[]; fetchedAt: number } | null = null;

export default function ResultsScreen() {
  const theme = useTheme();
  const { userId } = useAuth();
  const [compIds, setCompIds] = useState<string[]>([]);
  const [meetingResults, setMeetingResults] = useState<MeetingResults[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedRaceByCourse, setSelectedRaceByCourse] = useState<Record<string, number>>({});
  const [expandedRunnerKey, setExpandedRunnerKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState<number | null>(null);
  const [lastVisitRefreshAt, setLastVisitRefreshAt] = useState<number | null>(null);
  /** Race api_race_ids currently shown; used by Realtime to refetch when results land. */
  const [resultsRaceApiIds, setResultsRaceApiIds] = useState<string[]>([]);

  const loadResults = useCallback(
    async (forceRefresh = false) => {
      if (!userId) return;
      let ids: string[];
      if (
        !forceRefresh &&
        resultsCompIdsCache?.userId === userId &&
        Date.now() - resultsCompIdsCache.fetchedAt < RESULTS_COMP_IDS_TTL_MS
      ) {
        ids = resultsCompIdsCache.compIds;
      } else {
        const { data: parts } = await supabase
          .from('competition_participants')
          .select('competition_id')
          .eq('user_id', userId);
        ids = (parts ?? []).map((p: { competition_id: string }) => p.competition_id);
        resultsCompIdsCache = { userId, compIds: ids, fetchedAt: Date.now() };
      }
      setCompIds(ids);
      if (ids.length === 0) {
        setMeetingResults([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const results = await getLatestResultsForUser(supabase, userId, ids, forceRefresh);
      setMeetingResults(results);
      setLoading(false);
      setRefreshing(false);
    },
    [userId]
  );

  const onRefresh = useCallback(() => {
    if (refreshing) return;
    const now = Date.now();
    if (lastManualRefreshAt != null && now - lastManualRefreshAt < 30_000) return;
    setLastManualRefreshAt(now);
    setRefreshing(true);
    loadResults(true);
  }, [loadResults, lastManualRefreshAt, refreshing]);

  useEffect(() => {
    setLoading(true);
    loadResults(false);
  }, [userId, loadResults]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      const now = Date.now();
      if (lastVisitRefreshAt != null && now - lastVisitRefreshAt < RESULTS_VISIT_REFRESH_COOLDOWN_MS) {
        return;
      }
      setLastVisitRefreshAt(now);
      // On screen visit we auto-refresh (non-forced; cache rules still apply).
      loadResults(false);
    }, [userId, lastVisitRefreshAt, loadResults])
  );

  useEffect(() => {
    if (meetingResults.length === 0) {
      setResultsRaceApiIds([]);
      return;
    }
    setResultsRaceApiIds(meetingResults.flatMap((m) => m.races.map((r) => r.raceId)));
    const today = new Date().toISOString().slice(0, 10);
    const dates = new Set<string>();
    meetingResults.forEach((m) =>
      m.races.forEach((r) => {
        const d = r.raceTimeUtc.slice(0, 10);
        if (d <= today) dates.add(d);
      })
    );
    const sortedDates = [...dates].sort((a, b) => b.localeCompare(a));
    setSelectedDate((prev) => {
      if (!prev) return sortedDates.includes(today) ? today : sortedDates[0];
      if (!sortedDates.includes(prev)) return sortedDates.includes(today) ? today : sortedDates[0];
      return prev;
    });
  }, [meetingResults]);

  useRealtimeRaces(resultsRaceApiIds, () => loadResults(true));

  useEffect(() => {
    setSelectedRaceByCourse({});
    setExpandedRunnerKey(null);
  }, [selectedDate]);

  const getPointsForRunner = (
    r: { position: number | null; earnedPoints: boolean },
    placedPositions: number[]
  ): number => {
    if (r.position == null || !placedPositions.includes(r.position)) return POSITION_POINTS.lost;
    if (r.position === 1) return POSITION_POINTS.won;
    return POSITION_POINTS.place;
  };

  const availableDates = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const dates = new Set<string>();
    meetingResults.forEach((m) =>
      m.races.forEach((r) => {
        const d = r.raceTimeUtc.slice(0, 10);
        if (d <= today) dates.add(d);
      })
    );
    return [...dates].sort((a, b) => b.localeCompare(a));
  }, [meetingResults]);

  const racesGroupedByMeeting = useMemo(() => {
    if (!selectedDate) return [];
    return meetingResults
      .map((m) => ({
        course: m.course,
        races: m.races
          .filter((r) => r.raceTimeUtc.slice(0, 10) === selectedDate)
          .sort((a, b) => a.raceTimeUtc.localeCompare(b.raceTimeUtc)),
      }))
      .filter((g) => g.races.length > 0)
      .sort((a, b) => a.course.localeCompare(b.course));
  }, [meetingResults, selectedDate]);

  const formatDateLabel = (dateStr: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const d = new Date(dateStr + 'T12:00:00');
    if (dateStr === today) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const styles = useMemo(() => {
    const isLight = theme.colors.background === lightTheme.colors.background;
    const cardBorder = isLight ? theme.colors.white : theme.colors.border;
    const cardBorderWidth = isLight ? 2 : 1;
    return StyleSheet.create({
      container: { flex: 1, backgroundColor: theme.colors.background },
      content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
      centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
      title: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 20,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: theme.spacing.xs,
      },
      subtitle: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.md,
      },
      muted: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 14,
        color: theme.colors.textMuted,
      },
      groupSection: {
        marginBottom: theme.spacing.md,
      },
      groupHeader: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 15,
        fontWeight: '600',
        color: theme.colors.accent,
        marginBottom: theme.spacing.xs,
      },
      dateFilterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: theme.spacing.md,
        gap: theme.spacing.xs,
      },
      dateFilterLabel: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.textMuted,
        marginRight: theme.spacing.xs,
      },
      datePillScroll: { marginHorizontal: -theme.spacing.md },
      datePillContent: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs,
      },
      datePill: {
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      datePillSelected: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
      },
      datePillText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 14,
        color: theme.colors.text,
      },
      datePillTextSelected: {
        color: theme.colors.black,
        fontWeight: '600',
      },
      raceTabsScroll: { marginBottom: theme.spacing.sm },
      raceTabsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: theme.spacing.sm,
      },
      raceTab: {
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.lg,
        borderWidth: 2,
        borderColor: theme.colors.border,
        backgroundColor: 'transparent',
      },
      raceTabActive: {
        borderColor: theme.colors.accent,
        backgroundColor: 'transparent',
      },
      raceTabText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 15,
        color: theme.colors.text,
      },
      raceTabTextActive: {
        color: theme.colors.accent,
        fontWeight: '600',
      },
      resultCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        marginBottom: theme.spacing.md,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
        overflow: 'hidden',
        justifyContent: 'center',
      },
      resultCardRaceName: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 16,
        color: theme.colors.text,
        fontWeight: '600',
        marginBottom: theme.spacing.xs,
      },
      resultCardTime: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.sm,
      },
      runnerCardList: { gap: theme.spacing.xs },
      runnerCard: {
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        minHeight: 44,
      },
      runnerCardRow: {
        flexDirection: 'row',
        alignItems: 'center',
      },
      runnerCardChevron: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 10,
        color: theme.colors.textMuted,
        marginLeft: theme.spacing.xs,
      },
      runnerCardPointsBlock: {
        marginTop: theme.spacing.xs,
        paddingTop: theme.spacing.xs,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.border,
      },
      runnerCardThreeBoxRow: {
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: theme.spacing.sm,
      },
      runnerCardPointsBox: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xs,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
      },
      runnerCardPointsLabel: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        color: theme.colors.textMuted,
      },
      runnerCardPointsValue: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.accent,
      },
      runnerCardEarned: {
        borderLeftWidth: 4,
        borderLeftColor: theme.colors.accent,
        backgroundColor: theme.colors.accentMuted,
      },
      runnerCardPosition: {
        width: 36,
        alignItems: 'center',
        justifyContent: 'center',
      },
      runnerCardPositionBadge: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.textSecondary,
      },
      runnerCardPositionWon: { color: theme.colors.accent },
      runnerCardCenter: { flex: 1, minWidth: 0, marginLeft: theme.spacing.xs },
      runnerCardName: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 14,
        color: theme.colors.text,
        fontWeight: '500',
      },
      runnerCardTotalPts: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.accent,
        marginLeft: theme.spacing.xs,
      },
      awaitingRow: {
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      awaitingText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.textMuted,
        textAlign: 'center',
      },
      yourSelectionSection: {
        marginTop: theme.spacing.sm,
        marginBottom: theme.spacing.md,
      },
      yourSelectionLabel: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.xs,
      },
      yourSelectionCard: {
        backgroundColor: theme.colors.accent,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
      },
      yourSelectionCardText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.white,
        fontWeight: '600',
        textAlign: 'center',
      },
      resultSectionLabel: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.xs,
      },
    });
  }, [theme]);

  if (loading && meetingResults.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
    >
      <Text style={styles.title}>Results</Text>
      <Text style={styles.subtitle}>Race results for your competitions. Pull to refresh.</Text>

      {meetingResults.length === 0 ? (
        <Text style={styles.muted}>Join a competition and make selections to see results here.</Text>
      ) : (
        <>
          {availableDates.length > 0 && selectedDate && (
            <View style={styles.dateFilterRow}>
              <Text style={styles.dateFilterLabel}>Date</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.datePillScroll}
                contentContainerStyle={styles.datePillContent}
              >
                {availableDates.map((d) => {
                  const isSelected = d === selectedDate;
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[styles.datePill, isSelected && styles.datePillSelected]}
                      onPress={() => setSelectedDate(d)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.datePillText, isSelected && styles.datePillTextSelected]}>
                        {formatDateLabel(d)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {racesGroupedByMeeting.map((group) => {
            const selectedIdx = selectedRaceByCourse[group.course] ?? 0;
            const selectedRace = group.races[selectedIdx] ?? group.races[0] ?? null;
            return (
              <View key={group.course} style={styles.groupSection}>
                <Text style={styles.groupHeader}>{group.course}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.raceTabsRow}
                  style={styles.raceTabsScroll}
                >
                  {group.races.map((race, i) => {
                    const isSelected = selectedIdx === i;
                    return (
                      <TouchableOpacity
                        key={race.raceId}
                        style={[styles.raceTab, isSelected && styles.raceTabActive]}
                        onPress={() => {
                          setSelectedRaceByCourse((prev) => ({ ...prev, [group.course]: i }));
                          setExpandedRunnerKey(null);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.raceTabText, isSelected && styles.raceTabTextActive]}>
                          {new Date(race.raceTimeUtc).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {selectedRace && (() => {
                  const fullResult = selectedRace.fullResult ?? [];
                  const awaiting = fullResult.length === 0;
                  const userSelectionName = (selectedRace.userSelection ?? '').trim();
                  const isFavPlaceholder = userSelectionName.toUpperCase() === 'FAV';
                  const hasUserSelection = userSelectionName.length > 0 && !isFavPlaceholder;
                  const isOpenForSelection = !isSelectionClosed(selectedRace.raceTimeUtc);
                  const yourSelectionText = hasUserSelection
                    ? displayHorseName(userSelectionName)
                    : isOpenForSelection
                      ? 'Awaiting selection'
                      : (isFavPlaceholder ? 'FAV' : 'No selection made');
                  return (
                    <View style={styles.resultCard}>
                      <Text style={styles.resultCardRaceName}>{selectedRace.raceName}</Text>
                      <Text style={styles.resultCardTime}>
                        {new Date(selectedRace.raceTimeUtc).toLocaleTimeString(undefined, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      <View style={styles.yourSelectionSection}>
                        <Text style={styles.yourSelectionLabel}>Your selection</Text>
                        <View style={styles.yourSelectionCard}>
                          <Text style={styles.yourSelectionCardText}>{yourSelectionText}</Text>
                        </View>
                      </View>
                      <Text style={styles.resultSectionLabel}>Result</Text>
                      {awaiting ? (
                        <View style={styles.awaitingRow}>
                          <Text style={styles.awaitingText}>Awaiting results</Text>
                        </View>
                      ) : (
                        <View style={styles.runnerCardList}>
                          {fullResult.map((r, idx) => {
                            const runnerKey = `${selectedRace.raceId}-${idx}`;
                            const isExpanded = expandedRunnerKey === runnerKey;
                            const points = getPointsForRunner(r, selectedRace.placedPositions ?? []);
                            return (
                              <TouchableOpacity
                                key={`${r.label}-${r.name}-${idx}`}
                                style={[styles.runnerCard, r.earnedPoints && styles.runnerCardEarned]}
                                onPress={() =>
                                  setExpandedRunnerKey((prev) => (prev === runnerKey ? null : runnerKey))
                                }
                                activeOpacity={0.8}
                              >
                                <View style={styles.runnerCardRow}>
                                  <View style={styles.runnerCardPosition}>
                                    <Text
                                      style={[
                                        styles.runnerCardPositionBadge,
                                        r.position === 1 && styles.runnerCardPositionWon,
                                      ]}
                                    >
                                      {r.label}
                                    </Text>
                                  </View>
                                  <View style={styles.runnerCardCenter}>
                                    <Text style={styles.runnerCardName} numberOfLines={1}>
                                      {displayHorseName(r.name)}
                                    </Text>
                                  </View>
                                  <Text style={styles.runnerCardTotalPts}>
                                    {(r.pos_points ?? points) + (r.sp_points ?? 0)} pts
                                  </Text>
                                  <Text style={styles.runnerCardChevron}>{isExpanded ? '▲' : '▼'}</Text>
                                </View>
                                {isExpanded && (
                                  <View style={styles.runnerCardPointsBlock}>
                                    <View style={styles.runnerCardThreeBoxRow}>
                                      <View style={styles.runnerCardPointsBox}>
                                        <Text style={styles.runnerCardPointsLabel}>Pos points</Text>
                                        <Text style={styles.runnerCardPointsValue}>
                                          {r.pos_points != null ? r.pos_points : points}
                                        </Text>
                                      </View>
                                      <View style={styles.runnerCardPointsBox}>
                                        <Text style={styles.runnerCardPointsLabel}>SP</Text>
                                        <Text style={styles.runnerCardPointsValue}>{decimalToFractional(r.sp)}</Text>
                                      </View>
                                      <View style={styles.runnerCardPointsBox}>
                                        <Text style={styles.runnerCardPointsLabel}>Bonus points</Text>
                                        <Text style={styles.runnerCardPointsValue}>
                                          {r.sp_points != null ? r.sp_points : 0}
                                        </Text>
                                      </View>
                                    </View>
                                  </View>
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                })()}
              </View>
            );
          })}

          {racesGroupedByMeeting.length === 0 && availableDates.length > 0 && selectedDate && (
            <View style={styles.resultCard}>
              <Text style={styles.awaitingText}>No races on {formatDateLabel(selectedDate)}.</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}
