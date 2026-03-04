import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
  Animated,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { displayHorseName } from '@/lib/displayHorseName';
import type { Race, Runner } from '@/types/races';

type TabletData = {
  user_id: string;
  display_name?: string;
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

const CODE_LENGTH = 6;

function normalizePayload(p: unknown): TabletData | null {
  if (!p || typeof p !== 'object') return null;
  const payload = p as Record<string, unknown>;
  if (payload.error) return null;
  const comps = Array.isArray(payload.competitions) ? payload.competitions : [];
  const raceDays = Array.isArray(payload.race_days) ? payload.race_days : [];
  const selections = Array.isArray(payload.selections) ? payload.selections : [];
  return {
    user_id: typeof payload.user_id === 'string' ? payload.user_id : '',
    display_name: typeof payload.display_name === 'string' ? payload.display_name : undefined,
    competitions: comps as TabletData['competitions'],
    race_days: raceDays as TabletData['race_days'],
    selections: selections as TabletData['selections'],
  };
}

export default function TabletModeScreen() {
  const activeTheme = useTheme();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const codeInputRefs = useRef<(TextInput | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<TabletData | null>(null);
  const [competitionId, setCompetitionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>>({});
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const currentCode = data ? code : code.trim();

  const liveComps = useMemo(
    () => (data?.competitions ?? []).filter((c) => c.status === 'live'),
    [data?.competitions]
  );

  const raceDaysForComp = useMemo(
    () => (data?.race_days ?? []).filter((rd) => rd.competition_id === competitionId),
    [data?.race_days, competitionId]
  );

  const currentDay = raceDaysForComp.find((d) => d.race_date === selectedDate);
  const races = (currentDay?.races ?? []).filter(Boolean);
  const selectedRace = races[selectedRaceIndex] ?? races[0] ?? null;

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

  useEffect(() => {
    if (!competitionId || raceDaysForComp.length === 0) return;
    const dates = raceDaysForComp.map((d) => d.race_date);
    if (!selectedDate || !dates.includes(selectedDate)) {
      setSelectedDate(raceDaysForComp[0]?.race_date ?? null);
      setSelectedRaceIndex(0);
    }
  }, [competitionId, raceDaysForComp, selectedDate]);

  useEffect(() => {
    if (competitionId && selectedDate) {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [competitionId, selectedDate, fadeAnim]);

  const handleContinue = useCallback(async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      Alert.alert('Invalid code', 'Please enter your 6-digit quick access code.');
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
      const normalized = normalizePayload(result);
      if (!normalized) {
        Alert.alert('Invalid code', 'This code was not recognised. Please try again.');
        return;
      }
      setData(normalized);
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
  }, []);

  const setSelection = useCallback(
    (raceId: string, runnerId: string, runnerName: string, oddsDecimal: number) => {
      setSelections((prev) => ({ ...prev, [raceId]: { runnerId, runnerName, oddsDecimal } }));
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!data || !competitionId || !selectedDate) return;
    const payload = Object.keys(selectionsToUse).length ? selectionsToUse : initialSelections;
    setSaving(true);
    try {
      const { data: result, error } = await supabase.rpc('tablet_submit_selections', {
        p_code: currentCode,
        p_competition_id: competitionId,
        p_race_date: selectedDate,
        p_selections: payload,
      });
      if (error) throw error;
      const out = result as { success?: boolean; error?: string } | null;
      if (!out?.success) {
        Alert.alert('Error', out?.error === 'invalid_code' ? 'Session expired. Enter your code again.' : 'Could not save.');
        return;
      }
      Alert.alert('Saved', 'Your results have been saved.', [
        { text: 'Return', onPress: handleBackToCode },
      ]);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [data, competitionId, selectedDate, currentCode, selectionsToUse, initialSelections, handleBackToCode]);

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

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: activeTheme.colors.background,
          padding: activeTheme.spacing.lg,
          paddingTop: activeTheme.spacing.lg + insets.top,
        },
        scrollContent: { paddingBottom: activeTheme.spacing.xxl + insets.bottom },
        centered: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: activeTheme.colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
        codeEntryContainer: {
          flex: 1,
          backgroundColor: activeTheme.colors.background,
          justifyContent: 'center',
          padding: activeTheme.spacing.lg,
          paddingTop: activeTheme.spacing.lg + insets.top,
          paddingBottom: activeTheme.spacing.lg + insets.bottom,
        },
        codeEntryContent: { maxWidth: 400, width: '100%', alignSelf: 'center' },
        codeEntryTitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 28,
          color: activeTheme.colors.text,
          textAlign: 'center',
          marginBottom: activeTheme.spacing.xs,
        },
        codeEntrySubtitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 16,
          color: activeTheme.colors.textSecondary,
          textAlign: 'center',
          marginBottom: activeTheme.spacing.xl,
        },
        codeEntryBoxRow: { flexDirection: 'row', justifyContent: 'center', gap: activeTheme.spacing.sm, marginBottom: activeTheme.spacing.xl },
        codeEntryBox: {
          width: 44,
          height: 52,
          fontFamily: activeTheme.fontFamily.input,
          fontSize: 24,
          color: activeTheme.colors.text,
          backgroundColor: activeTheme.colors.surface,
          borderWidth: 1,
          borderColor: activeTheme.colors.border,
          borderRadius: activeTheme.radius.md,
          textAlign: 'center',
          padding: 0,
        },
        codeEntryButton: {
          backgroundColor: activeTheme.colors.accent,
          borderRadius: activeTheme.radius.md,
          paddingVertical: activeTheme.spacing.md,
          alignItems: 'center',
          marginTop: activeTheme.spacing.sm,
          marginBottom: activeTheme.spacing.md,
        },
        codeEntryButtonText: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 18,
          color: activeTheme.colors.black,
          fontWeight: '600',
        },
        codeEntryBackText: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 14,
          color: activeTheme.colors.accent,
          textAlign: 'center',
        },
        welcomeTitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '600',
          color: activeTheme.colors.text,
          textAlign: 'center',
          marginBottom: activeTheme.spacing.sm,
        },
        welcomeSub: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 14,
          color: activeTheme.colors.textSecondary,
          textAlign: 'center',
          marginBottom: activeTheme.spacing.xl,
          lineHeight: 20,
        },
        noSelectionsDue: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 15,
          color: activeTheme.colors.textMuted,
          textAlign: 'center',
          marginBottom: activeTheme.spacing.xl,
        },
        compList: { gap: activeTheme.spacing.sm, marginBottom: activeTheme.spacing.xl },
        compCard: {
          backgroundColor: activeTheme.colors.surface,
          borderRadius: activeTheme.radius.md,
          padding: activeTheme.spacing.md,
          borderWidth: 1,
          borderColor: activeTheme.colors.border,
        },
        compCardTitle: { fontFamily: activeTheme.fontFamily.regular, fontSize: 16, color: activeTheme.colors.text },
        returnBtn: {
          paddingVertical: activeTheme.spacing.md,
          alignItems: 'center',
        },
        returnBtnText: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 14,
          color: activeTheme.colors.accent,
        },
        backToCompsBtn: { paddingVertical: activeTheme.spacing.sm, alignItems: 'center' },
        backToCompsText: { fontFamily: activeTheme.fontFamily.regular, fontSize: 14, color: activeTheme.colors.textMuted },
        sectionTitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '600',
          color: activeTheme.colors.text,
          marginBottom: activeTheme.spacing.sm,
        },
        dayTabsRow: { flexDirection: 'row', width: '100%', marginBottom: activeTheme.spacing.md },
        dayTab: {
          flex: 1,
          paddingVertical: activeTheme.spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        dayTabActive: { borderBottomColor: activeTheme.colors.accent },
        dayTabText: { fontFamily: activeTheme.fontFamily.regular, fontSize: 13, color: activeTheme.colors.textMuted },
        dayTabTextActive: { color: activeTheme.colors.accent, fontWeight: '600' },
        raceCountRow: { marginBottom: activeTheme.spacing.xs },
        raceCountText: { fontFamily: activeTheme.fontFamily.regular, fontSize: 13, color: activeTheme.colors.textMuted },
        raceTabsRow: { flexDirection: 'row', width: '100%', marginBottom: activeTheme.spacing.md },
        raceTab: {
          flex: 1,
          minWidth: 48,
          paddingVertical: activeTheme.spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        raceTabActive: { borderBottomColor: activeTheme.colors.accent },
        raceTabPicked: { backgroundColor: activeTheme.colors.accentMuted },
        raceTabText: { fontFamily: activeTheme.fontFamily.regular, fontSize: 13, color: activeTheme.colors.textMuted },
        raceTabTextActive: { color: activeTheme.colors.accent, fontWeight: '600' },
        raceTabTextPicked: { color: activeTheme.colors.accent },
        runnerList: { gap: activeTheme.spacing.xs, marginBottom: activeTheme.spacing.lg },
        selectFavLabel: { fontFamily: activeTheme.fontFamily.regular, fontSize: 12, color: activeTheme.colors.textMuted, marginBottom: activeTheme.spacing.xs },
        divider: { height: 2, backgroundColor: activeTheme.colors.accent, marginVertical: activeTheme.spacing.md, borderRadius: 1 },
        orSelectLabel: { fontFamily: activeTheme.fontFamily.regular, fontSize: 12, color: activeTheme.colors.textMuted, marginBottom: activeTheme.spacing.xs },
        runnerCard: {
          borderRadius: activeTheme.radius.md,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: activeTheme.colors.border,
        },
        runnerCardSelected: { backgroundColor: activeTheme.colors.accent, borderColor: activeTheme.colors.accent },
        runnerCardInner: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: activeTheme.colors.surface,
          paddingVertical: activeTheme.spacing.sm,
          paddingHorizontal: activeTheme.spacing.md,
        },
        runnerCardInnerSelected: { backgroundColor: 'transparent' },
        runnerCenter: { flex: 1, minWidth: 0 },
        runnerName: { fontFamily: activeTheme.fontFamily.regular, fontSize: 13, fontWeight: '600', color: activeTheme.colors.text },
        runnerNameSelected: { color: activeTheme.colors.black },
        runnerJockey: { fontFamily: activeTheme.fontFamily.regular, fontSize: 11, color: activeTheme.colors.textMuted, marginTop: 2 },
        runnerJockeySelected: { color: 'rgba(0,0,0,0.7)' },
        runnerNumber: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: activeTheme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: activeTheme.spacing.md,
        },
        runnerNumberSelected: { backgroundColor: activeTheme.colors.white },
        runnerNumberText: { fontFamily: activeTheme.fontFamily.regular, fontSize: 12, color: activeTheme.colors.text },
        runnerNumberTextSelected: { color: activeTheme.colors.black },
        runnerSelect: { fontFamily: activeTheme.fontFamily.regular, fontSize: 12, color: activeTheme.colors.textMuted },
        saveBtn: {
          backgroundColor: activeTheme.colors.accent,
          borderRadius: activeTheme.radius.md,
          paddingVertical: activeTheme.spacing.md,
          alignItems: 'center',
          marginTop: activeTheme.spacing.lg,
          marginBottom: activeTheme.spacing.md,
        },
        saveBtnDisabled: { opacity: 0.7 },
        saveBtnText: { fontFamily: activeTheme.fontFamily.regular, fontSize: 16, color: activeTheme.colors.black, fontWeight: '600' },
        muted: { fontFamily: activeTheme.fontFamily.regular, fontSize: 14, color: activeTheme.colors.textMuted, marginBottom: activeTheme.spacing.lg },
        buttonDisabled: { opacity: 0.7 },
      }),
    [activeTheme, insets.top, insets.bottom]
  );

  if (!data) {
    return (
      <KeyboardAvoidingView
        style={styles.codeEntryContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.codeEntryContent}>
          <Text style={styles.codeEntryTitle}>Top Tipster Racing</Text>
          <Text style={styles.codeEntrySubtitle}>Enter your 6-digit quick access code</Text>
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
            {loading ? <ActivityIndicator color={theme.colors.black} /> : <Text style={styles.codeEntryButtonText}>Continue</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.codeEntryBackText}>Back to sign in</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const displayName = data.display_name ?? 'there';

  if (!competitionId) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.welcomeTitle}>Welcome {displayName} to quick access</Text>
        <Text style={styles.welcomeSub}>
          Please select one of your available competitions to make or edit your picks.
        </Text>
        {liveComps.length === 0 ? (
          <>
            <Text style={styles.noSelectionsDue}>You have no selections due.</Text>
            <TouchableOpacity style={styles.returnBtn} onPress={handleBackToCode}>
              <Text style={styles.returnBtnText}>Return</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.compList}>
              {liveComps.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.compCard}
                  onPress={() => {
                    setCompetitionId(c.id);
                    setSelectedDate(null);
                    setSelections({});
                    setSelectedRaceIndex(0);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.compCardTitle}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.returnBtn} onPress={handleBackToCode}>
              <Text style={styles.returnBtnText}>Return</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  }

  if (!selectedDate && raceDaysForComp.length > 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={activeTheme.colors.accent} />
      </View>
    );
  }

  if (raceDaysForComp.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.muted}>No race days for this competition yet.</Text>
        <TouchableOpacity style={styles.returnBtn} onPress={() => setCompetitionId(null)}>
          <Text style={styles.returnBtnText}>← Back to competitions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.backToCompsBtn} onPress={() => { setCompetitionId(null); setSelectedDate(null); }}>
          <Text style={styles.backToCompsText}>← Back to competitions</Text>
        </TouchableOpacity>
        <Text style={styles.sectionTitle}>Make your picks</Text>

        {raceDaysForComp.length >= 1 && (
          <View style={styles.dayTabsRow}>
            {raceDaysForComp.map((d, i) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.dayTab, selectedDate === d.race_date && styles.dayTabActive]}
                onPress={() => { setSelectedDate(d.race_date); setSelections({}); setSelectedRaceIndex(0); }}
              >
                <Text style={[styles.dayTabText, selectedDate === d.race_date && styles.dayTabTextActive]}>
                  Day {i + 1}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {races.length === 0 && (
          <Text style={styles.muted}>No races loaded for this day. Race data is updated daily.</Text>
        )}

        {races.length > 0 && (
          <>
            <View style={styles.raceCountRow}>
              <Text style={styles.raceCountText}>
                {races.filter((r) => selectionsToUse[r.id]).length} of {races.length} races picked
              </Text>
            </View>
            <View style={styles.raceTabsRow}>
              {races.map((race, idx) => {
                const hasSelection = !!selectionsToUse[race.id];
                return (
                  <TouchableOpacity
                    key={race.id}
                    style={[
                      styles.raceTab,
                      selectedRaceIndex === idx && styles.raceTabActive,
                      hasSelection && styles.raceTabPicked,
                    ]}
                    onPress={() => setSelectedRaceIndex(idx)}
                  >
                    <Text
                      style={[
                        styles.raceTabText,
                        selectedRaceIndex === idx && styles.raceTabTextActive,
                        hasSelection && styles.raceTabTextPicked,
                      ]}
                    >
                      {new Date(race.scheduledTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedRace && (() => {
              const runners = (selectedRace.runners ?? []) as Runner[];
              const favRunner = runners.find((r) => r.id === 'FAV');
              const horseRunners = runners.filter((r) => r.id !== 'FAV');
              const renderRunner = (r: Runner) => {
                const isSelected = selectionsToUse[selectedRace.id]?.runnerId === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.runnerCard, isSelected && styles.runnerCardSelected]}
                    onPress={() => setSelection(selectedRace.id, r.id, r.name, r.oddsDecimal ?? 0)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.runnerCardInner, isSelected && styles.runnerCardInnerSelected]}>
                      <View style={[styles.runnerNumber, isSelected && styles.runnerNumberSelected]}>
                        <Text style={[styles.runnerNumberText, isSelected && styles.runnerNumberTextSelected]}>
                          {r.id === 'FAV' ? '★' : (r as Runner & { number?: number }).number ?? '—'}
                        </Text>
                      </View>
                      <View style={styles.runnerCenter}>
                        <Text style={[styles.runnerName, isSelected && styles.runnerNameSelected]} numberOfLines={1}>
                          {displayHorseName(r.name)}
                        </Text>
                        {r.jockey ? (
                          <Text style={[styles.runnerJockey, isSelected && styles.runnerJockeySelected]} numberOfLines={1}>{r.jockey}</Text>
                        ) : null}
                      </View>
                      {isSelected ? (
                        <Text style={styles.runnerNumberTextSelected}>✓</Text>
                      ) : (
                        <Text style={styles.runnerSelect}>Select</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              };
              return (
                <View style={styles.runnerList}>
                  <Text style={styles.selectFavLabel}>Select fav</Text>
                  {favRunner && renderRunner(favRunner)}
                  <View style={styles.divider} />
                  <Text style={styles.orSelectLabel}>or select your horse</Text>
                  {horseRunners.map(renderRunner)}
                </View>
              );
            })()}

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={theme.colors.black} />
              ) : (
                <Text style={styles.saveBtnText}>Save selections</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity style={styles.backToCompsBtn} onPress={() => { setCompetitionId(null); setSelectedDate(null); }}>
          <Text style={styles.backToCompsText}>← Back to competitions</Text>
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
}
