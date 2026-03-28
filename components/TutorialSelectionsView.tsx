import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { displayHorseName } from '@/lib/displayHorseName';
import { fetchTutorialData } from '@/lib/fetchTutorialData';
import {
  botSelectionsByUser,
  getTutorialMeetingStart,
  raceDateFromMeetingStart,
  tutorialJsonToRaces,
} from '@/lib/tutorialRaceBuilders';
import {
  loadTutorialSession,
  saveTutorialSession,
  tutorialMeetingSlug,
  type TutorialSessionPick,
} from '@/lib/tutorialSession';
import type { TutorialGetDataPayload } from '@/lib/tutorialTypes';
import type { Race } from '@/types/races';

type Props = { userId: string };

export function TutorialSelectionsView({ userId }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<TutorialGetDataPayload | null>(null);
  const [selections, setSelections] = useState<Record<string, TutorialSessionPick>>({});
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRaceIndex, setSelectedRaceIndex] = useState(0);
  const [selectionToast, setSelectionToast] = useState<{ runnerName: string } | null>(null);

  const meetingStart = useMemo(() => getTutorialMeetingStart(), []);
  const slug = tutorialMeetingSlug(payload);
  const races = useMemo(() => tutorialJsonToRaces(payload?.races, meetingStart), [payload?.races, meetingStart]);
  const raceDate = raceDateFromMeetingStart(meetingStart);
  const selectedRace = races[selectedRaceIndex] ?? races[0];
  const botsById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of payload?.bots ?? []) m[b.id] = b.displayName;
    return m;
  }, [payload?.bots]);
  const botSels = useMemo(() => botSelectionsByUser(payload?.botSelections), [payload?.botSelections]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const data = await fetchTutorialData();
      if (cancelled) return;
      setPayload(data);
      if (data) {
        const session = await loadTutorialSession(userId, tutorialMeetingSlug(data));
        if (!cancelled && session) {
          setSelections(session.selections);
          setLocked(session.locked);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (!payload) return;
      void (async () => {
        const session = await loadTutorialSession(userId, tutorialMeetingSlug(payload));
        if (session) {
          setSelections(session.selections);
          setLocked(session.locked);
        }
      })();
    }, [userId, payload])
  );

  const persist = useCallback(
    async (nextSel: Record<string, TutorialSessionPick>, nextLocked: boolean) => {
      await saveTutorialSession(userId, slug, { selections: nextSel, locked: nextLocked });
    },
    [userId, slug]
  );

  const setPick = (raceId: string, pick: TutorialSessionPick) => {
    if (locked) return;
    setSelections((prev) => ({ ...prev, [raceId]: pick }));
    setSelectionToast({ runnerName: pick.runnerName });
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await persist(selections, locked);
      if (Platform.OS === 'web') window.alert('Practice picks saved on this device only.');
      else Alert.alert('Saved', 'Practice picks saved on this device only.');
    } finally {
      setSaving(false);
    }
  };

  const allPicked = races.length > 0 && races.every((r) => selections[r.id]);

  const onLock = async () => {
    if (!allPicked || locked) return;
    setLocked(true);
    await persist(selections, true);
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        banner: {
          backgroundColor: theme.colors.accentMuted,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.accent,
        },
        bannerText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.accent,
          textAlign: 'center',
        },
        scroll: { flex: 1 },
        content: { padding: theme.spacing.md, paddingBottom: 200 },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: theme.spacing.xs,
        },
        subtitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.md,
        },
        exitLink: { marginBottom: theme.spacing.md },
        exitLinkText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.accent,
          fontWeight: '500',
        },
        headerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: theme.spacing.sm,
        },
        saveBtn: {
          backgroundColor: theme.colors.accent,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
          opacity: 1,
        },
        saveBtnDisabled: { opacity: 0.5 },
        saveBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '600',
          color: theme.colors.black,
        },
        lockBtn: {
          marginTop: theme.spacing.sm,
          backgroundColor: theme.colors.surface,
          borderWidth: 2,
          borderColor: theme.colors.accent,
          paddingVertical: theme.spacing.sm,
          borderRadius: theme.radius.md,
          alignItems: 'center',
        },
        lockBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.accent,
        },
        raceTabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.md },
        raceTab: {
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: 2,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        raceTabActive: { borderColor: theme.colors.accent },
        raceTabPicked: { borderColor: theme.colors.accentMuted },
        raceTabText: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.text },
        raceTabTextActive: { color: theme.colors.accent, fontWeight: '600' },
        runnerCard: {
          borderRadius: theme.radius.md,
          marginBottom: theme.spacing.xs,
          borderWidth: 2,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        runnerCardSelected: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentMuted },
        runnerInner: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
        },
        runnerNum: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: theme.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: theme.spacing.md,
        },
        runnerNumSel: { backgroundColor: theme.colors.white },
        runnerNumText: { fontFamily: theme.fontFamily.regular, fontSize: 12, fontWeight: '600' },
        runnerCenter: { flex: 1, minWidth: 0 },
        runnerName: { fontFamily: theme.fontFamily.regular, fontSize: 15, fontWeight: '600', color: theme.colors.text },
        runnerJockey: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textMuted },
        lockedBanner: {
          backgroundColor: 'rgba(21, 128, 61, 0.12)',
          padding: theme.spacing.sm,
          borderRadius: theme.radius.sm,
          marginBottom: theme.spacing.md,
        },
        lockedBannerText: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.text },
        othersSection: { marginTop: theme.spacing.lg },
        othersTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
        },
        othersRace: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        othersRaceName: { fontFamily: theme.fontFamily.regular, fontSize: 14, fontWeight: '600', color: theme.colors.text },
        othersLine: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
        coachBar: {
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.md,
          paddingBottom: Math.max(theme.spacing.md, insets.bottom),
        },
        coachText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          lineHeight: 20,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.md,
        },
        coachActions: { flexDirection: 'row', gap: theme.spacing.sm },
        coachBtn: {
          flex: 1,
          paddingVertical: theme.spacing.sm,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
        },
        coachBtnPrimary: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
        coachBtnText: { fontFamily: theme.fontFamily.regular, fontSize: 14, fontWeight: '600', color: theme.colors.text },
        coachBtnTextPrimary: { color: theme.colors.black },
        centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg },
        toastOverlay: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.35)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing.lg,
        },
        toastCard: {
          backgroundColor: theme.colors.surface,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          width: '88%' as const,
          maxWidth: 400,
        },
      }),
    [theme, insets.bottom]
  );

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  if (!payload?.races?.length) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.subtitle}>Could not load practice data. Check your connection and try again.</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={() => router.replace('/(app)/selections')}>
          <Text style={styles.saveBtnText}>Back to My selections</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const meetingTitle = payload.meeting?.title ?? 'Tutorial';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>Practice — {meetingTitle} · {raceDate}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>My selections (practice)</Text>
        <Text style={styles.subtitle}>Nothing here is saved to a real competition.</Text>
        <TouchableOpacity style={styles.exitLink} onPress={() => router.replace('/(app)/selections')} activeOpacity={0.7}>
          <Text style={styles.exitLinkText}>← Exit practice mode</Text>
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <Text style={[styles.subtitle, { marginBottom: 0 }]}>
            {races.filter((r) => selections[r.id]).length} of {races.length} races picked
          </Text>
          {!locked && (
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={theme.colors.black} size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          )}
        </View>

        {locked && (
          <View style={styles.lockedBanner}>
            <Text style={styles.lockedBannerText}>Locked in — sample bots’ picks are shown below.</Text>
          </View>
        )}

        <View style={styles.raceTabsRow}>
          {races.map((race, idx) => {
            const has = !!selections[race.id];
            return (
              <TouchableOpacity
                key={race.id}
                style={[styles.raceTab, selectedRaceIndex === idx && styles.raceTabActive, has && styles.raceTabPicked]}
                onPress={() => setSelectedRaceIndex(idx)}
              >
                <Text style={[styles.raceTabText, selectedRaceIndex === idx && styles.raceTabTextActive]}>
                  {new Date(race.scheduledTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedRace && (
          <View>
            <Text style={[styles.othersTitle, { marginBottom: theme.spacing.sm }]}>{selectedRace.name}</Text>
            {(selectedRace.runners ?? []).map((r) => {
              const isSelected = selections[selectedRace.id]?.runnerId === r.id;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.runnerCard, isSelected && styles.runnerCardSelected]}
                  onPress={() => !locked && setPick(selectedRace.id, { runnerId: r.id, runnerName: r.name, oddsDecimal: r.oddsDecimal })}
                  disabled={locked}
                  activeOpacity={0.75}
                >
                  <View style={styles.runnerInner}>
                    <View style={[styles.runnerNum, isSelected && styles.runnerNumSel]}>
                      <Text style={styles.runnerNumText}>{r.number ?? '—'}</Text>
                    </View>
                    <View style={styles.runnerCenter}>
                      <Text style={styles.runnerName} numberOfLines={1}>
                        {displayHorseName(r.name)}
                      </Text>
                      {r.jockey ? <Text style={styles.runnerJockey}>{r.jockey}</Text> : null}
                    </View>
                    <Text style={styles.runnerName}>{isSelected ? '✓' : 'Select'}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!locked && allPicked && (
          <TouchableOpacity style={styles.lockBtn} onPress={onLock} activeOpacity={0.85}>
            <Text style={styles.lockBtnText}>Lock in</Text>
          </TouchableOpacity>
        )}

        {locked && (
          <View style={styles.othersSection}>
            <Text style={styles.othersTitle}>Other players (sample)</Text>
            {races.map((race: Race) => (
              <View key={race.id} style={styles.othersRace}>
                <Text style={styles.othersRaceName}>{race.name}</Text>
                {Object.entries(botSels).map(([botId, byRace]) => {
                  const pick = byRace[race.id];
                  if (!pick) return null;
                  return (
                    <Text key={botId} style={styles.othersLine}>
                      {botsById[botId] ?? 'Bot'}: {displayHorseName(pick.runnerName)}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!selectionToast} transparent animationType="fade" onRequestClose={() => setSelectionToast(null)}>
        <Pressable style={styles.toastOverlay} onPress={() => setSelectionToast(null)}>
          <Pressable style={styles.toastCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.othersTitle}>Your pick</Text>
            <Text style={styles.runnerName}>{selectionToast?.runnerName}</Text>
            <TouchableOpacity style={[styles.saveBtn, { marginTop: theme.spacing.md }]} onPress={() => setSelectionToast(null)}>
              <Text style={styles.saveBtnText}>OK</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.coachBar}>
        <Text style={styles.coachText}>
          Save picks on this device, lock in to reveal sample bots, then open Leaderboard and Results to see points — same flow as a real
          meeting.
        </Text>
        <View style={styles.coachActions}>
          <TouchableOpacity style={[styles.coachBtn, styles.coachBtnPrimary]} onPress={() => router.push('/(app)/leaderboard?tutorial=1')}>
            <Text style={[styles.coachBtnText, styles.coachBtnTextPrimary]}>Leaderboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.coachBtn} onPress={() => router.push('/(app)/results?tutorial=1')}>
            <Text style={styles.coachBtnText}>Results</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={[styles.coachBtn, { marginTop: theme.spacing.sm }]} onPress={() => router.push('/(app)/tutorial-sandbox')}>
          <Text style={styles.coachBtnText}>Practice Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
