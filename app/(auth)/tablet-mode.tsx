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
  Modal,
  Pressable,
  useWindowDimensions,
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
    locked_at?: string | null;
  }>;
};

const CODE_LENGTH = 6;
/** Side-by-side picking + summary on large screens (e.g. tablet in landscape / pub). */
const TABLET_SPLIT_MIN_WIDTH = 768;

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

function submitSuccessAlert(onContinue: () => void) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert('Your selections have been saved.');
    onContinue();
    return;
  }
  Alert.alert('Saved', 'Your selections have been saved.', [{ text: 'Back to quick access', onPress: onContinue }]);
}

export default function TabletModeScreen() {
  const activeTheme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const isWideLayout = windowWidth >= TABLET_SPLIT_MIN_WIDTH;
  const [code, setCode] = useState('');
  const codeInputRefs = useRef<(TextInput | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<TabletData | null>(null);
  const [competitionId, setCompetitionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }>>({});
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  const [selectionToast, setSelectionToast] = useState<{ raceId: string; runnerName: string } | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const currentCode = data ? code : code.trim();

  const liveComps = useMemo(
    () => (data?.competitions ?? []).filter((c) => c.status === 'live'),
    [data?.competitions]
  );

  const todayDate = new Date().toISOString().slice(0, 10);
  const raceDaysForComp = useMemo(
    () =>
      (data?.race_days ?? []).filter(
        (rd) => rd.competition_id === competitionId && rd.race_date === todayDate
      ),
    [data?.race_days, competitionId, todayDate]
  );

  const currentDay = raceDaysForComp.find((d) => d.race_date === selectedDate);
  const races = (currentDay?.races ?? []).filter(Boolean);
  const selectedRace = races[selectedRaceIndex] ?? races[0] ?? null;

  const existingForDay = data?.selections.find(
    (s) => s.competition_id === competitionId && s.race_date === selectedDate
  );
  const isDayLocked = !!existingForDay?.locked_at;
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

  const handleQuickAccessLogout = useCallback(() => {
    handleBackToCode();
    router.replace('/(auth)/login');
  }, [handleBackToCode]);

  const setSelection = useCallback(
    (raceId: string, runnerId: string, runnerName: string, oddsDecimal: number) => {
      if (isDayLocked) return;
      setSelections((prev) => ({ ...prev, [raceId]: { runnerId, runnerName, oddsDecimal } }));
      setSelectionToast({ raceId, runnerName });
    },
    [isDayLocked]
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
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert(out?.error === 'invalid_code' ? 'Session expired. Enter your code again.' : 'Could not save your selections.');
        } else {
          Alert.alert('Error', out?.error === 'invalid_code' ? 'Session expired. Enter your code again.' : 'Could not save your selections.');
        }
        return;
      }
      submitSuccessAlert(handleBackToCode);
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
          justifyContent: 'flex-start',
          padding: activeTheme.spacing.lg,
          paddingTop: activeTheme.spacing.xxl + insets.top,
          paddingBottom: activeTheme.spacing.lg + insets.bottom,
        },
        codeEntryContent: { maxWidth: 400, width: '100%', alignSelf: 'center' },
        codeEntrySubtitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 16,
          color: activeTheme.colors.textSecondary,
          textAlign: 'center',
          marginBottom: activeTheme.spacing.xxl,
        },
        codeEntryFormWrap: {
          marginTop: activeTheme.spacing.xxl,
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
        raceCountRow: { marginBottom: activeTheme.spacing.xs },
        raceCountText: { fontFamily: activeTheme.fontFamily.regular, fontSize: 13, color: activeTheme.colors.textMuted },
        raceTabsScroll: { marginBottom: activeTheme.spacing.md },
        raceTabsRow: { flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing.sm, paddingHorizontal: 2 },
        raceTab: {
          minWidth: 72,
          paddingVertical: activeTheme.spacing.sm,
          paddingHorizontal: activeTheme.spacing.md,
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
        lockedWrap: {
          backgroundColor: activeTheme.colors.surface,
          borderRadius: activeTheme.radius.md,
          borderWidth: 1,
          borderColor: activeTheme.colors.border,
          padding: activeTheme.spacing.lg,
          marginBottom: activeTheme.spacing.lg,
        },
        lockedTitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 17,
          fontWeight: '600',
          color: activeTheme.colors.text,
          textAlign: 'center',
          marginBottom: activeTheme.spacing.sm,
        },
        lockedText: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 14,
          color: activeTheme.colors.textMuted,
          textAlign: 'center',
          lineHeight: 20,
          marginBottom: activeTheme.spacing.md,
        },
        lockedLogoutBtn: {
          backgroundColor: activeTheme.colors.accent,
          borderRadius: activeTheme.radius.md,
          paddingVertical: activeTheme.spacing.md,
          alignItems: 'center',
        },
        lockedLogoutBtnText: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '600',
          color: activeTheme.colors.black,
        },
        buttonDisabled: { opacity: 0.7 },
        selectionToastOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.35)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: activeTheme.spacing.lg,
        },
        selectionToastCard: {
          width: '100%',
          maxWidth: 520,
          backgroundColor: activeTheme.colors.surface,
          borderRadius: activeTheme.radius.md,
          borderWidth: 1,
          borderColor: activeTheme.colors.border,
          padding: activeTheme.spacing.lg,
        },
        selectionToastTitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '600',
          color: activeTheme.colors.textMuted,
          marginBottom: activeTheme.spacing.sm,
        },
        selectionToastChoice: {
          backgroundColor: activeTheme.colors.accent,
          borderRadius: activeTheme.radius.sm,
          paddingVertical: activeTheme.spacing.sm,
          paddingHorizontal: activeTheme.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: activeTheme.spacing.xs,
          marginBottom: activeTheme.spacing.md,
        },
        selectionToastChoiceText: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '600',
          color: activeTheme.colors.white,
        },
        selectionToastActions: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: activeTheme.spacing.sm,
          paddingHorizontal: activeTheme.spacing.xs,
        },
        selectionToastActionBtn: {
          backgroundColor: activeTheme.colors.surface,
          borderRadius: activeTheme.radius.sm,
          borderWidth: 1,
          borderColor: activeTheme.colors.border,
          paddingVertical: activeTheme.spacing.sm,
          paddingHorizontal: activeTheme.spacing.md,
          flex: 1,
          alignItems: 'center',
        },
        selectionToastActionPrimary: {
          backgroundColor: activeTheme.colors.accent,
          borderColor: activeTheme.colors.accent,
        },
        selectionToastActionText: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 13,
          color: activeTheme.colors.text,
        },
        selectionToastActionTextPrimary: {
          color: activeTheme.colors.black,
          fontWeight: '600',
        },
        splitRoot: {
          flex: 1,
          flexDirection: 'row',
          minHeight: 0,
          backgroundColor: activeTheme.colors.background,
        },
        splitLeftScroll: { flex: 3, minWidth: 0 },
        splitRightPanel: {
          flex: 2,
          maxWidth: 440,
          minWidth: 260,
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderLeftColor: activeTheme.colors.border,
          backgroundColor: activeTheme.colors.surfaceElevated ?? activeTheme.colors.surface,
          paddingHorizontal: activeTheme.spacing.lg,
          paddingTop: activeTheme.spacing.md + insets.top,
          paddingBottom: activeTheme.spacing.lg + insets.bottom,
          justifyContent: 'space-between',
        },
        splitBrandEyebrow: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          color: activeTheme.colors.accent,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 4,
        },
        splitBrandTitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '700',
          color: activeTheme.colors.text,
          marginBottom: activeTheme.spacing.lg,
        },
        summaryHeading: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '600',
          color: activeTheme.colors.textSecondary,
          marginBottom: activeTheme.spacing.sm,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        },
        summaryScroll: { flexGrow: 0, maxHeight: '55%' },
        summaryRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: activeTheme.spacing.sm,
          paddingVertical: activeTheme.spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: activeTheme.colors.border,
        },
        summaryRaceTime: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 12,
          color: activeTheme.colors.textMuted,
          width: 52,
        },
        summaryHorse: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '600',
          color: activeTheme.colors.text,
          flex: 1,
          textAlign: 'right',
        },
        submitSelectionsBtn: {
          backgroundColor: activeTheme.colors.accent,
          borderRadius: activeTheme.radius.md,
          paddingVertical: activeTheme.spacing.md,
          alignItems: 'center',
          marginTop: activeTheme.spacing.lg,
        },
        submitSelectionsBtnText: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '600',
          color: activeTheme.colors.black,
        },
        submitHint: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 12,
          color: activeTheme.colors.textMuted,
          textAlign: 'center',
          marginTop: activeTheme.spacing.sm,
          lineHeight: 16,
        },
        mobileSubmitBar: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: activeTheme.colors.border,
          backgroundColor: activeTheme.colors.surface,
          paddingHorizontal: activeTheme.spacing.lg,
          paddingTop: activeTheme.spacing.md,
          paddingBottom: activeTheme.spacing.lg + insets.bottom,
        },
        mobileSummaryHeading: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: activeTheme.colors.textSecondary,
          marginBottom: activeTheme.spacing.sm,
        },
        codeBrandBlock: { alignItems: 'center', marginBottom: activeTheme.spacing.lg },
        codeBrandTitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 26,
          fontWeight: '700',
          color: activeTheme.colors.text,
          textAlign: 'center',
        },
        codeBrandTag: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 11,
          color: activeTheme.colors.textMuted,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          marginTop: activeTheme.spacing.sm,
          textAlign: 'center',
        },
        compPickerBrand: {
          alignItems: 'center',
          marginBottom: activeTheme.spacing.xl,
          paddingTop: activeTheme.spacing.sm,
        },
        compPickerBrandTitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 22,
          fontWeight: '700',
          color: activeTheme.colors.text,
          textAlign: 'center',
        },
        compPickerBrandSub: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 12,
          color: activeTheme.colors.textMuted,
          marginTop: 6,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        },
        pickingBrandRow: {
          marginBottom: activeTheme.spacing.md,
        },
        pickingBrandSmall: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          color: activeTheme.colors.accent,
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 4,
        },
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
          <View style={styles.codeBrandBlock}>
            <Text style={styles.codeBrandTitle}>Top Tipster Racing</Text>
            <Text style={styles.codeBrandTag}>Fantasy racing · Quick access</Text>
          </View>
          <Text style={styles.codeEntrySubtitle}>Enter your 6-digit code to make picks on this device</Text>
          <View style={styles.codeEntryFormWrap}>
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
        </View>
      </KeyboardAvoidingView>
    );
  }

  const displayName = data.display_name ?? 'there';

  if (!competitionId) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.compPickerBrand}>
          <Text style={styles.compPickerBrandTitle}>Top Tipster Racing</Text>
          <Text style={styles.compPickerBrandSub}>Quick access</Text>
        </View>
        <Text style={styles.welcomeTitle}>Welcome, {displayName}</Text>
        <Text style={styles.welcomeSub}>
          Choose a live competition to make your picks for today&apos;s meeting.
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

  const pickedCount = races.filter((r) => selectionsToUse[r.id]).length;
  const allRacesPicked = races.length > 0 && pickedCount === races.length;
  const useSplitLayout = isWideLayout && races.length > 0 && !isDayLocked;

  const renderRunnerBlock = () => {
    if (!selectedRace) return null;
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
  };

  const summaryRowsEl = (
    <>
      {races.map((race) => (
        <View key={race.id} style={styles.summaryRow}>
          <Text style={styles.summaryRaceTime}>
            {new Date(race.scheduledTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.summaryHorse} numberOfLines={2}>
            {selectionsToUse[race.id] ? displayHorseName(selectionsToUse[race.id].runnerName) : '—'}
          </Text>
        </View>
      ))}
    </>
  );

  const submitPanelEl = !isDayLocked && races.length > 0 ? (
    <View>
      {useSplitLayout ? (
        <ScrollView style={styles.summaryScroll} showsVerticalScrollIndicator={false}>
          {summaryRowsEl}
        </ScrollView>
      ) : (
        <View style={{ marginBottom: activeTheme.spacing.md }}>{summaryRowsEl}</View>
      )}
      <TouchableOpacity
        style={[styles.submitSelectionsBtn, (!allRacesPicked || saving) && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!allRacesPicked || saving}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color={activeTheme.colors.black} />
        ) : (
          <Text style={styles.submitSelectionsBtnText}>Submit selections</Text>
        )}
      </TouchableOpacity>
      {!allRacesPicked && (
        <Text style={styles.submitHint}>
          Complete all {races.length} races to submit ({pickedCount} of {races.length} picked).
        </Text>
      )}
    </View>
  ) : null;

  const pickingScrollContent = (
    <>
      <TouchableOpacity style={styles.backToCompsBtn} onPress={() => { setCompetitionId(null); setSelectedDate(null); }}>
        <Text style={styles.backToCompsText}>← Back to competitions</Text>
      </TouchableOpacity>
      <View style={styles.pickingBrandRow}>
        <Text style={styles.pickingBrandSmall}>Top Tipster Racing</Text>
        <Text style={styles.sectionTitle}>Make your picks</Text>
      </View>

      {races.length === 0 && <Text style={styles.muted}>No races available for today in this competition.</Text>}

      {races.length > 0 && (
        <>
          {isDayLocked ? (
            <View style={styles.lockedWrap}>
              <Text style={styles.lockedTitle}>Selections already locked</Text>
              <Text style={styles.lockedText}>
                It looks like you have already locked in your selections for this meeting.
              </Text>
              <TouchableOpacity style={styles.lockedLogoutBtn} onPress={handleQuickAccessLogout}>
                <Text style={styles.lockedLogoutBtnText}>Log out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.raceCountRow}>
                <Text style={styles.raceCountText}>
                  {pickedCount} of {races.length} races picked
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.raceTabsScroll} contentContainerStyle={styles.raceTabsRow}>
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
              </ScrollView>
              {renderRunnerBlock()}
            </>
          )}
        </>
      )}

      <TouchableOpacity style={styles.backToCompsBtn} onPress={() => { setCompetitionId(null); setSelectedDate(null); }}>
        <Text style={styles.backToCompsText}>← Back to competitions</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: activeTheme.colors.background }, { opacity: fadeAnim }]}>
      {useSplitLayout ? (
        <View style={styles.splitRoot}>
          <ScrollView style={styles.splitLeftScroll} contentContainerStyle={styles.scrollContent}>
            {pickingScrollContent}
          </ScrollView>
          <View style={styles.splitRightPanel}>
            <View>
              <Text style={styles.splitBrandEyebrow}>Quick access</Text>
              <Text style={styles.splitBrandTitle}>Top Tipster Racing</Text>
              <Text style={styles.summaryHeading}>Your selections</Text>
            </View>
            {submitPanelEl}
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
            {pickingScrollContent}
          </ScrollView>
          {races.length > 0 && !isDayLocked && (
            <View style={styles.mobileSubmitBar}>
              <Text style={styles.mobileSummaryHeading}>Your selections today</Text>
              {submitPanelEl}
            </View>
          )}
        </View>
      )}

      <Modal visible={!!selectionToast && !isDayLocked} transparent animationType="fade" onRequestClose={() => setSelectionToast(null)}>
        <Pressable style={styles.selectionToastOverlay} onPress={() => setSelectionToast(null)}>
          <Pressable style={styles.selectionToastCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.selectionToastTitle}>Selection saved</Text>
            <Text style={[styles.selectionToastActionText, { marginBottom: activeTheme.spacing.md, textAlign: 'center' }]}>
              {selectedRaceIndex < races.length - 1
                ? 'Go to the next race?'
                : 'Last race — scroll down to review and submit when ready.'}
            </Text>
            <View style={styles.selectionToastChoice}>
              <Text style={styles.selectionToastChoiceText}>✓</Text>
              <Text style={styles.selectionToastChoiceText} numberOfLines={1}>
                {selectionToast?.runnerName ? displayHorseName(selectionToast.runnerName) : ''}
              </Text>
            </View>
            <View style={styles.selectionToastActions}>
              <TouchableOpacity style={styles.selectionToastActionBtn} onPress={() => setSelectionToast(null)}>
                <Text style={styles.selectionToastActionText}>Stay on this race</Text>
              </TouchableOpacity>
              {selectedRaceIndex < races.length - 1 ? (
                <TouchableOpacity
                  style={[styles.selectionToastActionBtn, styles.selectionToastActionPrimary]}
                  onPress={() => {
                    setSelectedRaceIndex((prev) => prev + 1);
                    setSelectionToast(null);
                  }}
                >
                  <Text style={[styles.selectionToastActionText, styles.selectionToastActionTextPrimary]}>Next race</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.selectionToastActionBtn, styles.selectionToastActionPrimary]}
                  onPress={() => setSelectionToast(null)}
                >
                  <Text style={[styles.selectionToastActionText, styles.selectionToastActionTextPrimary]}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Animated.View>
  );
}
