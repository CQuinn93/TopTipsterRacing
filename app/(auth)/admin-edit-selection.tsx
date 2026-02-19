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
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';
import { theme } from '@/constants/theme';
import type { Race } from '@/types/races';

const ADMIN_CODE = '777777';

type RaceDayRow = {
  id: string;
  race_date: string;
  first_race_utc: string;
  races: Race[];
};

export default function AdminEditSelectionScreen() {
  const params = useLocalSearchParams<{ selectionId: string; competitionId: string; raceDate: string }>();
  const selectionId = params.selectionId as string;
  const competitionId = params.competitionId as string;
  const raceDate = params.raceDate as string;

  const [raceDay, setRaceDay] = useState<RaceDayRow | null>(null);
  const [selections, setSelections] = useState<Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!competitionId || !raceDate) {
      setLoading(false);
      return;
    }
    (async () => {
      const days = await fetchRaceDaysForCompetition(supabase, competitionId, 'id, race_date, first_race_utc, races');
      const day = days.find((d) => (d as { race_date: string }).race_date === raceDate);
      setRaceDay((day as RaceDayRow) ?? null);
      setLoading(false);
    })();
  }, [competitionId, raceDate]);

  useEffect(() => {
    if (!selectionId) return;
    (async () => {
      const { data } = await supabase
        .from('daily_selections')
        .select('selections')
        .eq('id', selectionId)
        .maybeSingle();
      if (data?.selections && typeof data.selections === 'object') {
        const sel: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }> = {};
        for (const [k, v] of Object.entries(
          data.selections as Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>
        )) {
          sel[k] = v;
        }
        setSelections(sel);
      }
    })();
  }, [selectionId]);

  const setSelection = (raceId: string, runnerId: string, runnerName: string, oddsDecimal: number) => {
    setSelections((prev) => ({ ...prev, [raceId]: { runnerId, runnerName, oddsDecimal } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('admin_update_selection', {
        p_admin_code: ADMIN_CODE,
        p_selection_id: selectionId,
        p_selections: selections as unknown as Record<string, unknown>,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        Alert.alert('Error', result?.error ?? 'Could not save');
        return;
      }
      Alert.alert('Saved', "Selections updated.", [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !raceDay) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  const races = raceDay.races ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit selections</Text>
        <Text style={styles.subtitle}>{new Date(raceDate).toLocaleDateString()}</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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
                ]}
                onPress={() => setSelection(race.id, r.id, r.name, r.oddsDecimal)}
              >
                <Text style={styles.runnerName}>{r.name}</Text>
                <Text style={styles.runnerOdds}>{r.oddsDecimal.toFixed(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        {races.length > 0 && (
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.black} />
            ) : (
              <Text style={styles.saveButtonText}>Save changes</Text>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  header: { padding: theme.spacing.lg, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.accent,
    marginBottom: theme.spacing.sm,
  },
  title: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 20,
    color: theme.colors.text,
  },
  subtitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
  },
  scroll: { flex: 1 },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  raceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  raceName: { fontFamily: theme.fontFamily.regular, fontSize: 16, color: theme.colors.text, fontWeight: '600' },
  raceTime: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },
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
