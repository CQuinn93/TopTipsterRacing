import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Modal, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { fetchAvailableRacesForUser, type AvailableRaceDay } from '@/lib/availableRacesForUser';
import { fetchResultsTemplateForUser, type MeetingResults, type RaceResultTemplate } from '@/lib/resultsTemplateForUser';
import type { Database } from '@/types/database';

const SELECTION_CLOSE_HOURS_BEFORE_FIRST = 1;

function getSelectionDeadlineMs(firstRaceUtc: string): number {
  const first = new Date(firstRaceUtc).getTime();
  return first - SELECTION_CLOSE_HOURS_BEFORE_FIRST * 60 * 60 * 1000;
}

function isSelectionClosed(firstRaceUtc: string): boolean {
  return Date.now() >= getSelectionDeadlineMs(firstRaceUtc);
}

function formatTimeUntilDeadline(firstRaceUtc: string): string {
  const deadlineMs = getSelectionDeadlineMs(firstRaceUtc);
  const left = deadlineMs - Date.now();
  if (left <= 0) return 'Closed';
  const hours = Math.floor(left / (60 * 60 * 1000));
  const mins = Math.floor((left % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${mins}m left`;
  if (mins > 0) return `${mins}m left`;
  return 'Closing soon';
}

type Participant = Database['public']['Tables']['competition_participants']['Row'];

export default function HomeScreen() {
  const { userId } = useAuth();
  const [participations, setParticipations] = useState<Participant[]>([]);
  const [availableRaces, setAvailableRaces] = useState<AvailableRaceDay[]>([]);
  const [meetingResults, setMeetingResults] = useState<MeetingResults[]>([]);
  const [selectedMeetingCourse, setSelectedMeetingCourse] = useState<string | null>(null);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  const [meetingDropdownOpen, setMeetingDropdownOpen] = useState(false);
  const [showFullResult, setShowFullResult] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      const { data: partData } = await supabase
        .from('competition_participants')
        .select('id, competition_id, display_name')
        .eq('user_id', userId);
      if (partData) setParticipations(partData);

      if (partData?.length) {
        const compIds = partData.map((p) => p.competition_id);
        const { data: comps } = await supabase.from('competitions').select('id, name').in('id', compIds);
        const compByName = new Map((comps ?? []).map((c) => [c.id, c.name]));
        const [available, template] = await Promise.all([
          fetchAvailableRacesForUser(supabase, userId, compIds, compByName),
          fetchResultsTemplateForUser(supabase, userId, compIds),
        ]);
        setAvailableRaces(available);
        setMeetingResults(template);
      } else {
        setAvailableRaces([]);
        setMeetingResults([]);
        setSelectedMeetingCourse(null);
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [userId]);

  useEffect(() => {
    if (meetingResults.length === 0) return;
    const courses = meetingResults.map((m) => m.course);
    setSelectedMeetingCourse((prev) => (prev && courses.includes(prev) ? prev : meetingResults[0].course));
    setSelectedRaceIndex(0);
    setShowFullResult(false);
  }, [meetingResults]);

  useEffect(() => {
    setShowFullResult(false);
  }, [selectedRaceIndex]);

  const currentMeeting = meetingResults.find((m) => m.course === selectedMeetingCourse);
  const races = currentMeeting?.races ?? [];
  const selectedRace: RaceResultTemplate | null = races[selectedRaceIndex] ?? races[0] ?? null;

  const hasOpenCards = availableRaces.some((item) => !isSelectionClosed(item.firstRaceUtc));
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!hasOpenCards) return;
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [hasOpenCards]);

  const hasJoinedAny = participations.length > 0;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.colors.accent} />}
      >
        <Text style={styles.title}>Cheltenham Top Tipster</Text>
        <Text style={styles.subtitle}>Make your daily picks and climb the leaderboard</Text>

        {!hasJoinedAny && (
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(auth)/access-code')}>
            <Text style={styles.primaryButtonText}>Enter competition (access code)</Text>
          </TouchableOpacity>
        )}

        {/* Section 1: My available races */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My available races</Text>
          {availableRaces.length === 0 && hasJoinedAny && (
            <Text style={styles.cardMeta}>No races need your picks right now</Text>
          )}
          {availableRaces.length === 0 && !hasJoinedAny && (
            <Text style={styles.cardMeta}>Join a competition to make selections</Text>
          )}
          {availableRaces.map((item) => {
            const closed = isSelectionClosed(item.firstRaceUtc);
            return (
              <TouchableOpacity
                key={`${item.competitionId}-${item.raceDate}`}
                style={[styles.card, closed && styles.cardClosed]}
                onPress={() =>
                  closed
                    ? router.push('/(app)/selections')
                    : router.push({ pathname: '/(app)/selections', params: { competitionId: item.competitionId, raceDate: item.raceDate } })
                }
                activeOpacity={0.8}
              >
                <View style={styles.cardRow}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.cardTitle}>{item.competitionName}</Text>
                    <Text style={styles.cardMeta}>
                      {item.course} • {new Date(item.raceDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </Text>
                    {closed ? (
                      <Text style={styles.cardStatusClosed}>Selections now closed. Go to "My selections" to view.</Text>
                    ) : (
                      <Text style={styles.cardStatus}>
                        {item.pendingCount} race{item.pendingCount !== 1 ? 's' : ''} to pick – tap to make selections
                      </Text>
                    )}
                  </View>
                  {!closed && (
                    <View style={styles.cardRight}>
                      <Text style={styles.entriesOpenLabel}>Entries open</Text>
                      <Text style={styles.entriesOpenTime}>{formatTimeUntilDeadline(item.firstRaceUtc)}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Section 2: Results */}
        {hasJoinedAny && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Results</Text>
            {meetingResults.length === 0 ? (
              <Text style={styles.cardMeta}>Make selections to see results here</Text>
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
                                      {r.name} (SP {r.sp})
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
                          <Text style={styles.yourSelection}>Your selection is {selectedRace.userSelection}</Text>
                        </View>
                      );
                    })()}
                  </>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1 },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.lg },
  title: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 26,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  primaryButtonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.black,
    fontWeight: '600',
  },
  section: { marginBottom: theme.spacing.xl },
  sectionTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardClosed: {
    borderColor: '#b91c1c',
    borderWidth: 2,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardLeft: { flex: 1 },
  cardRight: {
    alignItems: 'flex-end',
    marginLeft: theme.spacing.md,
  },
  entriesOpenLabel: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  entriesOpenTime: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  cardTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    color: theme.colors.text,
  },
  cardMeta: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  meetingDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  meetingDropdownText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
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
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  raceTabWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  raceTabSeparator: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 18,
    color: theme.colors.black,
    marginHorizontal: theme.spacing.xs,
    opacity: 0.7,
  },
  raceTab: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  raceTabActive: {},
  raceTabText: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 18,
    color: theme.colors.black,
    opacity: 0.8,
  },
  raceTabTextActive: {
    color: theme.colors.black,
    fontWeight: '600',
    opacity: 1,
  },
  resultCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resultCardRaceName: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 20,
    color: theme.colors.text,
    fontWeight: '600',
    marginBottom: theme.spacing.md,
  },
  placesTable: {
    marginBottom: theme.spacing.md,
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
  placesTableRowEarned: {
    backgroundColor: theme.colors.accentMuted,
  },
  viewFullResultButton: {
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  viewFullResultText: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 14,
    color: theme.colors.accent,
  },
  placesTableLabel: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 16,
    color: theme.colors.textSecondary,
    width: 48,
  },
  placesTableValue: {
    fontFamily: theme.fontFamily.polygon,
    fontSize: 16,
    color: theme.colors.text,
    flex: 1,
  },
  yourSelection: {
    fontFamily: theme.fontFamily.polygonItalic,
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
  cardStatus: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.accent, marginTop: 4 },
  cardStatusClosed: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: '#b91c1c',
    marginTop: 4,
    fontStyle: 'italic',
  },
  muted: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  secondaryButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryButtonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.text,
  },
});
