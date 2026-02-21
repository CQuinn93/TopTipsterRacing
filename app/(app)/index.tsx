import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { getAvailableRacesForUser } from '@/lib/availableRacesCache';
import { getLatestResultsForUser } from '@/lib/latestResultsCache';
import { useForceRefresh } from '@/contexts/ForceRefreshContext';
import type { AvailableRaceDay } from '@/lib/availableRacesForUser';
import type { MeetingResults, RaceResultTemplate } from '@/lib/resultsTemplateForUser';
import type { ParticipationRow } from '@/lib/availableRacesCache';

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

export default function HomeScreen() {
  const { userId } = useAuth();
  const [participations, setParticipations] = useState<ParticipationRow[]>([]);
  const [availableRaces, setAvailableRaces] = useState<AvailableRaceDay[]>([]);
  const [meetingResults, setMeetingResults] = useState<MeetingResults[]>([]);
  const [selectedMeetingCourse, setSelectedMeetingCourse] = useState<string | null>(null);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  const [meetingDropdownOpen, setMeetingDropdownOpen] = useState(false);
  const [showFullResult, setShowFullResult] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingResults, setRefreshingResults] = useState(false);
  const [lockingId, setLockingId] = useState<string | null>(null);

  const load = useCallback(
    async (forceRefresh = false) => {
      if (!userId) return;
      setRefreshing(true);
      try {
        const { participations, availableRaces } = await getAvailableRacesForUser(supabase, userId, forceRefresh);
        setParticipations(participations);
        setAvailableRaces(availableRaces);
        if (participations.length === 0) {
          setMeetingResults([]);
          setSelectedMeetingCourse(null);
        } else {
          const compIds = participations.map((p) => p.competition_id);
          const results = await getLatestResultsForUser(supabase, userId, compIds, forceRefresh);
          setMeetingResults(results);
        }
      } finally {
        setRefreshing(false);
      }
    },
    [userId]
  );

  const refreshResults = useCallback(async () => {
    if (!userId || participations.length === 0) return;
    setRefreshingResults(true);
    try {
      const compIds = participations.map((p) => p.competition_id);
      const results = await getLatestResultsForUser(supabase, userId, compIds, true);
      setMeetingResults(results);
    } finally {
      setRefreshingResults(false);
    }
  }, [userId, participations]);

  useFocusEffect(
    useCallback(() => {
      if (userId) load(false);
    }, [userId, load])
  );

  const { homeTrigger } = useForceRefresh();
  useEffect(() => {
    if (userId && homeTrigger > 0) load(true);
  }, [userId, homeTrigger, load]);

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

  const handleLockIn = async (item: AvailableRaceDay) => {
    if (!userId || item.isLocked || !item.hasAllPicks) return;
    setLockingId(`${item.competitionId}-${item.raceDate}`);
    try {
      const { data, error } = await supabase.rpc('lock_selections', {
        p_competition_id: item.competitionId,
        p_race_date: item.raceDate,
      });
      const result = data as { success?: boolean; error?: string } | null;
      if (error || !result?.success) {
        Alert.alert('Error', result?.error ?? error?.message ?? 'Failed to lock');
        return;
      }
      await load(true);
    } finally {
      setLockingId(null);
    }
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
            const cardKey = `${item.competitionId}-${item.raceDate}`;
            const isLocking = lockingId === cardKey;
            return (
              <TouchableOpacity
                key={cardKey}
                style={[styles.card, closed && styles.cardClosed]}
                onPress={() =>
                  closed || item.isLocked
                    ? router.push('/(app)/selections')
                    : router.push({ pathname: '/(app)/selections', params: { competitionId: item.competitionId, raceDate: item.raceDate } })
                }
                activeOpacity={0.8}
                disabled={isLocking}
              >
                <View style={styles.cardRow}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.cardTitle}>{item.competitionName}</Text>
                    <Text style={styles.cardMeta}>
                      {item.course} • {new Date(item.raceDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </Text>
                    {closed ? (
                      <Text style={styles.cardStatusClosed}>Selections now closed. Go to "My selections" to view.</Text>
                    ) : item.isLocked ? (
                      <Text style={styles.cardStatus}>Locked – tap to view others&apos; picks</Text>
                    ) : item.hasAllPicks ? (
                      <Text style={styles.cardStatus}>All picks made – lock in to view others</Text>
                    ) : (
                      <Text style={styles.cardStatus}>
                        {item.pendingCount} race{item.pendingCount !== 1 ? 's' : ''} to pick – tap to make selections
                      </Text>
                    )}
                  </View>
                  {!closed && !item.isLocked && (
                    <View style={styles.cardRight}>
                      {item.hasAllPicks ? (
                        <TouchableOpacity
                          style={[styles.lockInButton, isLocking && styles.lockInButtonDisabled]}
                          onPress={(e) => {
                            e?.stopPropagation?.();
                            handleLockIn(item);
                          }}
                          disabled={isLocking}
                        >
                          {isLocking ? (
                            <ActivityIndicator size="small" color={theme.colors.black} />
                          ) : (
                            <Text style={styles.lockInButtonText}>Lock in</Text>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <>
                          <Text style={styles.entriesOpenLabel}>Entries open</Text>
                          <Text style={styles.entriesOpenTime}>{formatTimeUntilDeadline(item.firstRaceUtc)}</Text>
                        </>
                      )}
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
            <View style={styles.resultsSectionHeader}>
              <Text style={[styles.sectionTitle, styles.resultsSectionTitle]}>Results</Text>
              <TouchableOpacity
                style={styles.refreshResultsButton}
                onPress={refreshResults}
                disabled={refreshingResults}
              >
                {refreshingResults ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  <Ionicons name="refresh" size={20} color={theme.colors.accent} />
                )}
              </TouchableOpacity>
            </View>
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
  resultsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  resultsSectionTitle: {
    marginBottom: 0,
  },
  refreshResultsButton: {
    padding: theme.spacing.sm,
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
  lockInButton: {
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.sm,
  },
  lockInButtonDisabled: { opacity: 0.7 },
  lockInButtonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.black,
    fontWeight: '600',
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
