import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';
import { fetchMySelectionsView, type MySelectionItem } from '@/lib/mySelectionsView';
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
      const list = await fetchMySelectionsView(supabase, userId, compIds);
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

  if (!competitionId) {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      );
    }
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>My selections</Text>
        <Text style={styles.viewOnlySubtitle}>View only – your picks ordered by race time</Text>
        {mySelectionsList.length === 0 ? (
          <Text style={styles.muted}>No selections yet. Make your picks from the home screen when entries are open.</Text>
        ) : (
          mySelectionsList.map((item, index) => (
            <View key={`${item.raceTimeUtc}-${item.runnerName}-${index}`} style={styles.viewOnlyCard}>
              <Text style={styles.viewOnlyCardTitle}>
                {item.meeting} • {new Date(item.raceTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.viewOnlyCardSelection}>{item.runnerName}</Text>
            </View>
          ))
        )}
      </ScrollView>
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
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.lg,
  },
  viewOnlyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  viewOnlyCardTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  viewOnlyCardSelection: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    color: theme.colors.text,
    fontWeight: '600',
  },
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
