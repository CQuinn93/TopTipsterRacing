import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { SurvivalDonut } from '@/components/lms/SurvivalDonut';
import { StandingPlayerPoolCard } from '@/components/lms/StandingBetweenViews';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import { kioskGetDisplayBoard, type KioskDisplayBoard } from '@/lib/kioskApi';
import type { LmsCompletedPick, LmsParticipant } from '@/lib/lms/api';
import { lmsDisplayTeamName } from '@/lib/lms/teamColours';

type Props = {
  competitionId: string;
  onGetStarted: () => void;
};

const REFRESH_MS = 60_000;

export function KioskLmsDashboard({ competitionId, onGetStarted }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [board, setBoard] = useState<KioskDisplayBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await kioskGetDisplayBoard(competitionId);
      setBoard(next);
      setError(null);
      setSelectedUserId((prev) => {
        if (!prev) return prev;
        return next.participants.some((p) => p.user_id === prev) ? prev : null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load standings');
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const picksByUserId = useMemo(() => {
    const map = new Map<string, LmsCompletedPick[]>();
    for (const pick of board?.picks ?? []) {
      const list = map.get(pick.user_id) ?? [];
      list.push(pick);
      map.set(pick.user_id, list);
    }
    for (const [uid, list] of map) {
      list.sort((a, b) => a.gameweek_number - b.gameweek_number);
      map.set(uid, list);
    }
    return map;
  }, [board?.picks]);

  const { survivors, eliminated } = useMemo(() => {
    const list = board?.participants ?? [];
    const survivors = list
      .filter((p) => p.status === 'active' || p.status === 'winner')
      .sort((a, b) => {
        if (a.status === 'winner' && b.status !== 'winner') return -1;
        if (b.status === 'winner' && a.status !== 'winner') return 1;
        return (a.username || a.user_id).localeCompare(b.username || b.user_id);
      });
    const eliminated = list
      .filter((p) => p.status === 'eliminated')
      .sort((a, b) => (a.username || a.user_id).localeCompare(b.username || b.user_id));
    return { survivors, eliminated };
  }, [board?.participants]);

  const selectedPlayer = useMemo(
    () => board?.participants.find((p) => p.user_id === selectedUserId) ?? null,
    [board?.participants, selectedUserId]
  );

  const selectedPicks = useMemo(
    () => (selectedUserId ? picksByUserId.get(selectedUserId) ?? [] : []),
    [picksByUserId, selectedUserId]
  );

  const elimRows = board?.elimination?.gameweeks ?? [];

  const renderStandingRow = (p: LmsParticipant) => {
    const name = p.username?.trim() || p.user_id.slice(0, 8);
    const selected = selectedUserId === p.user_id;
    const picks = picksByUserId.get(p.user_id) ?? [];
    const alive = p.status === 'active' || p.status === 'winner';
    const lastPick = picks[picks.length - 1];
    return (
      <Pressable
        key={p.id}
        style={[
          styles.standingRow,
          selected && styles.standingRowSelected,
          !alive && styles.standingRowOut,
        ]}
        onPress={() => setSelectedUserId(p.user_id)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${name}, ${alive ? 'still in' : 'eliminated'}`}
      >
        <View style={styles.standingMain}>
          <Text style={[styles.standingName, !alive && styles.standingNameOut]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.standingMeta}>
            {p.status === 'winner' ? 'Winner' : alive ? 'Alive' : 'Out'}
            {picks.length ? ` · ${picks.length} used` : ''}
          </Text>
        </View>
            {lastPick?.team ? (
          <View style={styles.lastPick}>
            <TeamColourChip
              shortName={lastPick.team.short_name}
              name={lastPick.team.name}
              slug={lastPick.team.slug}
              size={34}
            />
            <Text style={styles.lastPickGw}>GW{lastPick.gameweek_number}</Text>
          </View>
        ) : (
          <Text style={styles.noPick}>—</Text>
        )}
      </Pressable>
    );
  };

  if (loading && !board) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.loadingText}>Loading standings…</Text>
      </View>
    );
  }

  if (error && !board) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
        <Pressable style={styles.primaryBtn} onPress={onGetStarted}>
          <Text style={styles.primaryBtnText}>Get started</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.split}>
        <View style={styles.leftCol}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>Standing</Text>
            <Text style={styles.panelMeta}>
              {board?.alive_count ?? 0} / {board?.total_count ?? 0} still in
            </Text>
          </View>
          <ScrollView
            style={styles.leftScroll}
            contentContainerStyle={styles.leftScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {survivors.length ? (
              <>
                <Text style={styles.sectionLabel}>Still standing</Text>
                {survivors.map(renderStandingRow)}
              </>
            ) : null}
            {eliminated.length ? (
              <>
                <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Out</Text>
                {eliminated.map(renderStandingRow)}
              </>
            ) : null}
            {!survivors.length && !eliminated.length ? (
              <Text style={styles.emptyHint}>No players in this competition yet.</Text>
            ) : null}
          </ScrollView>
        </View>

        <View style={styles.rightCol}>
          <View style={styles.rightTop}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>Survival rate</Text>
              <Text style={styles.panelMeta}>
                {board?.alive_count ?? 0} still standing
              </Text>
            </View>
            {elimRows.length === 0 ? (
              <Text style={styles.emptyHint}>
                Survival rings appear after the first completed gameweek.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.donutRow}
              >
                {elimRows.map((row) => {
                  const survivalPct =
                    row.survival_pct ??
                    (row.entrants_count > 0
                      ? Math.round(
                          ((row.entrants_count - row.eliminated_count) /
                            row.entrants_count) *
                            100
                        )
                      : 100);
                  return (
                    <View key={row.gameweek_id} style={styles.donutCell}>
                      <Text style={styles.donutGw}>GW{row.gameweek_number}</Text>
                      <SurvivalDonut survivalPct={survivalPct} size={78} strokeWidth={8} />
                      <Text style={styles.donutOut}>{row.eliminated_count} out</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <View style={styles.rightBottom}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>
                {selectedPlayer
                  ? `${selectedPlayer.username?.trim() || 'Player'}’s pool`
                  : 'Player pool'}
              </Text>
              {selectedPicks.length ? (
                <Text style={styles.panelMeta}>
                  {selectedPicks
                    .map(
                      (p) =>
                        `GW${p.gameweek_number} ${lmsDisplayTeamName(p.team?.name) || p.team?.short_name || ''}`
                    )
                    .slice(-2)
                    .join(' · ')}
                </Text>
              ) : null}
            </View>
            {selectedPlayer && board ? (
              <ScrollView
                style={styles.poolScroll}
                contentContainerStyle={styles.poolScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <StandingPlayerPoolCard
                  player={selectedPlayer}
                  poolTeams={board.pool_teams}
                  picks={selectedPicks}
                  large
                />
              </ScrollView>
            ) : (
              <Text style={styles.emptyHint}>
                Tap a player on the standings to see the teams they’ve used in the pool.
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.ctaBar}>
        <View style={styles.ctaCopy}>
          <Text style={styles.ctaTitle}>Join or make your pick</Text>
          <Text style={styles.ctaBody}>
            New players request a place. Already in? Sign in to lock this week’s selection.
          </Text>
        </View>
        <Pressable style={styles.primaryBtn} onPress={onGetStarted}>
          <Text style={styles.primaryBtnText}>Get started</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      minHeight: 0,
      gap: 10,
    },
    loadingWrap: {
      flex: 1,
      minHeight: 320,
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.md,
      padding: theme.spacing.lg,
    },
    loadingText: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 18,
      color: theme.colors.textMuted,
    },
    errorText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 16,
      color: theme.colors.error,
      textAlign: 'center',
    },
    retryBtn: {
      paddingVertical: 12,
      paddingHorizontal: 18,
    },
    retryBtnText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 17,
      color: theme.colors.accent,
    },
    split: {
      flex: 1,
      flexDirection: 'row',
      gap: 10,
      minHeight: 0,
    },
    leftCol: {
      flex: 1.2,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: 12,
      minWidth: 0,
    },
    rightCol: {
      flex: 1,
      gap: 10,
      minWidth: 0,
    },
    rightTop: {
      flex: 0.85,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: 12,
      minHeight: 160,
    },
    rightBottom: {
      flex: 1.25,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: 12,
      minHeight: 180,
    },
    panelHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 10,
    },
    panelTitle: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 20,
      color: theme.colors.text,
    },
    panelMeta: {
      flexShrink: 1,
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 15,
      color: theme.colors.textMuted,
      textAlign: 'right',
    },
    leftScroll: {
      flex: 1,
    },
    leftScrollContent: {
      paddingBottom: 8,
      gap: 6,
    },
    sectionLabel: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
      marginBottom: 6,
      marginTop: 2,
    },
    sectionLabelSpaced: {
      marginTop: 14,
    },
    standingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    standingRowSelected: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentMuted,
      borderWidth: 2,
    },
    standingRowOut: {
      opacity: 0.8,
    },
    standingMain: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    standingName: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 19,
      color: theme.colors.text,
    },
    standingNameOut: {
      color: theme.colors.textMuted,
    },
    standingMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    lastPick: {
      alignItems: 'center',
      gap: 3,
    },
    lastPickGw: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 11,
      color: theme.colors.accent,
    },
    noPick: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 18,
      color: theme.colors.textMuted,
      width: 34,
      textAlign: 'center',
    },
    donutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      paddingVertical: 6,
      paddingRight: 8,
    },
    donutCell: {
      alignItems: 'center',
      gap: 5,
      width: 88,
    },
    donutGw: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    donutOut: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 13,
      color: theme.colors.textMuted,
    },
    poolScroll: {
      flex: 1,
    },
    poolScrollContent: {
      paddingBottom: 4,
    },
    emptyHint: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 16,
      lineHeight: 23,
      color: theme.colors.textMuted,
      paddingVertical: 10,
    },
    ctaBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    ctaCopy: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    ctaTitle: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 20,
      color: theme.colors.text,
    },
    ctaBody: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 15,
      lineHeight: 21,
      color: theme.colors.textSecondary,
    },
    primaryBtn: {
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.md,
      paddingVertical: 16,
      paddingHorizontal: 28,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 54,
    },
    primaryBtnText: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 18,
      color: theme.colors.white,
    },
  });
}
