import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { SurvivalDonut } from '@/components/lms/SurvivalDonut';
import { StandingPlayerPoolCard } from '@/components/lms/StandingBetweenViews';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import {
  kioskGetDisplayBoard,
  type KioskDisplayBoard,
  type KioskDisplayParticipant,
  type KioskF2tPick,
  type KioskRacingPick,
} from '@/lib/kioskApi';
import type { LmsCompletedPick, LmsParticipant } from '@/lib/lms/api';
import { kioskAppLinkUrl, type KioskSport } from '@/lib/kioskSession';

type Props = {
  competitionId: string;
  sport: KioskSport;
  clubName?: string | null;
  clubLogoUrl?: string | null;
  onClubBranding?: (clubName: string | null, clubLogoUrl: string | null) => void;
  onGetStarted: () => void;
};

const REFRESH_MS = 60_000;

export function KioskCompetitionDashboard({
  competitionId,
  sport,
  onClubBranding,
  onGetStarted,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [board, setBoard] = useState<KioskDisplayBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [raceDayIndex, setRaceDayIndex] = useState(0);

  const load = useCallback(async () => {
    try {
      const next = await kioskGetDisplayBoard(competitionId, sport);
      setBoard(next);
      setError(null);
      onClubBranding?.(next.club_name, next.club_logo_url);
      setSelectedUserId((prev) => {
        if (!prev) return prev;
        return next.participants.some((p) => p.user_id === prev) ? prev : null;
      });
      setRaceDayIndex((i) =>
        next.race_days.length ? Math.min(i, next.race_days.length - 1) : 0
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load standings');
    } finally {
      setLoading(false);
    }
  }, [competitionId, sport, onClubBranding]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const selected = useMemo(
    () => board?.participants.find((p) => p.user_id === selectedUserId) ?? null,
    [board?.participants, selectedUserId]
  );

  const lmsPicksByUser = useMemo(() => {
    const map = new Map<string, LmsCompletedPick[]>();
    if (sport !== 'lms' || !board) return map;
    for (const pick of board.picks as LmsCompletedPick[]) {
      if (!pick?.user_id || !('team_id' in pick)) continue;
      const list = map.get(pick.user_id) ?? [];
      list.push(pick);
      map.set(pick.user_id, list);
    }
    for (const [uid, list] of map) {
      list.sort((a, b) => a.gameweek_number - b.gameweek_number);
      map.set(uid, list);
    }
    return map;
  }, [board, sport]);

  const f2tPicksByUser = useMemo(() => {
    const map = new Map<string, KioskF2tPick[]>();
    if (sport !== 'f2t' || !board) return map;
    for (const pick of board.picks as KioskF2tPick[]) {
      if (!pick?.user_id || !('player_id' in pick)) continue;
      const list = map.get(pick.user_id) ?? [];
      list.push(pick);
      map.set(pick.user_id, list);
    }
    for (const [uid, list] of map) {
      list.sort((a, b) => a.slot - b.slot);
      map.set(uid, list);
    }
    return map;
  }, [board, sport]);

  const racingPicksByUser = useMemo(() => {
    const map = new Map<string, KioskRacingPick[]>();
    if (sport !== 'racing' || !board) return map;
    for (const pick of board.picks as KioskRacingPick[]) {
      if (!pick?.user_id || !('horse_name' in pick)) continue;
      const list = map.get(pick.user_id) ?? [];
      list.push(pick);
      map.set(pick.user_id, list);
    }
    return map;
  }, [board, sport]);

  const { survivors, eliminated } = useMemo(() => {
    const list = board?.participants ?? [];
    if (sport === 'racing') {
      return { survivors: list, eliminated: [] as KioskDisplayParticipant[] };
    }
    if (sport === 'f2t') {
      return {
        survivors: list.filter((p) => p.status !== 'eliminated'),
        eliminated: list.filter((p) => p.status === 'eliminated'),
      };
    }
    return {
      survivors: list.filter((p) => p.status === 'active' || p.status === 'winner'),
      eliminated: list.filter((p) => p.status === 'eliminated'),
    };
  }, [board?.participants, sport]);

  const playerLabel = (p: KioskDisplayParticipant) =>
    (p.display_name || p.username || p.user_id.slice(0, 8)).trim();

  const renderStandingRow = (p: KioskDisplayParticipant) => {
    const name = playerLabel(p);
    const isSelected = selectedUserId === p.user_id;
    const alive = p.status === 'active' || p.status === 'winner' || sport === 'racing';
    const meta =
      sport === 'f2t'
        ? `${p.score ?? 0}/20 scored`
        : sport === 'racing'
          ? 'Tap for selections'
          : p.status === 'winner'
            ? 'Winner'
            : alive
              ? 'Alive'
              : 'Out';

    const lmsLast = sport === 'lms' ? lmsPicksByUser.get(p.user_id)?.slice(-1)[0] : null;

    return (
      <Pressable
        key={`${p.user_id}-${p.id}`}
        style={[
          styles.standingRow,
          isSelected && styles.standingRowSelected,
          !alive && styles.standingRowOut,
        ]}
        onPress={() => setSelectedUserId(p.user_id)}
      >
        <View style={styles.standingMain}>
          <Text style={[styles.standingName, !alive && styles.standingNameOut]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.standingMeta}>{meta}</Text>
        </View>
        {lmsLast?.team ? (
          <View style={styles.lastPick}>
            <TeamColourChip
              shortName={lmsLast.team.short_name}
              name={lmsLast.team.name}
              slug={lmsLast.team.slug}
              size={34}
            />
            <Text style={styles.lastPickGw}>GW{lmsLast.gameweek_number}</Text>
          </View>
        ) : sport === 'f2t' ? (
          <Text style={styles.scoreBadge}>{p.score ?? 0}</Text>
        ) : (
          <Text style={styles.noPick}>—</Text>
        )}
      </Pressable>
    );
  };

  const statsTitle =
    sport === 'f2t' ? 'Goalscorers' : sport === 'racing' ? 'Place results' : 'Survival rate';

  const qrValue = kioskAppLinkUrl();

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

  const elimRows = board?.elimination?.gameweeks ?? [];
  const activeRaceDay = board?.race_days[raceDayIndex] ?? null;

  return (
    <View style={styles.root}>
      <View style={styles.split}>
        <View style={styles.leftCol}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>Standing</Text>
            <Text style={styles.panelMeta}>
              {sport === 'lms' || sport === 'f2t'
                ? `${board?.alive_count ?? 0} / ${board?.total_count ?? 0} still in`
                : `${board?.total_count ?? 0} players`}
            </Text>
          </View>
          <ScrollView
            style={styles.leftScroll}
            contentContainerStyle={styles.leftScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {survivors.length ? (
              <>
                {sport !== 'racing' ? (
                  <Text style={styles.sectionLabel}>Still standing</Text>
                ) : null}
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
          <View style={styles.rightTopRow}>
            <View style={styles.statsCard}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>{statsTitle}</Text>
                {sport === 'lms' ? (
                  <Text style={styles.panelMeta}>{board?.alive_count ?? 0} still standing</Text>
                ) : null}
              </View>

              {sport === 'lms' ? (
                elimRows.length === 0 ? (
                  <Text style={styles.emptyHint}>
                    Survival rings appear after the first completed gameweek.
                  </Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.donutRow}
                  >
                    {elimRows.map((row) => (
                      <View key={row.gameweek_id} style={styles.donutCell}>
                        <Text style={styles.donutGw}>GW{row.gameweek_number}</Text>
                        <SurvivalDonut
                          survivalPct={row.survival_pct}
                          size={72}
                          strokeWidth={8}
                        />
                        <Text style={styles.donutOut}>{row.eliminated_count} out</Text>
                      </View>
                    ))}
                  </ScrollView>
                )
              ) : null}

              {sport === 'f2t' ? (
                (board?.goalscorers.length ?? 0) === 0 ? (
                  <Text style={styles.emptyHint}>
                    Goalscorers held by players will appear here once goals are recorded.
                  </Text>
                ) : (
                  <ScrollView
                    style={styles.statsScroll}
                    contentContainerStyle={styles.statsScrollContent}
                    showsVerticalScrollIndicator={false}
                  >
                    {board!.goalscorers.map((g) => (
                      <View key={g.player_id} style={styles.statRow}>
                        <TeamColourChip
                          shortName={g.team_short_name}
                          name={g.display_name}
                          slug={g.team_slug}
                          size={28}
                        />
                        <View style={styles.statMain}>
                          <Text style={styles.statName} numberOfLines={1}>
                            {g.display_name}
                          </Text>
                          <Text style={styles.statMeta}>
                            {g.goals} goal{g.goals === 1 ? '' : 's'}
                          </Text>
                        </View>
                        <Text style={styles.statCount}>
                          {g.holder_count} held
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )
              ) : null}

              {sport === 'racing' ? (
                <>
                  {(board?.race_days.length ?? 0) > 1 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.dayTabs}
                    >
                      {board!.race_days.map((d, i) => (
                        <Pressable
                          key={d.race_day_id}
                          style={[styles.dayTab, i === raceDayIndex && styles.dayTabActive]}
                          onPress={() => setRaceDayIndex(i)}
                        >
                          <Text
                            style={[
                              styles.dayTabText,
                              i === raceDayIndex && styles.dayTabTextActive,
                            ]}
                          >
                            {d.day_label}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                  {!activeRaceDay || activeRaceDay.races.length === 0 ? (
                    <Text style={styles.emptyHint}>
                      Place results (horses with points) will show here once races finish.
                    </Text>
                  ) : (
                    <ScrollView
                      style={styles.statsScroll}
                      contentContainerStyle={styles.statsScrollContent}
                      showsVerticalScrollIndicator={false}
                    >
                      {activeRaceDay.races.map((race) => (
                        <View key={race.race_id} style={styles.raceBlock}>
                          <Text style={styles.raceName} numberOfLines={1}>
                            {race.name}
                          </Text>
                          {race.horses.length === 0 ? (
                            <Text style={styles.statMeta}>No scoring places yet</Text>
                          ) : (
                            race.horses.map((h, idx) => (
                              <View
                                key={`${race.race_id}-${h.name}-${idx}`}
                                style={styles.statRow}
                              >
                                <Text style={styles.placeBadge}>
                                  {h.position != null ? `${h.position}` : '–'}
                                </Text>
                                <Text style={styles.statName} numberOfLines={1}>
                                  {h.name}
                                </Text>
                                <Text style={styles.statCount}>{h.points} pts</Text>
                              </View>
                            ))
                          )}
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </>
              ) : null}
            </View>

            <View style={styles.qrCard}>
              <Text style={styles.qrTitle}>Get the app</Text>
              <Text style={styles.qrBody}>Scan to open Top Tipster on your phone</Text>
              <View style={styles.qrWrap}>
                <QRCode
                  value={qrValue}
                  size={118}
                  backgroundColor={theme.colors.surface}
                  color={theme.colors.text}
                />
              </View>
            </View>
          </View>

          <View style={styles.rightBottom}>
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>
                {selected
                  ? `${playerLabel(selected)}’s pool`
                  : sport === 'racing'
                    ? 'Player selections'
                    : 'Player pool'}
              </Text>
            </View>

            {!selected ? (
              <Text style={styles.emptyHint}>
                Tap a player on the standings to see their selections.
              </Text>
            ) : sport === 'lms' && board ? (
              <ScrollView style={styles.poolScroll} showsVerticalScrollIndicator={false}>
                <StandingPlayerPoolCard
                  player={
                    {
                      id: selected.id,
                      competition_id: selected.competition_id,
                      user_id: selected.user_id,
                      status: selected.status,
                      eliminated_gameweek_id: selected.eliminated_gameweek_id ?? null,
                      joined_at: selected.joined_at ?? '',
                      rollover_count: selected.rollover_count ?? 0,
                      username: selected.username ?? selected.display_name,
                    } as LmsParticipant
                  }
                  poolTeams={board.pool_teams}
                  picks={lmsPicksByUser.get(selected.user_id) ?? []}
                  large
                />
              </ScrollView>
            ) : sport === 'f2t' ? (
              <ScrollView
                style={styles.poolScroll}
                contentContainerStyle={styles.chipGrid}
                showsVerticalScrollIndicator={false}
              >
                {(f2tPicksByUser.get(selected.user_id) ?? []).map((p) => (
                  <View
                    key={`${p.user_id}-${p.slot}`}
                    style={[styles.chip, p.scored && styles.chipScored]}
                  >
                    <TeamColourChip
                      shortName={p.team_short_name}
                      name={p.display_name}
                      slug={p.team_slug}
                      size={26}
                    />
                    <Text style={styles.chipName} numberOfLines={1}>
                      {p.display_name}
                    </Text>
                    <Text style={styles.chipMeta}>
                      {p.scored
                        ? p.scored_gameweek_number
                          ? `Scored GW${p.scored_gameweek_number}`
                          : 'Scored'
                        : 'Waiting'}
                    </Text>
                  </View>
                ))}
                {(f2tPicksByUser.get(selected.user_id) ?? []).length === 0 ? (
                  <Text style={styles.emptyHint}>No players selected yet.</Text>
                ) : null}
              </ScrollView>
            ) : (
              <ScrollView
                style={styles.poolScroll}
                contentContainerStyle={styles.chipGrid}
                showsVerticalScrollIndicator={false}
              >
                {(racingPicksByUser.get(selected.user_id) ?? []).map((p, i) => (
                  <View key={`${p.user_id}-${p.race_name}-${i}`} style={styles.chip}>
                    <Text style={styles.chipName} numberOfLines={1}>
                      {p.horse_name}
                    </Text>
                    <Text style={styles.chipMeta} numberOfLines={1}>
                      {p.race_name}
                      {p.points != null && p.points > 0 ? ` · ${p.points} pts` : ''}
                    </Text>
                  </View>
                ))}
                {(racingPicksByUser.get(selected.user_id) ?? []).length === 0 ? (
                  <Text style={styles.emptyHint}>No selections yet.</Text>
                ) : null}
              </ScrollView>
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
    root: { flex: 1, minHeight: 0, gap: 10 },
    loadingWrap: {
      flex: 1,
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
    retryBtn: { paddingVertical: 12, paddingHorizontal: 18 },
    retryBtnText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 17,
      color: theme.colors.accent,
    },
    split: { flex: 1, flexDirection: 'row', gap: 10, minHeight: 0 },
    leftCol: {
      flex: 1.15,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: 12,
      minWidth: 0,
    },
    rightCol: { flex: 1, gap: 10, minWidth: 0 },
    rightTopRow: { flexDirection: 'row', gap: 10, flex: 0.95, minHeight: 170 },
    statsCard: {
      flex: 1.35,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: 12,
      minWidth: 0,
    },
    qrCard: {
      width: 168,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: 12,
      alignItems: 'center',
      gap: 6,
    },
    qrTitle: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 15,
      color: theme.colors.text,
    },
    qrBody: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    qrWrap: {
      marginTop: 4,
      padding: 8,
      backgroundColor: theme.colors.surface,
      borderRadius: 8,
    },
    rightBottom: {
      flex: 1.2,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: 12,
      minHeight: 160,
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
    leftScroll: { flex: 1 },
    leftScrollContent: { paddingBottom: 8, gap: 6 },
    sectionLabel: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
      marginBottom: 6,
    },
    sectionLabelSpaced: { marginTop: 14 },
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
    standingRowOut: { opacity: 0.8 },
    standingMain: { flex: 1, minWidth: 0, gap: 3 },
    standingName: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 19,
      color: theme.colors.text,
    },
    standingNameOut: { color: theme.colors.textMuted },
    standingMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    lastPick: { alignItems: 'center', gap: 3 },
    lastPickGw: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 11,
      color: theme.colors.accent,
    },
    scoreBadge: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 18,
      color: theme.colors.accent,
      minWidth: 28,
      textAlign: 'center',
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
      gap: 14,
      paddingVertical: 4,
      paddingRight: 8,
    },
    donutCell: { alignItems: 'center', gap: 5, width: 84 },
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
    statsScroll: { flex: 1 },
    statsScrollContent: { gap: 8, paddingBottom: 4 },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 6,
    },
    statMain: { flex: 1, minWidth: 0, gap: 2 },
    statName: {
      flex: 1,
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 15,
      color: theme.colors.text,
    },
    statMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    statCount: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 14,
      color: theme.colors.accent,
    },
    dayTabs: { gap: 8, paddingBottom: 8 },
    dayTab: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: theme.radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    dayTabActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentMuted,
    },
    dayTabText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    dayTabTextActive: { color: theme.colors.accent },
    raceBlock: { gap: 4, marginBottom: 8 },
    raceName: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 2,
    },
    placeBadge: {
      width: 28,
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 15,
      color: theme.colors.accent,
      textAlign: 'center',
    },
    poolScroll: { flex: 1 },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      width: '31%',
      minWidth: 110,
      flexGrow: 1,
      backgroundColor: theme.colors.background,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: 10,
      gap: 4,
      alignItems: 'flex-start',
    },
    chipScored: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentMuted,
    },
    chipName: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.text,
    },
    chipMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textMuted,
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
    ctaCopy: { flex: 1, gap: 4, minWidth: 0 },
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
