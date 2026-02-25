import { useEffect, useState, useCallback } from 'react';
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
import { theme } from '@/constants/theme';
import { displayHorseName } from '@/lib/displayHorseName';
import { getLatestResultsForUser } from '@/lib/latestResultsCache';
import type { MeetingResults, RaceResultTemplate } from '@/lib/resultsTemplateForUser';

export default function ResultsScreen() {
  const { userId } = useAuth();
  const [compIds, setCompIds] = useState<string[]>([]);
  const [meetingResults, setMeetingResults] = useState<MeetingResults[]>([]);
  const [selectedMeetingCourse, setSelectedMeetingCourse] = useState<string | null>(null);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  const [meetingDropdownOpen, setMeetingDropdownOpen] = useState(false);
  const [showFullResult, setShowFullResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    setRefreshing(true);
    loadResults(true);
  }, [loadResults]);

  useEffect(() => {
    setLoading(true);
    loadResults(false);
  }, [userId]);

  useEffect(() => {
    if (meetingResults.length > 0) {
      const courses = meetingResults.map((m) => m.course);
      setSelectedMeetingCourse((prev) => (prev && courses.includes(prev) ? prev : meetingResults[0].course));
      setSelectedRaceIndex(0);
      setShowFullResult(false);
    }
  }, [meetingResults]);

  useEffect(() => {
    setShowFullResult(false);
  }, [selectedRaceIndex]);

  const currentMeeting = meetingResults.find((m) => m.course === selectedMeetingCourse);
  const races = currentMeeting?.races ?? [];
  const selectedRace: RaceResultTemplate | null = races[selectedRaceIndex] ?? races[0] ?? null;

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

          {races.length > 0 && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.raceTabsRow}>
                {races.map((r, i) => (
                  <View key={r.raceId} style={styles.raceTabWrap}>
                    {i > 0 && <Text style={styles.raceTabSeparator}> / </Text>}
                    <TouchableOpacity
                      style={[styles.raceTab, selectedRaceIndex === i && styles.raceTabActive]}
                      onPress={() => setSelectedRaceIndex(i)}
                    >
                      <Text style={[styles.raceTabText, selectedRaceIndex === i && styles.raceTabTextActive]}>
                        {new Date(r.raceTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>

              {selectedRace && (() => {
                const fullResult = selectedRace.fullResult ?? [];
                const previewRows = fullResult.slice(0, 4);
                const displayRows = showFullResult ? fullResult : previewRows;
                const hasMore = fullResult.length > 4;
                const awaiting = fullResult.length === 0;

                return (
                  <View style={styles.resultCard}>
                    <Text style={styles.resultCardRaceName}>{selectedRace.raceName}</Text>
                    <View style={styles.placesTable}>
                      {awaiting
                        ? [
                            { label: '1st', value: selectedRace.place1 ?? 'Awaiting results', earnedPoints: false },
                            { label: '2nd', value: selectedRace.place2 ?? 'Awaiting results', earnedPoints: false },
                            { label: '3rd', value: selectedRace.place3 ?? 'Awaiting results', earnedPoints: false },
                            { label: '4th', value: selectedRace.place4 ?? 'Awaiting results', earnedPoints: false },
                          ].map((r, idx) => (
                            <View
                              key={r.label}
                              style={[styles.placesTableRow, idx === 3 && styles.placesTableRowLast]}
                            >
                              <Text style={styles.placesTableLabel}>{r.label}</Text>
                              <Text style={styles.placesTableValue}>{r.value}</Text>
                            </View>
                          ))
                        : displayRows.map((r, idx) => (
                            <View
                              key={`${r.label}-${r.name}-${idx}`}
                              style={[
                                styles.placesTableRow,
                                idx === displayRows.length - 1 && styles.placesTableRowLast,
                                r.earnedPoints && styles.placesTableRowEarned,
                              ]}
                            >
                              <Text style={styles.placesTableLabel}>{r.label}</Text>
                              <Text style={styles.placesTableValue}>
                                {displayHorseName(r.name)} (SP {r.sp})
                              </Text>
                            </View>
                          ))}
                    </View>
                    {hasMore && (
                      <TouchableOpacity
                        style={styles.viewFullResultButton}
                        onPress={() => setShowFullResult((v) => !v)}
                      >
                        <Text style={styles.viewFullResultText}>
                          {showFullResult ? 'Hide full result' : 'View full result'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <Text style={styles.yourSelection}>Your selection: {displayHorseName(selectedRace.userSelection)}</Text>
                  </View>
                );
              })()}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
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
  raceTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  raceTabWrap: { flexDirection: 'row', alignItems: 'center' },
  raceTabSeparator: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 16,
    color: theme.colors.black,
    marginHorizontal: theme.spacing.xs,
    opacity: 0.7,
  },
  raceTab: { paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm },
  raceTabActive: {},
  raceTabText: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 16,
    color: theme.colors.black,
    opacity: 0.8,
  },
  raceTabTextActive: { color: theme.colors.black, fontWeight: '600', opacity: 1 },
  resultCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resultCardRaceName: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 18,
    color: theme.colors.text,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  placesTable: {
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
  },
  placesTableRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  placesTableRowLast: { borderBottomWidth: 0 },
  placesTableRowEarned: { backgroundColor: theme.colors.accentMuted },
  viewFullResultButton: { paddingVertical: theme.spacing.sm, marginBottom: theme.spacing.xs },
  viewFullResultText: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 14,
    color: theme.colors.accent,
  },
  placesTableLabel: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 14,
    color: theme.colors.textSecondary,
    width: 44,
  },
  placesTableValue: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
  },
  yourSelection: {
    fontFamily: theme.fontFamily.polygonItalic,
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
});
