import { useEffect, useState, useRef } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
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
import { theme } from '@/constants/theme';
import { displayHorseName } from '@/lib/displayHorseName';
import type { Race } from '@/types/races';

const SELECTION_CLOSE_HOURS_BEFORE_FIRST = 1;

function formatDayDate(raceDate: string): string {
  const d = new Date(raceDate + 'T12:00:00');
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const date = d.getDate();
  const suffix = date === 1 || date === 21 || date === 31 ? 'st' : date === 2 || date === 22 ? 'nd' : date === 3 || date === 23 ? 'rd' : 'th';
  return `${day} ${date}${suffix}`;
}

function isSelectionClosedForDay(firstRaceUtc: string): boolean {
  const deadline = new Date(firstRaceUtc).getTime() - SELECTION_CLOSE_HOURS_BEFORE_FIRST * 60 * 60 * 1000;
  return Date.now() >= deadline;
}

type RaceDay = {
  id: string;
  race_date: string;
  first_race_utc: string;
  races: Race[];
};

export default function SelectionsScreen() {
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
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [othersModal, setOthersModal] = useState<{
    raceName: string;
    meeting: string;
    others: OtherUserSelection[];
  } | null>(null);
  const [selectionsBulk, setSelectionsBulk] = useState<SelectionsBulkData | null>(null);
  const [refreshingMySelections, setRefreshingMySelections] = useState(false);
  const [pickingDayIndex, setPickingDayIndex] = useState(0);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
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
    const compIds = (parts ?? []).map((p: { competition_id: string }) => p.competition_id);
    const { data: comps } = await supabase.from('competitions').select('id, name').in('id', compIds);
    const compNames = new Map((comps ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
    const bulk = await getSelectionsBulk(supabase, userId, compIds, true);
    setSelectionsBulk(bulk);
    setMySelectionsList(computeMySelectionsFromBulk(bulk, userId, compNames));
    setRefreshingMySelections(false);
  };

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: parts } = await supabase
        .from('competition_participants')
        .select('competition_id')
        .eq('user_id', userId);
      if (!parts?.length) {
        setUserCompetitions([]);
        return;
      }
      const { data: comps } = await supabase
        .from('competitions')
        .select('id, name')
        .in('id', parts.map((p) => p.competition_id));
      setUserCompetitions(comps ?? []);
    })();
  }, [userId]);

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
      const compIds = (parts ?? []).map((p: { competition_id: string }) => p.competition_id);
      const { data: comps } = await supabase.from('competitions').select('id, name').in('id', compIds);
      const compNames = new Map((comps ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
      const bulk = await getSelectionsBulk(supabase, userId, compIds, forceRefresh);
      setSelectionsBulk(bulk);
      const list = computeMySelectionsFromBulk(bulk, userId, compNames);
      setMySelectionsList(list);
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

  useEffect(() => {
    if (!userId || !competitionId || !selectedDate) return;
    (async () => {
      const { data } = await supabase
        .from('daily_selections')
        .select('selections')
        .eq('competition_id', competitionId)
        .eq('user_id', userId)
        .eq('race_date', selectedDate)
        .maybeSingle();
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

  const currentRaceDay = raceDays[pickingDayIndex] ?? raceDays[0];
  const selectedDate = currentRaceDay?.race_date ?? null;
  const currentRaces = currentRaceDay?.races ?? [];
  const selectedRace = currentRaces[selectedRaceIndex] ?? currentRaces[0];
  const selectionsClosed = currentRaceDay ? isSelectionClosedForDay(currentRaceDay.first_race_utc) : false;

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
        { text: 'OK', onPress: () => router.replace('/(app)') },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      const isLocked = /locked|1 hour|first race/i.test(msg);
      Alert.alert(isLocked ? 'Selections locked' : 'Error', isLocked ? 'Selections are locked – less than 1 hour until the first race.' : msg);
    } finally {
      setSaving(false);
    }
  };

  const handleCardPress = (item: MySelectionItem) => {
    if (!userId || !selectionsBulk) return;
    const others = computeOtherUsersSelectionsFromBulk(
      selectionsBulk,
      item.competitionId,
      item.raceDate,
      item.raceId,
      userId
    );
    setOthersModal({
      raceName: item.raceName,
      meeting: item.meeting,
      others,
    });
  };

  const filteredList = mySelectionsList;

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
  const currentGroup = courseDayGroups[selectedDayIndex] ?? courseDayGroups[0];

  useEffect(() => {
    setSelectedDayIndex(0);
  }, [effectiveCourse, courseDayGroups.length]);

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
          <Text style={styles.sectionTitle}>My selections</Text>

          {mySelectionsList.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No selections yet</Text>
              <Text style={styles.emptyStateText}>Make your picks from the home screen when entries are open.</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.courseDropdown}
                onPress={() => setCourseDropdownOpen(true)}
              >
                <Text style={styles.courseDropdownText}>{effectiveCourse ?? 'Select course'}</Text>
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

              {courseDayGroups.length >= 1 && (
                <View style={styles.dayTabsRow}>
                  {courseDayGroups.map((g, i) => (
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
                        const fadeColors = item.positionLabel === 'won'
                          ? [theme.colors.accent, 'rgba(34, 197, 94, 0)']
                          : item.positionLabel === 'place'
                            ? ['#eab308', 'rgba(234, 179, 8, 0)']
                            : item.positionLabel === 'lost'
                              ? [theme.colors.error, 'rgba(239, 68, 68, 0)']
                              : null;
                        return (
                          <TouchableOpacity
                            key={`${item.competitionId}-${item.raceId}-${item.raceDate}-${index}`}
                            style={styles.mySelectionCard}
                            onPress={() => handleCardPress(item)}
                            activeOpacity={0.7}
                          >
                            {fadeColors && (
                              <LinearGradient
                                colors={fadeColors}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.mySelectionCardFade}
                              />
                            )}
                            <View style={[styles.mySelectionCardRow, fadeColors && { paddingLeft: 12 }]}>
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
                                  {item.positionLabel === 'won' ? 'Win' : item.positionLabel === 'place' ? 'Place' : 'Loss'}
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.mySelectionCardPending}>—</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>

        <Modal visible={!!othersModal} transparent animationType="fade">
          <Pressable style={styles.modalBackdrop} onPress={() => setOthersModal(null)}>
            <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
              {othersModal && (
                <>
                  <Text style={styles.modalTitle}>{othersModal.raceName}</Text>
                  <Text style={styles.modalSubtitle}>{othersModal.meeting}</Text>
                  <Text style={styles.modalSectionLabel}>Selections in this competition</Text>
                  {othersModal.others.map((o, i) => (
                    <View
                      key={`${o.displayName}-${o.runnerName}-${i}`}
                      style={[styles.othersRow, o.isCurrentUser && styles.othersRowHighlight]}
                    >
                      <Text style={[styles.othersName, o.isCurrentUser && styles.othersNameBold]}>
                        {o.displayName}{o.isCurrentUser ? ' (you)' : ''}
                      </Text>
                      <Text style={styles.othersPick}>{displayHorseName(o.runnerName)}</Text>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.modalClose} onPress={() => setOthersModal(null)}>
                    <Text style={styles.modalCloseText}>Close</Text>
                  </TouchableOpacity>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>
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
      <View style={styles.pickingHeaderRow}>
        <Text style={styles.sectionTitle}>Make your picks</Text>
        {currentRaces.length > 0 && !selectionsClosed && (
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

      {currentRaces.length === 0 && (
        <Text style={styles.muted}>No races loaded for this day. Race data is updated daily.</Text>
      )}

      {currentRaces.length > 0 && (
        <>
          <View style={styles.pickingRaceTabsRow}>
            {currentRaces.map((race, idx) => (
              <TouchableOpacity
                key={race.id}
                style={[styles.pickingRaceTab, selectedRaceIndex === idx && styles.pickingRaceTabActive]}
                onPress={() => setSelectedRaceIndex(idx)}
              >
                <Text style={[styles.pickingRaceTabText, selectedRaceIndex === idx && styles.pickingRaceTabTextActive]}>
                  {new Date(race.scheduledTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            ))}
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
                  style={[styles.pickingRunnerCard, selectionsClosed && styles.pickingRunnerCardReadOnly]}
                  onPress={() => !selectionsClosed && setSelection(selectedRace.id, r.id, r.name, r.oddsDecimal)}
                  disabled={selectionsClosed}
                  activeOpacity={0.7}
                >
                  {isSelected && (
                    <LinearGradient
                      colors={[theme.colors.accent, 'rgba(34, 197, 94, 0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.pickingRunnerGradient}
                    />
                  )}
                  <View style={[styles.pickingRunnerCardInner, isSelected && { paddingLeft: 12 }]}>
                    <View style={[styles.pickingRunnerNumber, isSelected && styles.pickingRunnerNumberSelected]}>
                      <Text style={[styles.pickingRunnerNumberText, isSelected && styles.pickingRunnerNumberTextSelected]}>{r.id === 'FAV' ? '★' : r.number ?? '—'}</Text>
                    </View>
                    <View style={styles.pickingRunnerCenter}>
                      <Text style={styles.pickingRunnerName} numberOfLines={1}>{displayHorseName(r.name)}</Text>
                      {r.jockey ? <Text style={styles.pickingRunnerJockey} numberOfLines={1}>{r.jockey}</Text> : null}
                    </View>
                    {isSelected ? (
                      <Text style={styles.pickingRunnerCheck}>✓</Text>
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

const styles = StyleSheet.create({
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
  },
  courseDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
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
    padding: theme.spacing.sm,
    width: '100%',
    maxWidth: 320,
    maxHeight: 320,
  },
  dropdownOption: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
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
  viewOnlyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  viewOnlyCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewOnlyCardLeft: { flex: 1 },
  viewOnlyCardTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  viewOnlyCardSelection: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 15,
    color: theme.colors.text,
    fontWeight: '600',
  },
  wplBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  wplWon: { backgroundColor: theme.colors.accentMuted },
  wplPlace: { backgroundColor: 'rgba(163, 163, 163, 0.2)' },
  wplLost: { backgroundColor: 'rgba(115, 115, 115, 0.2)' },
  wplBadgeText: { fontFamily: theme.fontFamily.regular, fontSize: 11 },
  wplWonText: { color: theme.colors.accent, fontWeight: '600' },
  wplPlaceText: { color: theme.colors.textSecondary },
  wplLostText: { color: theme.colors.textMuted },
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
  othersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  othersRowHighlight: {
    backgroundColor: theme.colors.accentMuted,
    marginHorizontal: -theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  othersName: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.text },
  othersNameBold: { fontWeight: '600' },
  othersPick: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary },
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
  pickingRaceTabText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  pickingRaceTabTextActive: {
    color: theme.colors.accent,
    fontWeight: '600',
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
  pickingRunnerCenter: { flex: 1, minWidth: 0 },
  pickingRunnerName: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  pickingRunnerJockey: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
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
    backgroundColor: theme.colors.accent,
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
  saveButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  buttonDisabled: { opacity: 0.7 },
  saveButtonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.black,
    fontWeight: '600',
  },
});
