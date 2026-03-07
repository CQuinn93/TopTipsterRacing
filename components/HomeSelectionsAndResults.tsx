/**
 * Web-only: selections per race (left 50%) + results per race (right 50%) with day filter.
 * Left: each race with your selection. Right: each race with result breakdown.
 */
import { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';
import { getLatestResultsForUser } from '@/lib/latestResultsCache';
import type { MeetingResults, RaceResultTemplate, ResultRow } from '@/lib/resultsTemplateForUser';
import { displayHorseName } from '@/lib/displayHorseName';
import { decimalToFractional } from '@/lib/oddsFormat';
import { formatDayDate } from '@/lib/appUtils';
import { POSITION_POINTS } from '@/lib/appUtils';

/** Web-only: use only when Platform.OS === 'web'. */
type RaceDayRow = { id: string; race_date: string; first_race_utc?: string };

function getPointsForRunner(
  r: { position: number | null; earnedPoints: boolean },
  placedPositions: number[]
): number {
  if (r.position == null || !placedPositions.includes(r.position)) return POSITION_POINTS.lost;
  if (r.position === 1) return POSITION_POINTS.won;
  return POSITION_POINTS.place;
}

export function HomeSelectionsAndResults({ competitionId }: { competitionId: string }) {
  const theme = useTheme();
  const { userId } = useAuth();
  const [raceDays, setRaceDays] = useState<RaceDayRow[]>([]);
  const [meetingResults, setMeetingResults] = useState<MeetingResults[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedRunnerKey, setExpandedRunnerKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectionsByDate, setSelectionsByDate] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    if (!competitionId || !userId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [days, results, selRes] = await Promise.all([
          fetchRaceDaysForCompetition(supabase, competitionId, 'id, race_date, first_race_utc') as Promise<RaceDayRow[]>,
          getLatestResultsForUser(supabase, userId, [competitionId]),
          supabase
            .from('daily_selections')
            .select('race_date, selections')
            .eq('competition_id', competitionId)
            .eq('user_id', userId),
        ]);
        if (cancelled) return;
        setRaceDays(days ?? []);
        setMeetingResults(results ?? []);

        const byDate: Record<string, Record<string, string>> = {};
        for (const row of selRes.data ?? []) {
          const r = row as { race_date: string; selections: Record<string, { runnerName?: string }> | null };
          const sel = r.selections ?? {};
          const out: Record<string, string> = {};
          for (const [raceId, v] of Object.entries(sel)) {
            if (v?.runnerName) out[raceId] = v.runnerName;
          }
          byDate[r.race_date] = out;
        }
        setSelectionsByDate(byDate);

        const today = new Date().toISOString().slice(0, 10);
        const sortedDates = (days ?? []).map((d) => d.race_date).sort((a, b) => a.localeCompare(b));
        setSelectedDate((prev) => {
          if (!prev) return sortedDates.includes(today) ? today : sortedDates[0] ?? null;
          return sortedDates.includes(prev) ? prev : sortedDates[0] ?? null;
        });
      } catch {
        if (!cancelled) setRaceDays([]);
        setMeetingResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [competitionId, userId]);

  const racesForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    const out: { course: string; race: RaceResultTemplate }[] = [];
    for (const m of meetingResults) {
      for (const race of m.races) {
        if (race.raceTimeUtc.slice(0, 10) === selectedDate) {
          out.push({ course: m.course, race });
        }
      }
    }
    out.sort((a, b) => a.race.raceTimeUtc.localeCompare(b.race.raceTimeUtc));
    return out;
  }, [meetingResults, selectedDate]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        section: {
          marginTop: 24,
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        },
        dayTabsRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 16,
        },
        dayTab: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 8,
        },
        dayTabActive: {
          backgroundColor: theme.colors.accentMuted,
        },
        dayTabText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.text,
        },
        dayTabTextActive: {
          color: theme.colors.accent,
          fontWeight: '600',
        },
        twoColRow: {
          flexDirection: 'row',
          flex: 1,
          gap: 16,
          minHeight: 0,
        },
        leftCol: {
          flex: 1,
          minWidth: 0,
          backgroundColor: theme.colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 12,
        },
        leftTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '700',
          color: theme.colors.textMuted,
          marginBottom: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        selectionCard: {
          backgroundColor: theme.colors.background,
          borderRadius: 8,
          padding: 12,
          marginBottom: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        selectionCardRaceName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: 4,
        },
        selectionCardTime: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: 8,
        },
        selectionCardPick: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.accent,
          fontWeight: '600',
        },
        dayTab: {
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 8,
          marginBottom: 4,
        },
        dayTabActive: {
          backgroundColor: theme.colors.accentMuted,
        },
        dayTabText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.text,
        },
        dayTabTextActive: {
          color: theme.colors.accent,
          fontWeight: '600',
        },
        rightCol: {
          flex: 1,
          minWidth: 0,
        },
        rightTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '700',
          color: theme.colors.textMuted,
          marginBottom: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        resultCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        resultCardRaceName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: 4,
        },
        resultCardTime: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: 12,
        },
        runnerCard: {
          backgroundColor: theme.colors.background,
          borderRadius: 8,
          paddingVertical: 10,
          paddingHorizontal: 12,
          marginBottom: 6,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        runnerCardEarned: {
          borderLeftWidth: 4,
          borderLeftColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        runnerCardRow: {
          flexDirection: 'row',
          alignItems: 'center',
        },
        runnerCardPosition: {
          width: 32,
          alignItems: 'center',
        },
        runnerCardPositionBadge: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '700',
          color: theme.colors.textSecondary,
        },
        runnerCardPositionWon: { color: theme.colors.accent },
        runnerCardCenter: { flex: 1, minWidth: 0, marginLeft: 8 },
        runnerCardName: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.text, fontWeight: '500' },
        runnerCardTotalPts: { fontFamily: theme.fontFamily.regular, fontSize: 13, fontWeight: '600', color: theme.colors.accent },
        runnerCardChevron: { fontFamily: theme.fontFamily.regular, fontSize: 10, color: theme.colors.textMuted, marginLeft: 8 },
        runnerCardPointsBlock: {
          marginTop: 10,
          paddingTop: 10,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
        },
        runnerCardThreeBoxRow: { flexDirection: 'row', gap: 12 },
        runnerCardPointsBox: {
          flex: 1,
          backgroundColor: theme.colors.surface,
          borderRadius: 8,
          paddingVertical: 8,
          paddingHorizontal: 8,
          alignItems: 'center',
        },
        runnerCardPointsLabel: { fontFamily: theme.fontFamily.regular, fontSize: 11, color: theme.colors.textMuted },
        runnerCardPointsValue: { fontFamily: theme.fontFamily.regular, fontSize: 12, fontWeight: '600', color: theme.colors.accent },
        awaitingRow: {
          paddingVertical: 16,
          paddingHorizontal: 16,
          backgroundColor: theme.colors.background,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        awaitingText: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
        emptyText: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.textMuted },
      }),
    [theme]
  );

  if (loading) {
    return (
      <View style={[styles.section, { paddingVertical: 32 }]}>
        <ActivityIndicator size="small" color={theme.colors.accent} />
      </View>
    );
  }

  if (raceDays.length === 0) {
    return (
      <View style={[styles.section, { paddingVertical: 16 }]}>
        <Text style={styles.emptyText}>No race days for this competition yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.dayTabsRow}>
        {raceDays.map((d) => {
          const isSelected = selectedDate === d.race_date;
          const pickCount = Object.keys(selectionsByDate[d.race_date] ?? {}).length;
          return (
            <TouchableOpacity
              key={d.id}
              style={[styles.dayTab, isSelected && styles.dayTabActive]}
              onPress={() => {
                setSelectedDate(d.race_date);
                setExpandedRunnerKey(null);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.dayTabText, isSelected && styles.dayTabTextActive]}>
                {formatDayDate(d.race_date)}
                {pickCount > 0 && ` · ${pickCount} pick${pickCount !== 1 ? 's' : ''}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.twoColRow}>
        <View style={styles.leftCol}>
          <Text style={styles.leftTitle}>Your selections</Text>
          <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={true}>
            {racesForSelectedDate.length === 0 ? (
              <Text style={styles.emptyText}>No races on this day.</Text>
            ) : (
              racesForSelectedDate.map(({ course, race }) => (
                <View key={`sel-${race.raceId}-${race.raceTimeUtc}`} style={styles.selectionCard}>
                  <Text style={styles.selectionCardRaceName}>{race.raceName}</Text>
                  <Text style={styles.selectionCardTime}>
                    {course} · {new Date(race.raceTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.selectionCardPick}>
                    Your pick: {displayHorseName(race.userSelection)}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>

        <View style={styles.rightCol}>
        <Text style={styles.rightTitle}>
          {selectedDate ? `Results · ${formatDayDate(selectedDate)}` : 'Results'}
        </Text>
        <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={true}>
          {racesForSelectedDate.length === 0 ? (
            <Text style={styles.emptyText}>No races on this day yet.</Text>
          ) : (
            racesForSelectedDate.map(({ course, race }) => {
              const fullResult = race.fullResult ?? [];
              const awaiting = fullResult.length === 0;
              return (
                <View key={`${race.raceId}-${race.raceTimeUtc}`} style={styles.resultCard}>
                  <Text style={styles.resultCardRaceName}>{race.raceName}</Text>
                  <Text style={styles.resultCardTime}>
                    {course} · {new Date(race.raceTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {awaiting ? (
                    <View style={styles.awaitingRow}>
                      <Text style={styles.awaitingText}>Awaiting results</Text>
                    </View>
                  ) : (
                    <View>
                      {fullResult.map((r: ResultRow, idx: number) => {
                        const runnerKey = `${race.raceId}-${idx}`;
                        const isExpanded = expandedRunnerKey === runnerKey;
                        const points = getPointsForRunner(r, race.placedPositions ?? []);
                        return (
                          <TouchableOpacity
                            key={`${r.label}-${r.name}-${idx}`}
                            style={[styles.runnerCard, r.earnedPoints && styles.runnerCardEarned]}
                            onPress={() =>
                              setExpandedRunnerKey((prev) => (prev === runnerKey ? null : runnerKey))
                            }
                            activeOpacity={0.8}
                          >
                            <View style={styles.runnerCardRow}>
                              <View style={styles.runnerCardPosition}>
                                <Text style={[styles.runnerCardPositionBadge, r.position === 1 && styles.runnerCardPositionWon]}>
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
                                    <Text style={styles.runnerCardPointsValue}>
                                      {r.pos_points != null ? r.pos_points : points}
                                    </Text>
                                  </View>
                                  <View style={styles.runnerCardPointsBox}>
                                    <Text style={styles.runnerCardPointsLabel}>SP</Text>
                                    <Text style={styles.runnerCardPointsValue}>{decimalToFractional(r.sp)}</Text>
                                  </View>
                                  <View style={styles.runnerCardPointsBox}>
                                    <Text style={styles.runnerCardPointsLabel}>Bonus points</Text>
                                    <Text style={styles.runnerCardPointsValue}>
                                      {r.sp_points != null ? r.sp_points : 0}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
        </View>
      </View>
    </View>
  );
}
