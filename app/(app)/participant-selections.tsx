import { useEffect, useState, useMemo } from 'react';
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
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { isSelectionClosed } from '@/lib/appUtils';
import { useTheme } from '@/contexts/ThemeContext';
import { displayHorseName } from '@/lib/displayHorseName';
import { decimalToFractional } from '@/lib/oddsFormat';
import { getLeaderboardBulkCache } from '@/lib/leaderboardBulkCache';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';
import { getCached, setCached } from '@/lib/selectionsCache';
import type { Race } from '@/types/races';
import { POINTS_PER_ODDS, POSITION_POINTS, placeLabel } from '@/lib/appUtils';
import type { RaceResult } from '@/types/races';

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
  const activeTheme = useTheme();
  const { userId: currentUserId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ competitionId: string; participantUserId: string; displayName: string }>();
  const competitionId = params.competitionId ?? '';
  const participantUserId = params.participantUserId ?? '';
  const displayName = params.displayName ?? 'Selections';

  const [raceDays, setRaceDays] = useState<RaceDayRow[]>([]);
  const [selectionsByDate, setSelectionsByDate] = useState<Record<string, Record<string, SelectionEntry>>>({});
  const [loading, setLoading] = useState(true);
  const [canViewOthers, setCanViewOthers] = useState<boolean | null>(null);
  /** Per race_date: true if viewer can see that day's picks (deadline passed or viewer locked that day). */
  const [viewableRaceDates, setViewableRaceDates] = useState<Record<string, boolean>>({});
  const [breakdownModal, setBreakdownModal] = useState<{
    runnerName: string;
    oddsDecimal: number;
    positionPoints: number | null;
    /** Odds (bonus) points only – never position + bonus. */
    oddsPoints: number | null;
  } | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: activeTheme.colors.background },
        centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: activeTheme.colors.background },
        header: { padding: activeTheme.spacing.lg, borderBottomWidth: 1, borderBottomColor: activeTheme.colors.border },
        backText: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 14,
          color: activeTheme.colors.accent,
          marginBottom: activeTheme.spacing.xs,
        },
        title: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 20,
          color: activeTheme.colors.text,
        },
        subtitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 14,
          color: activeTheme.colors.textMuted,
          marginTop: activeTheme.spacing.xs,
        },
        scroll: { flex: 1 },
        content: { padding: activeTheme.spacing.lg, paddingBottom: activeTheme.spacing.xxl },
        dayCard: {
          backgroundColor: activeTheme.colors.surface,
          borderRadius: activeTheme.radius.md,
          padding: activeTheme.spacing.md,
          marginBottom: activeTheme.spacing.lg,
          borderWidth: 1,
          borderColor: activeTheme.colors.border,
        },
        dayCardTitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 18,
          fontWeight: '600',
          color: activeTheme.colors.accent,
          marginBottom: activeTheme.spacing.sm,
        },
        selectionRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: activeTheme.spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: activeTheme.colors.border,
          position: 'relative',
        },
        selectionRowInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 },
        selectionLeft: { flex: 1, paddingRight: activeTheme.spacing.md },
        selectionRight: { flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing.sm },
        raceTimeSmall: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '600',
          color: '#fff',
          marginBottom: activeTheme.spacing.sm,
        },
        columnHeader: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 9,
          color: activeTheme.colors.textMuted,
        },
        pickRow: { flexDirection: 'row', alignItems: 'center', gap: activeTheme.spacing.xs, marginTop: activeTheme.spacing.xs, paddingTop: activeTheme.spacing.xs },
        pickNumber: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 12,
          color: activeTheme.colors.textSecondary,
          minWidth: 18,
        },
        pickName: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 14,
          color: activeTheme.colors.text,
          fontWeight: '600',
          paddingLeft: activeTheme.spacing.sm,
          paddingRight: activeTheme.spacing.md,
        },
        placeBadge: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 12,
          paddingHorizontal: activeTheme.spacing.sm,
          paddingVertical: 2,
          borderRadius: activeTheme.radius.sm,
          minWidth: 50,
          textAlign: 'center',
        },
        place_won: { color: '#166534', backgroundColor: 'rgba(34, 197, 94, 0.2)' },
        place_place: { color: '#a16207', backgroundColor: 'rgba(234, 179, 8, 0.2)' },
        place_lost: { color: '#991b1b', backgroundColor: 'rgba(239, 68, 68, 0.15)' },
        oddsText: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 11,
          color: activeTheme.colors.textMuted,
        },
        pointsText: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 13,
          color: activeTheme.colors.text,
          minWidth: 48,
          textAlign: 'right',
        },
        points_won: { color: '#166534' },
        points_place: { color: '#a16207' },
        points_lost: { color: '#991b1b' },
        dayTotalRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: activeTheme.spacing.sm,
          paddingTop: activeTheme.spacing.sm,
          borderTopWidth: 1,
          borderTopColor: activeTheme.colors.border,
        },
        dayTotalLabel: { fontFamily: activeTheme.fontFamily.regular, fontSize: 14, color: activeTheme.colors.textSecondary },
        dayTotalValue: { fontFamily: activeTheme.fontFamily.regular, fontSize: 16, fontWeight: '600', color: activeTheme.colors.accent },
        muted: { fontFamily: activeTheme.fontFamily.regular, fontSize: 14, color: activeTheme.colors.textMuted },
        modalBackdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: activeTheme.spacing.lg,
        },
        modalBox: {
          backgroundColor: activeTheme.colors.surface,
          borderRadius: activeTheme.radius.md,
          padding: activeTheme.spacing.lg,
          width: '100%',
          maxWidth: 320,
          borderWidth: 1,
          borderColor: activeTheme.colors.border,
        },
        modalTitle: {
          fontFamily: activeTheme.fontFamily.regular,
          fontSize: 18,
          fontWeight: '600',
          color: activeTheme.colors.text,
          marginBottom: activeTheme.spacing.md,
        },
        breakdownRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: activeTheme.spacing.sm,
        },
        breakdownLabel: { fontFamily: activeTheme.fontFamily.regular, fontSize: 14, color: activeTheme.colors.textMuted },
        breakdownValue: { fontFamily: activeTheme.fontFamily.regular, fontSize: 14, color: activeTheme.colors.text },
        modalClose: {
          marginTop: activeTheme.spacing.lg,
          paddingVertical: activeTheme.spacing.sm,
          alignItems: 'center',
        },
        modalCloseText: { fontFamily: activeTheme.fontFamily.regular, fontSize: 16, color: activeTheme.colors.accent },
      }),
    [activeTheme]
  );

  useEffect(() => {
    if (!competitionId) {
      setLoading(false);
      setCanViewOthers(false);
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
        if (currentUserId) {
          const { data: rdRows } = await supabase
            .from('competition_race_days')
            .select('race_day_id')
            .eq('competition_id', competitionId);
          const dayIds = (rdRows ?? []).map((r: { race_day_id: string }) => r.race_day_id);
          const { data: dayRows } = await supabase
            .from('race_days')
            .select('race_date, first_race_utc')
            .in('id', dayIds);
          const { data: myRows } = await supabase
            .from('daily_selections')
            .select('race_date, locked_at')
            .eq('competition_id', competitionId)
            .eq('user_id', currentUserId);
          const dateToFirstUtc = new Map((dayRows ?? []).map((d: { race_date: string; first_race_utc?: string | null }) => [d.race_date, d.first_race_utc]));
          const myLockedByDate = new Map((myRows ?? []).map((r: { race_date: string; locked_at: string | null }) => [r.race_date, r.locked_at]));
          const viewable: Record<string, boolean> = {};
          for (const d of days) {
            const firstUtc = dateToFirstUtc.get(d.race_date);
            const closed = !firstUtc || isSelectionClosed(firstUtc);
            const locked = myLockedByDate.get(d.race_date) != null;
            viewable[d.race_date] = closed || locked;
          }
          setViewableRaceDates(viewable);
          const hasAnyDeadlineData = (dayRows ?? []).length > 0;
          const canView = !hasAnyDeadlineData || days.some((d) => viewable[d.race_date]);
          setCanViewOthers(canView);
        } else {
          setCanViewOthers(false);
          setViewableRaceDates({});
        }
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
      if (currentUserId && days.length > 0) {
        const { data: rdRows } = await supabase
          .from('competition_race_days')
          .select('race_day_id')
          .eq('competition_id', competitionId);
        const dayIds = (rdRows ?? []).map((r: { race_day_id: string }) => r.race_day_id);
        const { data: dayRows } = await supabase
          .from('race_days')
          .select('race_date, first_race_utc')
          .in('id', dayIds);
        const { data: myRows } = await supabase
          .from('daily_selections')
          .select('race_date, locked_at')
          .eq('competition_id', competitionId)
          .eq('user_id', currentUserId);
        const dateToFirstUtc = new Map((dayRows ?? []).map((d: { race_date: string; first_race_utc?: string | null }) => [d.race_date, d.first_race_utc]));
        const myLockedByDate = new Map((myRows ?? []).map((r: { race_date: string; locked_at: string | null }) => [r.race_date, r.locked_at]));
        const viewable: Record<string, boolean> = {};
        for (const d of days as { race_date: string }[]) {
          const firstUtc = dateToFirstUtc.get(d.race_date);
          const closed = !firstUtc || isSelectionClosed(firstUtc);
          const locked = myLockedByDate.get(d.race_date) != null;
          viewable[d.race_date] = closed || locked;
        }
        setViewableRaceDates(viewable);
        const hasAnyDeadlineData = (dayRows ?? []).length > 0;
        const canView = !hasAnyDeadlineData || (days as { race_date: string }[]).some((d) => viewable[d.race_date]);
        setCanViewOthers(canView);
      } else {
        setCanViewOthers(false);
        setViewableRaceDates({});
      }
      setLoading(false);
    })();
  }, [competitionId, participantUserId, currentUserId]);

  /** Resolve result for pick (handles FAV: prefer FAV row result when present). */
  const getResultForPick = (race: Race, runnerId: string): RaceResult | null => {
    const results = race.results ?? {};
    if (runnerId === 'FAV') {
      if (results['FAV']) return results['FAV'] as RaceResult;
      const favId = Object.entries(results).reduce<string | null>((best, [id, r]) => {
        const sp = (r as RaceResult)?.sp ?? Infinity;
        return !best || sp < ((results[best] as RaceResult)?.sp ?? Infinity) ? id : best;
      }, null);
      return favId ? (results[favId] as RaceResult) : null;
    }
    return (results[runnerId] as RaceResult) ?? null;
  };

  /** Use DB points (pos_points + sp_points) when available, else position points from appUtils. */
  const pointsFromResult = (result: RaceResult | null): number => {
    if (result != null && (result.pos_points != null || result.sp_points != null)) {
      return (result.pos_points ?? 0) + (result.sp_points ?? 0);
    }
    if (result?.positionLabel != null) return POSITION_POINTS[result.positionLabel];
    return 0;
  };

  if (loading && raceDays.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={activeTheme.colors.accent} />
      </View>
    );
  }

  if (canViewOthers === false) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{displayName}</Text>
          <Text style={styles.subtitle}>Selections</Text>
        </View>
        <View style={styles.content}>
          <Text style={[styles.muted, { marginTop: activeTheme.spacing.lg, textAlign: 'center', paddingHorizontal: activeTheme.spacing.lg }]}>
            You can only view other users' selections after you lock in your picks for this competition, or once the entry deadline has passed (1 hour before the first race).
          </Text>
        </View>
      </View>
    );
  }

  const daysToShow = raceDays;

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
            const result = getResultForPick(race as Race, pick.runnerId);
            return sum + pointsFromResult(result);
          }, 0);
          const canViewThisDay = isPlaceholder || !day.race_date || viewableRaceDates[day.race_date] !== false;
          return (
            <View key={day.id} style={styles.dayCard}>
              <Text style={styles.dayCardTitle}>Day {dayIndex + 1}</Text>
              {isPlaceholder ? (
                <Text style={styles.muted}>No races</Text>
              ) : !canViewThisDay ? (
                <Text style={[styles.muted, { marginTop: 8, textAlign: 'center' }]}>
                  Selections for this day are hidden until you lock in your picks or the entry deadline has passed (1 hour before the first race).
                </Text>
              ) : races.length === 0 ? (
                <Text style={styles.muted}>No races for this day.</Text>
              ) : (
                <>
                  {races.map((race) => {
                    const pick = selections[race.id];
                    const result = pick ? getResultForPick(race as Race, pick.runnerId) : null;
                    const position = result?.positionLabel ?? pick?.position;
                    const oddsDecimal = result?.sp != null && Number.isFinite(result.sp) && result.sp > 0
                      ? result.sp
                      : (pick?.oddsDecimal ?? null);
                    const runner = pick ? (race.runners ?? []).find((r) => r.id === pick.runnerId) : null;
                    const horseNumber = runner?.number != null ? String(runner.number) : pick?.runnerId === 'FAV' ? 'F' : null;
                    const pts = pick ? pointsFromResult(result) : 0;
                    const dbPos = result != null && (result.pos_points != null || result.sp_points != null)
                      ? (result.pos_points ?? 0)
                      : (result ? POSITION_POINTS[result.positionLabel] : null);
                    /** Odds points = bonus only (sp_points). Never include position points here. */
                    const dbSpOnly = result != null && typeof result.sp_points === 'number' ? result.sp_points : null;
                    return (
                      <TouchableOpacity
                        key={race.id}
                        style={styles.selectionRow}
                        onPress={() =>
                          pick
                            ? setBreakdownModal({
                                runnerName: pick.runnerName,
                                oddsDecimal: pick.oddsDecimal,
                                positionPoints: dbPos,
                                oddsPoints: dbSpOnly,
                              })
                            : undefined
                        }
                        disabled={!pick}
                        activeOpacity={0.7}
                      >
                        <View style={styles.selectionRowInner}>
                          <View style={styles.selectionLeft}>
                            <Text style={styles.raceTimeSmall}>
                              {race.scheduledTimeUtc
                                ? new Date(race.scheduledTimeUtc).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                                : ''}
                            </Text>
                            <View style={[styles.pickRow, { marginTop: 0, paddingTop: 0 }]}>
                              <Text style={[styles.pickNumber, styles.columnHeader]}>no.</Text>
                              <Text style={[styles.pickName, styles.columnHeader]}>Name</Text>
                            </View>
                            <View style={styles.pickRow}>
                              <Text style={styles.pickNumber}>{horseNumber ?? '—'}</Text>
                              <Text style={styles.pickName}>{pick ? displayHorseName(pick.runnerName) : 'No selection'}</Text>
                              {pick && oddsDecimal != null ? (
                                <Text style={styles.oddsText}>{decimalToFractional(oddsDecimal)}</Text>
                              ) : null}
                            </View>
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
                            <Text
                              style={[
                                styles.pointsText,
                                position === 'won' && styles.points_won,
                                position === 'place' && styles.points_place,
                                position === 'lost' && styles.points_lost,
                              ]}
                            >
                              {pick ? `${pts} pts` : '—'}
                            </Text>
                          </View>
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
                <Text style={styles.modalTitle}>{displayHorseName(breakdownModal.runnerName)}</Text>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Odds</Text>
                  <Text style={styles.breakdownValue}>{decimalToFractional(breakdownModal.oddsDecimal)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Position points</Text>
                  <Text style={styles.breakdownValue}>
                    {breakdownModal.positionPoints != null ? breakdownModal.positionPoints : '—'}
                  </Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Odds points (bonus)</Text>
                  <Text style={styles.breakdownValue}>
                    {breakdownModal.oddsPoints != null ? breakdownModal.oddsPoints : '—'}
                  </Text>
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
