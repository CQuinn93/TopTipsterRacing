import { useEffect, useState } from 'react';
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
import { useLocalSearchParams } from 'expo-router';
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
import type { Race } from '@/types/races';

const SELECTION_CLOSE_HOURS_BEFORE_FIRST = 1;

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
  const params = useLocalSearchParams<{ competitionId?: string; raceDate?: string }>();
  const competitionId = params.competitionId as string | undefined;
  const initialRaceDate = params.raceDate as string | undefined;

  const [raceDays, setRaceDays] = useState<RaceDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userCompetitions, setUserCompetitions] = useState<{ id: string; name: string }[]>([]);
  const [mySelectionsList, setMySelectionsList] = useState<MySelectionItem[]>([]);
  const [selectedCompetitionFilter, setSelectedCompetitionFilter] = useState<string | null>(null);
  const [othersModal, setOthersModal] = useState<{
    raceName: string;
    meeting: string;
    others: OtherUserSelection[];
  } | null>(null);
  const [selectionsBulk, setSelectionsBulk] = useState<SelectionsBulkData | null>(null);
  const [refreshingMySelections, setRefreshingMySelections] = useState(false);

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
    (async () => {
      setLoading(true);
      const { data: parts } = await supabase
        .from('competition_participants')
        .select('competition_id')
        .eq('user_id', userId);
      const compIds = (parts ?? []).map((p: { competition_id: string }) => p.competition_id);
      const { data: comps } = await supabase.from('competitions').select('id, name').in('id', compIds);
      const compNames = new Map((comps ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
      const bulk = await getSelectionsBulk(supabase, userId, compIds);
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
        const hasInitialDate = initialRaceDate && days.some((d) => d.race_date === initialRaceDate);
        setSelectedDate(hasInitialDate ? initialRaceDate : days[0].race_date);
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

  const currentDay = raceDays.find((d) => d.race_date === selectedDate);
  const races = currentDay?.races ?? [];
  const selectionsClosed = currentDay ? isSelectionClosedForDay(currentDay.first_race_utc) : false;

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
      Alert.alert('Saved', 'Your selections have been saved.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
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

  const uniqueCompIds = [...new Set(mySelectionsList.map((i) => i.competitionId))];
  const hasMultipleCompetitions = uniqueCompIds.length > 1;
  const filteredList = selectedCompetitionFilter
    ? mySelectionsList.filter((i) => i.competitionId === selectedCompetitionFilter)
    : mySelectionsList;

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
          <Text style={styles.viewOnlySubtitle}>Your picks ordered by race time. Tap a card to see others' picks.</Text>

          {hasMultipleCompetitions && (
            <View style={styles.competitionFilterRow}>
              <Text style={styles.filterLabel}>Competition:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
                <TouchableOpacity
                  style={[styles.filterChip, !selectedCompetitionFilter && styles.filterChipActive]}
                  onPress={() => setSelectedCompetitionFilter(null)}
                >
                  <Text style={[styles.filterChipText, !selectedCompetitionFilter && styles.filterChipTextActive]}>
                    All
                  </Text>
                </TouchableOpacity>
                {uniqueCompIds.map((cid) => {
                  const name = mySelectionsList.find((i) => i.competitionId === cid)?.competitionName ?? cid;
                  return (
                    <TouchableOpacity
                      key={cid}
                      style={[styles.filterChip, selectedCompetitionFilter === cid && styles.filterChipActive]}
                      onPress={() => setSelectedCompetitionFilter(cid)}
                    >
                      <Text style={[styles.filterChipText, selectedCompetitionFilter === cid && styles.filterChipTextActive]}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {mySelectionsList.length === 0 ? (
            <Text style={styles.muted}>No selections yet. Make your picks from the home screen when entries are open.</Text>
          ) : filteredList.length === 0 ? (
            <Text style={styles.muted}>No selections for this competition.</Text>
          ) : (
            filteredList.map((item, index) => (
              <TouchableOpacity
                key={`${item.competitionId}-${item.raceId}-${item.raceDate}-${index}`}
                style={styles.viewOnlyCard}
                onPress={() => handleCardPress(item)}
                activeOpacity={0.7}
              >
                <View style={styles.viewOnlyCardContent}>
                  <View style={styles.viewOnlyCardLeft}>
                    <Text style={styles.viewOnlyCardTitle}>
                      {item.meeting} • {new Date(item.raceTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={styles.viewOnlyCardSelection}>{item.runnerName}</Text>
                  </View>
                  {item.positionLabel && (
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
                  )}
                </View>
              </TouchableOpacity>
            ))
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
                      <Text style={styles.othersPick}>{o.runnerName}</Text>
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
      <Text style={styles.sectionTitle}>Race day</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateRow}>
        {raceDays.map((d) => (
          <TouchableOpacity
            key={d.id}
            style={[styles.dateChip, selectedDate === d.race_date && styles.dateChipActive]}
            onPress={() => setSelectedDate(d.race_date)}
          >
            <Text style={[styles.dateChipText, selectedDate === d.race_date && styles.dateChipTextActive]}>
              {new Date(d.race_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {selectionsClosed && races.length > 0 && (
        <View style={styles.closedBanner}>
          <Text style={styles.closedBannerText}>Selections are closed for this race day (1 hour before first race). View only.</Text>
        </View>
      )}

      {races.length === 0 && (
        <Text style={styles.muted}>No races loaded for this day. Race data is updated daily.</Text>
      )}

      {races.map((race) => (
        <View key={race.id} style={styles.raceCard}>
          <Text style={styles.raceName}>{race.name}</Text>
          <Text style={styles.raceTime}>
            {new Date(race.scheduledTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {(race.runners ?? []).map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[
                styles.runnerRow,
                selections[race.id]?.runnerId === r.id && styles.runnerRowSelected,
                selectionsClosed && styles.runnerRowReadOnly,
              ]}
              onPress={() => !selectionsClosed && setSelection(race.id, r.id, r.name, r.oddsDecimal)}
              disabled={selectionsClosed}
            >
              <Text style={styles.runnerName}>{r.name}</Text>
              <Text style={styles.runnerOdds}>{r.oddsDecimal.toFixed(2)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {races.length > 0 && !selectionsClosed && (
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={saveSelections}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.black} />
          ) : (
            <Text style={styles.saveButtonText}>Save selections</Text>
          )}
        </TouchableOpacity>
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
    marginBottom: theme.spacing.sm,
  },
  viewOnlySubtitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },
  competitionFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  filterLabel: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  filterChips: { flex: 1 },
  filterChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.accentMuted,
    borderColor: theme.colors.accent,
  },
  filterChipText: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textSecondary },
  filterChipTextActive: { color: theme.colors.accent },
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
  dateRow: { marginBottom: theme.spacing.lg, flexGrow: 0 },
  dateChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dateChipActive: {
    backgroundColor: theme.colors.accentMuted,
    borderColor: theme.colors.accent,
  },
  dateChipText: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary },
  dateChipTextActive: { color: theme.colors.accent },
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
  raceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  raceName: { fontFamily: theme.fontFamily.regular, fontSize: 16, color: theme.colors.text, fontWeight: '600' },
  raceTime: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textMuted, marginBottom: theme.spacing.sm },
  runnerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    marginTop: 2,
  },
  runnerRowSelected: {
    backgroundColor: theme.colors.accentMuted,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  runnerRowReadOnly: { opacity: 0.9 },
  runnerName: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.text },
  runnerOdds: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.accent },
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
