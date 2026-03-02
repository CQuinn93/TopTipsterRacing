import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { displayHorseName } from '@/lib/displayHorseName';
import { decimalToFractional } from '@/lib/oddsFormat';
import { getLatestResultsForUser } from '@/lib/latestResultsCache';
import type { MeetingResults, RaceResultTemplate } from '@/lib/resultsTemplateForUser';
import { useRealtimeRaces } from '@/lib/useRealtimeRaces';

export default function ResultsScreen() {
  const theme = useTheme();
  const { userId } = useAuth();
  const [compIds, setCompIds] = useState<string[]>([]);
  const [meetingResults, setMeetingResults] = useState<MeetingResults[]>([]);
  const [selectedMeetingCourse, setSelectedMeetingCourse] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  const [meetingDropdownOpen, setMeetingDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState<number | null>(null);
  /** Race api_race_ids currently shown; used by Realtime to refetch when results land. */
  const [resultsRaceApiIds, setResultsRaceApiIds] = useState<string[]>([]);

  const loadResults = useCallback(
    async (forceRefresh = false) => {
      if (!userId) return;
      const { data: parts } = await supabase
        .from('competition_participants')
        .select('competition_id')
        .eq('user_id', userId);
      const ids = (parts ?? []).map((p: { competition_id: string }) => p.competition_id);
      setCompIds(ids);
      if (ids.length === 0) {
        setMeetingResults([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      const results = await getLatestResultsForUser(supabase, userId, ids, forceRefresh);
      setMeetingResults(results);
      if (results.length > 0 && !selectedMeetingCourse) {
        setSelectedMeetingCourse(results[0].course);
      }
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
  }, [userId]);

  useEffect(() => {
    if (meetingResults.length === 0) {
      setResultsRaceApiIds([]);
      return;
    }
    setResultsRaceApiIds(meetingResults.flatMap((m) => m.races.map((r) => r.raceId)));
    const courses = meetingResults.map((m) => m.course);
    setSelectedMeetingCourse((prev) => (prev && courses.includes(prev) ? prev : meetingResults[0].course));
    setSelectedRaceIndex(0);
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

  const currentMeeting = meetingResults.find((m) => m.course === selectedMeetingCourse);
  const racesForSelectedDate = useMemo(() => {
    if (!currentMeeting || !selectedDate) return [];
    return currentMeeting.races.filter((r) => r.raceTimeUtc.slice(0, 10) === selectedDate);
  }, [currentMeeting, selectedDate]);
  const races = racesForSelectedDate;
  const selectedRace: RaceResultTemplate | null = races[selectedRaceIndex] ?? races[0] ?? null;

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
      meetingDropdown: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.surface,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        marginBottom: theme.spacing.sm,
      },
      meetingDropdownText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 15,
        color: theme.colors.text,
      },
      meetingDropdownChevron: { fontSize: 12, color: theme.colors.textMuted },
      modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: theme.spacing.lg,
      },
      modalContent: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: theme.spacing.sm,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
      },
      meetingOption: {
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
      },
      meetingOptionText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 16,
        color: theme.colors.text,
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
      raceTabsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: theme.spacing.sm,
        gap: theme.spacing.sm,
      },
      raceTabWrap: { flexDirection: 'row', alignItems: 'center' },
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
        borderRadius: theme.radius.lg,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.lg,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
        overflow: 'hidden',
      },
      resultCardRaceName: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 18,
        color: theme.colors.text,
        fontWeight: '600',
        marginBottom: theme.spacing.sm,
      },
      resultCardTime: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.md,
      },
      runnerCardList: { gap: theme.spacing.sm },
      runnerCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        minHeight: 56,
      },
      runnerCardEarned: {
        borderLeftWidth: 4,
        borderLeftColor: theme.colors.accent,
        backgroundColor: theme.colors.accentMuted,
      },
      runnerCardPosition: {
        width: 44,
        alignItems: 'center',
        justifyContent: 'center',
      },
      runnerCardPositionBadge: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        fontWeight: '700',
        color: theme.colors.textSecondary,
      },
      runnerCardPositionWon: { color: theme.colors.accent },
      runnerCardCenter: { flex: 1, minWidth: 0, marginLeft: theme.spacing.sm },
      runnerCardName: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 16,
        color: theme.colors.text,
        fontWeight: '500',
      },
      runnerCardOdds: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 15,
        color: theme.colors.textSecondary,
        marginLeft: theme.spacing.sm,
      },
      awaitingRow: {
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      awaitingText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 15,
        color: theme.colors.textMuted,
        textAlign: 'center',
      },
      yourSelection: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.textMuted,
        marginTop: theme.spacing.md,
        paddingTop: theme.spacing.sm,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.border,
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
          <TouchableOpacity
            style={styles.meetingDropdown}
            onPress={() => setMeetingDropdownOpen(true)}
          >
            <Text style={styles.meetingDropdownText}>{selectedMeetingCourse ?? 'Select meeting'}</Text>
            <Text style={styles.meetingDropdownChevron}>▼</Text>
          </TouchableOpacity>
          <Modal visible={meetingDropdownOpen} transparent animationType="fade">
            <Pressable style={styles.modalOverlay} onPress={() => setMeetingDropdownOpen(false)}>
              <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                {meetingResults.map((m) => (
                  <TouchableOpacity
                    key={m.course}
                    style={styles.meetingOption}
                    onPress={() => {
                      setSelectedMeetingCourse(m.course);
                      setSelectedRaceIndex(0);
                      setMeetingDropdownOpen(false);
                    }}
                  >
                    <Text style={styles.meetingOptionText}>{m.course}</Text>
                  </TouchableOpacity>
                ))}
              </Pressable>
            </Pressable>
          </Modal>

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
                      onPress={() => {
                        setSelectedDate(d);
                        setSelectedRaceIndex(0);
                      }}
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

          {races.length > 0 && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.raceTabsRow}>
                {races.map((r, i) => (
                  <TouchableOpacity
                    key={r.raceId}
                    style={[styles.raceTab, selectedRaceIndex === i && styles.raceTabActive]}
                    onPress={() => setSelectedRaceIndex(i)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.raceTabText, selectedRaceIndex === i && styles.raceTabTextActive]}>
                      {new Date(r.raceTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {selectedRace && (() => {
                const fullResult = selectedRace.fullResult ?? [];
                const awaiting = fullResult.length === 0;

                return (
                  <View style={styles.resultCard}>
                    <Text style={styles.resultCardRaceName}>{selectedRace.raceName}</Text>
                    <Text style={styles.resultCardTime}>
                      {new Date(selectedRace.raceTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {awaiting ? (
                      <View style={styles.awaitingRow}>
                        <Text style={styles.awaitingText}>Awaiting results</Text>
                      </View>
                    ) : (
                      <View style={styles.runnerCardList}>
                        {fullResult.map((r, idx) => (
                          <View
                            key={`${r.label}-${r.name}-${idx}`}
                            style={[styles.runnerCard, r.earnedPoints && styles.runnerCardEarned]}
                          >
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
                            <Text style={styles.runnerCardOdds}>{decimalToFractional(r.sp)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    <Text style={styles.yourSelection}>Your selection: {displayHorseName(selectedRace.userSelection)}</Text>
                  </View>
                );
              })()}
            </>
          )}

          {currentMeeting && races.length === 0 && availableDates.length > 0 && selectedDate && (
            <View style={styles.resultCard}>
              <Text style={styles.awaitingText}>
                No races at {currentMeeting.course} on {formatDateLabel(selectedDate)}.
              </Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

