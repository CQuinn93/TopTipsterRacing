import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { displayHorseName } from '@/lib/displayHorseName';
import { decimalToFractional } from '@/lib/oddsFormat';
import { POSITION_POINTS } from '@/lib/appUtils';
import { fetchTutorialData } from '@/lib/fetchTutorialData';
import { buildTutorialMeetingResults } from '@/lib/tutorialResultsMeeting';
import { getTutorialMeetingStart, tutorialJsonToRaces } from '@/lib/tutorialRaceBuilders';
import { loadTutorialSession, tutorialMeetingSlug } from '@/lib/tutorialSession';
import type { TutorialGetDataPayload } from '@/lib/tutorialTypes';
import type { MeetingResults } from '@/lib/resultsTemplateForUser';

export function TutorialResultsView() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<TutorialGetDataPayload | null>(null);
  const [selectionNames, setSelectionNames] = useState<Record<string, string>>({});
  const [selectedRaceIdx, setSelectedRaceIdx] = useState(0);
  const [expandedRunnerKey, setExpandedRunnerKey] = useState<string | null>(null);

  const meetingStart = useMemo(() => getTutorialMeetingStart(), []);
  const races = useMemo(() => tutorialJsonToRaces(payload?.races, meetingStart), [payload?.races, meetingStart]);
  const slug = tutorialMeetingSlug(payload);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const data = await fetchTutorialData();
      if (!cancelled) setPayload(data);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshSession = useCallback(async () => {
    if (!userId || !payload) return;
    const s = await loadTutorialSession(userId, slug);
    if (!s?.selections) {
      setSelectionNames({});
      return;
    }
    const names: Record<string, string> = {};
    for (const [raceId, v] of Object.entries(s.selections)) {
      names[raceId] = v.runnerName;
    }
    setSelectionNames(names);
  }, [userId, payload, slug]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useFocusEffect(
    useCallback(() => {
      void refreshSession();
    }, [refreshSession])
  );

  const meetingResults: MeetingResults[] = useMemo(() => {
    if (!payload?.meeting?.title || !races.length) return [];
    return buildTutorialMeetingResults(payload.meeting.title, races, selectionNames);
  }, [payload?.meeting?.title, races, selectionNames]);

  const selectedDate = races[0] ? races[0].scheduledTimeUtc.slice(0, 10) : null;

  const getPointsForRunner = (
    r: { position: number | null; earnedPoints: boolean },
    placedPositions: number[]
  ): number => {
    if (r.position == null || !placedPositions.includes(r.position)) return POSITION_POINTS.lost;
    if (r.position === 1) return POSITION_POINTS.won;
    return POSITION_POINTS.place;
  };

  const styles = useMemo(() => {
    const isLight = String(theme.colors.background) === String(lightTheme.colors.background);
    const cardBorder = isLight ? theme.colors.white : theme.colors.border;
    const cardBorderWidth = isLight ? 2 : 1;
    return StyleSheet.create({
      root: { flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top },
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
      container: { flex: 1 },
      content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
      title: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 20,
        fontWeight: '600',
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
      exitText: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.accent, fontWeight: '500' },
      groupHeader: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 15,
        fontWeight: '600',
        color: theme.colors.accent,
        marginBottom: theme.spacing.xs,
      },
      raceTabsScroll: { marginBottom: theme.spacing.sm },
      raceTabsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
      raceTab: {
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.lg,
        borderWidth: 2,
        borderColor: theme.colors.border,
        backgroundColor: 'transparent',
      },
      raceTabActive: { borderColor: theme.colors.accent },
      raceTabText: { fontFamily: theme.fontFamily.regular, fontSize: 15, color: theme.colors.text },
      raceTabTextActive: { color: theme.colors.accent, fontWeight: '600' },
      resultCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.md,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
      },
      resultCardRaceName: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 16,
        color: theme.colors.text,
        fontWeight: '600',
        marginBottom: theme.spacing.xs,
      },
      resultCardTime: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.sm,
      },
      yourSelectionSection: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
      yourSelectionLabel: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.xs,
      },
      yourSelectionCard: {
        backgroundColor: theme.colors.accent,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
      },
      yourSelectionCardText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.white,
        fontWeight: '600',
        textAlign: 'center',
      },
      resultSectionLabel: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.xs,
      },
      runnerCardList: { gap: theme.spacing.xs },
      runnerCard: {
        flexDirection: 'column',
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        minHeight: 44,
      },
      runnerCardRow: { flexDirection: 'row', alignItems: 'center' },
      runnerCardChevron: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 10,
        color: theme.colors.textMuted,
        marginLeft: theme.spacing.xs,
      },
      runnerCardPointsBlock: {
        marginTop: theme.spacing.xs,
        paddingTop: theme.spacing.xs,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.border,
      },
      runnerCardThreeBoxRow: { flexDirection: 'row', gap: theme.spacing.sm },
      runnerCardPointsBox: {
        flex: 1,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.sm,
        alignItems: 'center',
      },
      runnerCardPointsLabel: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textMuted },
      runnerCardPointsValue: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.accent,
      },
      runnerCardEarned: {
        borderLeftWidth: 4,
        borderLeftColor: theme.colors.accent,
        backgroundColor: theme.colors.accentMuted,
      },
      runnerCardPosition: { width: 36, alignItems: 'center' },
      runnerCardPositionBadge: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.textSecondary,
      },
      runnerCardPositionWon: { color: theme.colors.accent },
      runnerCardCenter: { flex: 1, minWidth: 0, marginLeft: theme.spacing.xs },
      runnerCardName: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 14,
        color: theme.colors.text,
        fontWeight: '500',
      },
      runnerCardTotalPts: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.accent,
        marginLeft: theme.spacing.xs,
      },
      coach: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md,
        paddingBottom: Math.max(theme.spacing.md, insets.bottom),
      },
      coachText: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
      coachRow: { flexDirection: 'row', gap: theme.spacing.sm },
      coachBtn: {
        flex: 1,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
      },
      coachBtnPrimary: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
      coachBtnText: { fontFamily: theme.fontFamily.regular, fontSize: 13, fontWeight: '600', color: theme.colors.text },
      coachBtnTextPrimary: { color: theme.colors.black },
      centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg },
    });
  }, [theme, insets.top, insets.bottom]);

  useEffect(() => {
    setSelectedRaceIdx(0);
    setExpandedRunnerKey(null);
  }, [meetingResults]);

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  if (!meetingResults.length) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.subtitle}>Could not load practice results.</Text>
        <TouchableOpacity style={[styles.coachBtn, styles.coachBtnPrimary]} onPress={() => router.replace('/(app)/results')}>
          <Text style={[styles.coachBtnText, styles.coachBtnTextPrimary]}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const group = meetingResults[0];
  const raceList = group.races;
  const selectedRace = raceList[selectedRaceIdx] ?? raceList[0];
  const formatDateLabel = (dateStr: string | null) => {
    if (!dateStr) return '';
    const today = new Date().toISOString().slice(0, 10);
    if (dateStr === today) return 'Today';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <View style={styles.root}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>Practice results — tap a runner for points detail</Text>
      </View>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Results</Text>
        <Text style={styles.subtitle}>
          {selectedDate ? formatDateLabel(selectedDate) : ''} · sample meeting only
        </Text>
        <TouchableOpacity style={styles.exitLink} onPress={() => router.replace('/(app)/results')}>
          <Text style={styles.exitText}>← Exit practice mode</Text>
        </TouchableOpacity>

        <View key={group.course} style={{ marginBottom: theme.spacing.md }}>
          <Text style={styles.groupHeader}>{group.course}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.raceTabsRow} style={styles.raceTabsScroll}>
            {raceList.map((race, i) => {
              const isSelected = selectedRaceIdx === i;
              return (
                <TouchableOpacity
                  key={race.raceId}
                  style={[styles.raceTab, isSelected && styles.raceTabActive]}
                  onPress={() => {
                    setSelectedRaceIdx(i);
                    setExpandedRunnerKey(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.raceTabText, isSelected && styles.raceTabTextActive]}>
                    {new Date(race.raceTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {selectedRace && (() => {
            const fullResult = selectedRace.fullResult ?? [];
            const userSelectionName = (selectedRace.userSelection ?? '').trim();
            const yourSelectionText =
              userSelectionName.length > 0 ? displayHorseName(userSelectionName) : 'No pick (practice)';
            return (
              <View style={styles.resultCard}>
                <Text style={styles.resultCardRaceName}>{selectedRace.raceName}</Text>
                <Text style={styles.resultCardTime}>
                  {new Date(selectedRace.raceTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <View style={styles.yourSelectionSection}>
                  <Text style={styles.yourSelectionLabel}>Your selection</Text>
                  <View style={styles.yourSelectionCard}>
                    <Text style={styles.yourSelectionCardText}>{yourSelectionText}</Text>
                  </View>
                </View>
                <Text style={styles.resultSectionLabel}>Result</Text>
                <View style={styles.runnerCardList}>
                  {fullResult.map((r, idx) => {
                    const runnerKey = `${selectedRace.raceId}-${idx}`;
                    const isExpanded = expandedRunnerKey === runnerKey;
                    const points = getPointsForRunner(r, selectedRace.placedPositions ?? []);
                    return (
                      <TouchableOpacity
                        key={`${r.label}-${r.name}-${idx}`}
                        style={[styles.runnerCard, r.earnedPoints && styles.runnerCardEarned]}
                        onPress={() => setExpandedRunnerKey((prev) => (prev === runnerKey ? null : runnerKey))}
                        activeOpacity={0.8}
                      >
                        <View style={styles.runnerCardRow}>
                          <View style={styles.runnerCardPosition}>
                            <Text
                              style={[
                                styles.runnerCardPositionBadge,
                                r.position === 1 && styles.runnerCardPositionWon,
                              ]}
                            >
                              {r.label}
                            </Text>
                          </View>
                          <View style={styles.runnerCardCenter}>
                            <Text style={styles.runnerCardName} numberOfLines={1}>
                              {displayHorseName(r.name)}
                            </Text>
                          </View>
                          <Text style={styles.runnerCardTotalPts}>
                            {(r.pos_points ?? points) + (r.sp_points ?? 0)} pts
                          </Text>
                          <Text style={styles.runnerCardChevron}>{isExpanded ? '▲' : '▼'}</Text>
                        </View>
                        {isExpanded && (
                          <View style={styles.runnerCardPointsBlock}>
                            <View style={styles.runnerCardThreeBoxRow}>
                              <View style={styles.runnerCardPointsBox}>
                                <Text style={styles.runnerCardPointsLabel}>Pos points</Text>
                                <Text style={styles.runnerCardPointsValue}>{r.pos_points != null ? r.pos_points : points}</Text>
                              </View>
                              <View style={styles.runnerCardPointsBox}>
                                <Text style={styles.runnerCardPointsLabel}>SP</Text>
                                <Text style={styles.runnerCardPointsValue}>{decimalToFractional(r.sp)}</Text>
                              </View>
                              <View style={styles.runnerCardPointsBox}>
                                <Text style={styles.runnerCardPointsLabel}>Bonus points</Text>
                                <Text style={styles.runnerCardPointsValue}>{r.sp_points != null ? r.sp_points : 0}</Text>
                              </View>
                            </View>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })()}
        </View>
      </ScrollView>

      <View style={styles.coach}>
        <Text style={styles.coachText}>Compare standings on the practice Leaderboard. Adjust picks from My selections (practice).</Text>
        <View style={styles.coachRow}>
          <TouchableOpacity style={[styles.coachBtn, styles.coachBtnPrimary]} onPress={() => router.push('/(app)/leaderboard?tutorial=1')}>
            <Text style={[styles.coachBtnText, styles.coachBtnTextPrimary]}>Leaderboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.coachBtn} onPress={() => router.push('/(app)/selections?tutorial=1')}>
            <Text style={styles.coachBtnText}>My selections</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
