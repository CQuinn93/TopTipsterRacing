import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import type { Race } from '@/types/races';

type TabletData = {
  user_id: string;
  competitions: Array<{ id: string; name: string; status: string }>;
  race_days: Array<{
    id: string;
    competition_id: string;
    race_date: string;
    first_race_utc: string;
    races: Race[];
  }>;
  selections: Array<{
    competition_id: string;
    race_date: string;
    selections: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>;
  }>;
};

const RETURN_AFTER_SAVE_MS = 5000;

const CODE_LENGTH = 6;

export default function TabletModeScreen() {
  const [code, setCode] = useState('');
  const codeInputRefs = useRef<(TextInput | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<TabletData | null>(null);
  const [competitionId, setCompetitionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>>({});
  const [savedSuccess, setSavedSuccess] = useState(false);

  const currentCode = data ? code : code.trim();

  const handleContinue = useCallback(async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      Alert.alert('Invalid code', 'Please enter your 6-digit tablet code.');
      return;
    }
    if (trimmed === '777777') {
      router.replace('/(auth)/admin');
      return;
    }
    setLoading(true);
    try {
      const { data: result, error } = await supabase.rpc('tablet_get_data', { p_code: trimmed });
      if (error) throw error;
      const payload = result as { error?: string } | TabletData;
      if (payload && 'error' in payload && payload.error) {
        Alert.alert('Invalid code', 'This code was not recognised. Please try again.');
        return;
      }
      setData(payload as TabletData);
      setCode(trimmed);
      setCompetitionId(null);
      setSelectedDate(null);
      setSelections({});
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [code]);

  const handleBackToCode = useCallback(() => {
    setData(null);
    setCompetitionId(null);
    setSelectedDate(null);
    setSelections({});
    setSavedSuccess(false);
  }, []);

  const raceDaysForComp = data?.race_days.filter((rd) => rd.competition_id === competitionId) ?? [];
  const currentDay = raceDaysForComp.find((d) => d.race_date === selectedDate);
  const races = currentDay?.races ?? [];

  const existingForDay = data?.selections.find(
    (s) => s.competition_id === competitionId && s.race_date === selectedDate
  );
  const initialSelections = existingForDay?.selections ?? {};
  const selectionsToUse = Object.keys(selections).length > 0 ? selections : initialSelections;

  useEffect(() => {
    if (!data || !competitionId || !selectedDate) return;
    const existing = data.selections.find((s) => s.competition_id === competitionId && s.race_date === selectedDate);
    setSelections(existing?.selections ?? {});
  }, [data, competitionId, selectedDate]);

  const setSelection = useCallback(
    (raceId: string, runnerId: string, runnerName: string, oddsDecimal: number) => {
      setSelections((prev) => ({ ...prev, [raceId]: { runnerId, runnerName, oddsDecimal } }));
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!data || !competitionId || !selectedDate) return;
    setSaving(true);
    try {
      const { data: result, error } = await supabase.rpc('tablet_submit_selections', {
        p_code: currentCode,
        p_competition_id: competitionId,
        p_race_date: selectedDate,
        p_selections: Object.keys(selectionsToUse).length ? selectionsToUse : initialSelections,
      });
      if (error) throw error;
      const payload = result as { success?: boolean; error?: string };
      if (!payload?.success) {
        Alert.alert('Error', payload?.error === 'invalid_code' ? 'Session expired. Enter your code again.' : 'Could not save.');
        return;
      }
      setSavedSuccess(true);
      setTimeout(() => {
        handleBackToCode();
      }, RETURN_AFTER_SAVE_MS);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [data, competitionId, selectedDate, currentCode, selectionsToUse, initialSelections, handleBackToCode]);

  if (savedSuccess) {
    return (
      <View style={styles.centered}>
        <Text style={styles.successTitle}>Saved, good luck!</Text>
        <Text style={styles.successSub}>Returning to tablet mode in a moment…</Text>
      </View>
    );
  }

  const setCodeDigit = useCallback((index: number, char: string) => {
    setCode((prev) => {
      if (char === '') {
        if (prev[index] === undefined || prev[index] === '') return prev;
        return prev.slice(0, index) + prev.slice(index + 1);
      }
      const digit = char.replace(/\D/g, '').slice(-1);
      const next = prev.slice(0, index) + digit + prev.slice(index + 1);
      return next.slice(0, CODE_LENGTH);
    });
    if (char !== '' && index < CODE_LENGTH - 1) {
      setTimeout(() => codeInputRefs.current[index + 1]?.focus(), 0);
    }
  }, []);

  const handleCodeKeyPress = useCallback(
    (index: number) => (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key !== 'Backspace') return;
      if (code[index] !== '') {
        setCode((prev) => prev.slice(0, index) + prev.slice(index + 1));
      } else if (index > 0) {
        setCode((prev) => prev.slice(0, index - 1) + prev.slice(index));
        setTimeout(() => codeInputRefs.current[index - 1]?.focus(), 0);
      }
    },
    [code]
  );

  if (!data) {
    return (
      <KeyboardAvoidingView
        style={styles.codeEntryContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.codeEntryContent}>
          <Text style={styles.codeEntryTitle}>Cheltenham Top Tipster</Text>
          <Text style={styles.codeEntrySubtitle}>Enter your 6-digit tablet code</Text>
          <View style={styles.codeEntryBoxRow}>
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <TextInput
                key={i}
                ref={(el) => { codeInputRefs.current[i] = el; }}
                style={styles.codeEntryBox}
                placeholder=""
                placeholderTextColor={theme.colors.textMuted}
                value={code[i] ?? ''}
                onChangeText={(t) => setCodeDigit(i, t)}
                onKeyPress={handleCodeKeyPress(i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                editable={!loading}
              />
            ))}
          </View>
          <TouchableOpacity
            style={[styles.codeEntryButton, loading && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.black} />
            ) : (
              <Text style={styles.codeEntryButtonText}>Continue</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.codeEntryBackText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const comps = data.competitions ?? [];
  if (!competitionId) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Select competition</Text>
        <ScrollView style={styles.list}>
          {comps.map((c) => (
            <TouchableOpacity key={c.id} style={styles.card} onPress={() => setCompetitionId(c.id)}>
              <Text style={styles.cardTitle}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity onPress={handleBackToCode}>
          <Text style={styles.backText}>Use a different code</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!selectedDate) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Select race day</Text>
        {raceDaysForComp.length === 0 ? (
          <Text style={styles.muted}>No race days for this competition yet.</Text>
        ) : (
          <ScrollView horizontal style={styles.dateRow} contentContainerStyle={styles.dateRowContent}>
            {raceDaysForComp.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={styles.dateChip}
                onPress={() => {
                  setSelectedDate(d.race_date);
                  setSelections({});
                }}
              >
                <Text style={styles.dateChipText}>
                  {new Date(d.race_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity onPress={() => setCompetitionId(null)}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>Your selections</Text>
      <Text style={styles.sectionLabel}>Race day</Text>
      <ScrollView horizontal style={styles.dateRow} contentContainerStyle={styles.dateRowContent}>
        {raceDaysForComp.map((d) => (
          <TouchableOpacity
            key={d.id}
            style={[styles.dateChip, selectedDate === d.race_date && styles.dateChipActive]}
            onPress={() => setSelectedDate(d.race_date)}
          >
            <Text style={[styles.dateChipText, selectedDate === d.race_date && styles.dateChipTextActive]}>
              {new Date(d.race_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {races.length === 0 && (
        <Text style={styles.muted}>No races for this day. Race data is updated daily.</Text>
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
              style={[styles.runnerRow, selectionsToUse[race.id]?.runnerId === r.id && styles.runnerRowSelected]}
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
          style={[styles.button, styles.submitButton, saving && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color={theme.colors.black} /> : <Text style={styles.buttonText}>Submit selections</Text>}
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={() => setSelectedDate(null)}>
        <Text style={styles.backText}>Change day</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleBackToCode}>
        <Text style={styles.backText}>Use a different code</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg },
  scrollContent: { paddingBottom: theme.spacing.xxl },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  codeEntryContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  codeEntryContent: {
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  codeEntryTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 28,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  codeEntrySubtitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  codeEntryBoxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xl,
  },
  codeEntryBox: {
    width: 44,
    height: 52,
    fontFamily: theme.fontFamily.input,
    fontSize: 24,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    textAlign: 'center',
    padding: 0,
  },
  codeEntryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  codeEntryButtonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    color: theme.colors.black,
    fontWeight: '600',
  },
  codeEntryBackText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.accent,
    textAlign: 'center',
  },
  title: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 24,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
  },
  successTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 22,
    color: theme.colors.accent,
    marginBottom: theme.spacing.sm,
  },
  successSub: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary },
  input: {
    fontFamily: theme.fontFamily.input,
    fontSize: 24,
    letterSpacing: 8,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  submitButton: { marginTop: theme.spacing.lg },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    color: theme.colors.black,
    fontWeight: '600',
  },
  backText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
  list: { maxHeight: 300, marginBottom: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: { fontFamily: theme.fontFamily.regular, fontSize: 18, color: theme.colors.text },
  dateRow: { marginBottom: theme.spacing.md, flexGrow: 0 },
  dateRowContent: { gap: theme.spacing.sm },
  dateChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dateChipActive: { backgroundColor: theme.colors.accentMuted, borderColor: theme.colors.accent },
  dateChipText: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary },
  dateChipTextActive: { color: theme.colors.accent },
  sectionLabel: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
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
  runnerRowSelected: { backgroundColor: theme.colors.accentMuted, borderWidth: 1, borderColor: theme.colors.accent },
  runnerName: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.text },
  runnerOdds: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.accent },
});
