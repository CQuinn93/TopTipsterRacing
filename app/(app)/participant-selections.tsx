import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { getLeaderboardBulkCache } from '@/lib/leaderboardBulkCache';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';
import { getCached, setCached } from '@/lib/selectionsCache';
import type { Race } from '@/types/races';

const POINTS_PER_ODDS = 10;
/** Position points when results are available from API (won/place/lost). */
const POSITION_POINTS = { won: 10, place: 5, lost: 0 } as const;

type RaceDayRow = {
  id: string;
  race_date: string;
  races: Race[];
};

type SelectionEntry = {
  runnerId: string;
  runnerName: string;
  oddsDecimal: number;
  position?: 'won' | 'place' | 'lost';
  positionPoints?: number;
  oddsPoints?: number;
};

export default function ParticipantSelectionsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ competitionId: string; participantUserId: string; displayName: string }>();
  const competitionId = params.competitionId ?? '';
  const participantUserId = params.participantUserId ?? '';
  const displayName = params.displayName ?? 'Selections';

  const [raceDays, setRaceDays] = useState<RaceDayRow[]>([]);
  const [selectionsByDate, setSelectionsByDate] = useState<Record<string, Record<string, SelectionEntry>>>({});
  const [loading, setLoading] = useState(true);
  const [breakdownModal, setBreakdownModal] = useState<{
    runnerName: string;
    oddsDecimal: number;
    positionPoints: number | null;
    oddsPoints: number;
  } | null>(null);

  useEffect(() => {
    if (!competitionId) {
      setLoading(false);
      return;
    }
    (async () => {
      const bulk = await getLeaderboardBulkCache(competitionId);
      if (bulk?.raceDays?.length && bulk.selectionsByUser) {
        const days = bulk.raceDays.map((d) => ({
          id: d.id,
          race_date: d.race_date,
          races: (d.races ?? []) as Race[],
        }));
        setRaceDays(days);
        const byUser = bulk.selectionsByUser[participantUserId];
        if (byUser) {
          const normalized: Record<string, Record<string, SelectionEntry>> = {};
          for (const [date, sel] of Object.entries(byUser)) {
            normalized[date] = {};
            for (const [raceId, v] of Object.entries(sel)) {
              if (v && typeof v.oddsDecimal === 'number') {
                const oddsPts = Math.round(v.oddsDecimal * POINTS_PER_ODDS);
                normalized[date][raceId] = {
                  runnerId: v.runnerId ?? '',
                  runnerName: v.runnerName ?? '',
                  oddsDecimal: v.oddsDecimal,
                  position: v.position,
                  positionPoints: v.positionPoints,
                  oddsPoints: v.oddsPoints ?? oddsPts,
                };
              }
            }
          }
          setSelectionsByDate(normalized);
        }
        setLoading(false);
        return;
      }
      const days = await fetchRaceDaysForCompetition(supabase, competitionId, 'id, race_date, races');
      setRaceDays(days as RaceDayRow[]);
      if (days.length && participantUserId) {
        const next: Record<string, Record<string, SelectionEntry>> = {};
        const datesToFetch: string[] = [];
        for (const d of days) {
          const cached = await getCached(competitionId, participantUserId, d.race_date);
          if (cached) {
            next[d.race_date] = {};
            for (const [raceId, v] of Object.entries(cached.selections)) {
              if (v?.oddsDecimal != null) {
                next[d.race_date][raceId] = {
                  runnerId: v.runnerId,
                  runnerName: v.runnerName,
                  oddsDecimal: v.oddsDecimal,
                  oddsPoints: Math.round(v.oddsDecimal * POINTS_PER_ODDS),
                };
              }
            }
          } else {
            datesToFetch.push(d.race_date);
          }
        }
        if (datesToFetch.length > 0) {
          const { data: rows } = await supabase
            .from('daily_selections')
            .select('race_date, selections')
            .eq('competition_id', competitionId)
            .eq('user_id', participantUserId)
            .in('race_date', datesToFetch);
          for (const row of rows ?? []) {
            const r = row as { race_date: string; selections: Record<string, { runnerId: string; runnerName: string; oddsDecimal: number }> };
            const sel = r.selections ?? {};
            next[r.race_date] = {};
            for (const [raceId, v] of Object.entries(sel)) {
              if (v?.oddsDecimal != null) {
                next[r.race_date][raceId] = {
                  runnerId: v.runnerId,
                  runnerName: v.runnerName,
                  oddsDecimal: v.oddsDecimal,
                  oddsPoints: Math.round(v.oddsDecimal * POINTS_PER_ODDS),
                };
              }
            }
            await setCached(competitionId, participantUserId, r.race_date, sel);
          }
        }
        setSelectionsByDate(next);
      }
      setLoading(false);
    })();
  }, [competitionId, participantUserId]);

  const placeLabel = (p?: 'won' | 'place' | 'lost') => (p === 'won' ? 'Won' : p === 'place' ? 'Place' : p === 'lost' ? 'Lost' : '—');

  if (loading && raceDays.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  const daysToShow = raceDays.length >= 4 ? raceDays : [...raceDays, ...Array.from({ length: 4 - Math.max(0, raceDays.length) }, (_, i) => ({ id: `placeholder-${i}`, race_date: '', races: [] as Race[] }))].slice(0, 4);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{displayName}</Text>
        <Text style={styles.subtitle}>Selections</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {daysToShow.map((day, dayIndex) => {
          const isPlaceholder = !day.race_date;
          const races = (day.races ?? []) as Race[];
          const selections = day.race_date ? (selectionsByDate[day.race_date] ?? {}) : {};
          const dayPoints = races.reduce((sum, race) => {
            const pick = selections[race.id];
            if (!pick) return sum;
            const result = (race as Race).results?.[pick.runnerId];
            const posPts = result ? POSITION_POINTS[result.positionLabel] : (pick.positionPoints ?? 0);
            return sum + (pick.oddsPoints ?? 0) + posPts;
          }, 0);
          return (
            <View key={day.id} style={styles.dayCard}>
              <Text style={styles.dayCardTitle}>Day {dayIndex + 1}</Text>
              {isPlaceholder ? (
                <Text style={styles.muted}>No races</Text>
              ) : races.length === 0 ? (
                <Text style={styles.muted}>No races for this day.</Text>
              ) : (
                <>
                  {races.map((race) => {
                    const pick = selections[race.id];
                    const result = pick ? (race as Race).results?.[pick.runnerId] : null;
                    const position = result?.positionLabel ?? pick?.position;
                    const positionPoints = result ? POSITION_POINTS[result.positionLabel] : (pick?.positionPoints ?? 0);
                    const pts = pick ? (pick.oddsPoints ?? 0) + positionPoints : 0;
                    return (
                      <TouchableOpacity
                        key={race.id}
                        style={styles.selectionRow}
                        onPress={() =>
                          pick
                            ? setBreakdownModal({
                                runnerName: pick.runnerName,
                                oddsDecimal: pick.oddsDecimal,
                                positionPoints: result ? POSITION_POINTS[result.positionLabel] : (pick.positionPoints ?? null),
                                oddsPoints: pick.oddsPoints ?? Math.round(pick.oddsDecimal * POINTS_PER_ODDS),
                              })
                            : undefined
                        }
                        disabled={!pick}
                      >
                        <View style={styles.selectionLeft}>
                          <Text style={styles.raceNameSmall}>{race.name}</Text>
                          <Text style={styles.pickName}>{pick?.runnerName ?? 'No selection'}</Text>
                        </View>
                        <View style={styles.selectionRight}>
                          <Text
                            style={[
                              styles.placeBadge,
                              position === 'won' && styles.place_won,
                              position === 'place' && styles.place_place,
                              position === 'lost' && styles.place_lost,
                            ]}
                          >
                            {placeLabel(position)}
                          </Text>
                          <Text style={styles.pointsText}>{pick ? `${pts} pts` : '—'}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  <View style={styles.dayTotalRow}>
                    <Text style={styles.dayTotalLabel}>Day total</Text>
                    <Text style={styles.dayTotalValue}>{dayPoints} pts</Text>
                  </View>
                </>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!breakdownModal} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setBreakdownModal(null)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            {breakdownModal && (
              <>
                <Text style={styles.modalTitle}>{breakdownModal.runnerName}</Text>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Odds</Text>
                  <Text style={styles.breakdownValue}>{breakdownModal.oddsDecimal.toFixed(2)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Position points</Text>
                  <Text style={styles.breakdownValue}>
                    {breakdownModal.positionPoints != null ? breakdownModal.positionPoints : '—'}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Odds points</Text>
                  <Text style={styles.breakdownValue}>{breakdownModal.oddsPoints}</Text>
                </View>
                <TouchableOpacity style={styles.modalClose} onPress={() => setBreakdownModal(null)}>
                  <Text style={styles.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
    marginBottom: theme.spacing.xs,
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
  dayCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dayCardTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.accent,
    marginBottom: theme.spacing.sm,
  },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  selectionLeft: { flex: 1 },
  selectionRight: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  raceNameSmall: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  pickName: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 15,
    color: theme.colors.text,
    fontWeight: '600',
  },
  placeBadge: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
  },
  place_won: { color: theme.colors.accent, backgroundColor: theme.colors.accentMuted },
  place_place: { color: theme.colors.textSecondary },
  place_lost: { color: theme.colors.textMuted },
  pointsText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.accent,
    minWidth: 48,
    textAlign: 'right',
  },
  dayTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  dayTotalLabel: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary },
  dayTotalValue: { fontFamily: theme.fontFamily.regular, fontSize: 16, fontWeight: '600', color: theme.colors.accent },
  muted: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textMuted },
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
    maxWidth: 320,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  breakdownLabel: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textMuted },
  breakdownValue: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.text },
  modalClose: {
    marginTop: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  modalCloseText: { fontFamily: theme.fontFamily.regular, fontSize: 16, color: theme.colors.accent },
});
