import { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';
import type { Theme } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { displayHorseName } from '@/lib/displayHorseName';
import type { Race } from '@/types/races';

type RaceDayRow = {
  id: string;
  race_date: string;
  first_race_utc: string;
  races: Race[];
};

export default function AdminEditSelectionScreen() {
  const activeTheme = useTheme();
  const styles = useMemo(() => createAdminEditStyles(activeTheme), [activeTheme]);
  const params = useLocalSearchParams<{ selectionId: string; competitionId: string; raceDate: string; code?: string }>();
  const selectionId = params.selectionId as string;
  const competitionId = params.competitionId as string;
  const raceDate = params.raceDate as string;
  const adminCode = String(params.code ?? '').trim();

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
        p_code: adminCode,
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
      <View style={[styles.centered, { backgroundColor: activeTheme.colors.background }]}>
        <ActivityIndicator size="large" color={activeTheme.colors.barAccent} />
      </View>
    );
  }

  const races = raceDay.races ?? [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: activeTheme.colors.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: activeTheme.colors.border, backgroundColor: activeTheme.colors.surfaceElevated }]}>
        <View style={styles.adminBadge}>
          <Ionicons name="create-outline" size={14} color={activeTheme.colors.barAccent} />
          <Text style={styles.adminBadgeText}>Admin</Text>
        </View>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={activeTheme.colors.barAccent} />
            <Text style={[styles.backText, { color: activeTheme.colors.barAccent }]}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButtonTop, saving && styles.buttonDisabled]}
            onPress={save}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={activeTheme.colors.black} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color={activeTheme.colors.black} />
                <Text style={styles.saveButtonText}>Save</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <Text style={[styles.title, { color: activeTheme.colors.text }]}>Edit selections</Text>
        <Text style={[styles.subtitle, { color: activeTheme.colors.textMuted }]}>
          {new Date(raceDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
        </Text>
        <Text style={[styles.adminHint, { color: activeTheme.colors.textMuted }]}>
          Tap a horse to set the pick for each race, then Save.
        </Text>
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
                <Text style={styles.runnerName}>{displayHorseName(r.name)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function createAdminEditStyles(t: Theme) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: t.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: t.spacing.lg, paddingTop: t.spacing.md, borderBottomWidth: 1 },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    alignSelf: 'flex-start',
    marginBottom: t.spacing.sm,
    paddingVertical: 5,
    paddingHorizontal: t.spacing.sm,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.barAccent,
    backgroundColor: t.colors.surface,
  },
  adminBadgeText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: t.colors.barAccent,
    textTransform: 'uppercase',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: t.spacing.md,
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: t.spacing.xs, paddingRight: t.spacing.md },
  backText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    backgroundColor: t.colors.accent,
    borderRadius: t.radius.full,
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.lg,
  },
  title: {
    fontFamily: t.fontFamily.regular,
    fontSize: 22,
    fontWeight: '700',
    color: t.colors.text,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: t.fontFamily.regular,
    fontSize: 14,
    color: t.colors.textMuted,
    marginTop: t.spacing.xs,
  },
  adminHint: {
    fontFamily: t.fontFamily.regular,
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: t.spacing.sm,
  },
  scroll: { flex: 1 },
  content: { padding: t.spacing.lg, paddingBottom: t.spacing.xxl },
  raceCard: {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.md,
    padding: t.spacing.md,
    marginBottom: t.spacing.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderLeftWidth: 3,
    borderLeftColor: t.colors.barAccent,
  },
  raceName: { fontFamily: t.fontFamily.regular, fontSize: 16, color: t.colors.text, fontWeight: '600' },
  raceTime: {
    fontFamily: t.fontFamily.regular,
    fontSize: 12,
    color: t.colors.textMuted,
    marginBottom: t.spacing.sm,
  },
  runnerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.sm,
    borderRadius: t.radius.sm,
    marginTop: 2,
  },
  runnerRowSelected: {
    backgroundColor: t.colors.accentMuted,
    borderWidth: 1,
    borderColor: t.colors.accent,
  },
  runnerName: { fontFamily: t.fontFamily.regular, fontSize: 14, color: t.colors.text },
  runnerOdds: { fontFamily: t.fontFamily.regular, fontSize: 14, color: t.colors.accent },
  buttonDisabled: { opacity: 0.7 },
  saveButtonText: {
    fontFamily: t.fontFamily.regular,
    fontSize: 16,
    color: t.colors.black,
    fontWeight: '600',
  },
  });
}
