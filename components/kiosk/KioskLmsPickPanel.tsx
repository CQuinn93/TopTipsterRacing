import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import { lmsDisplayTeamName } from '@/lib/lms/teamColours';
import {
  lmsGetCompetition,
  lmsGetCompetitionCurrentGameweek,
  lmsGetCompetitionRejoinInfo,
  lmsGetMyParticipant,
  lmsGetMyPick,
  lmsJoinErrorMessage,
  lmsListCompetitionTeamIds,
  lmsListFixturesForGameweek,
  lmsListTeams,
  lmsListUsedTeamIds,
  lmsPickErrorMessage,
  lmsRequestRejoin,
  lmsSubmitPick,
  type LmsFixture,
  type LmsGameweek,
  type LmsPick,
  type LmsTeam,
} from '@/lib/lms/api';

type Props = {
  competitionId: string;
  userId: string;
  onActivity?: () => void;
  onFinished: () => void;
};

export function KioskLmsPickPanel({
  competitionId,
  userId,
  onActivity,
  onFinished,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rejoining, setRejoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [compStatus, setCompStatus] = useState<string | null>(null);
  const [currentGw, setCurrentGw] = useState<LmsGameweek | null>(null);
  const [startGwNumber, setStartGwNumber] = useState<number | null>(null);
  const [pick, setPick] = useState<LmsPick | null>(null);
  const [usedIds, setUsedIds] = useState<string[]>([]);
  const [teams, setTeams] = useState<LmsTeam[]>([]);
  const [poolIds, setPoolIds] = useState<string[]>([]);
  const [fixtures, setFixtures] = useState<LmsFixture[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [canRequestRejoin, setCanRequestRejoin] = useState(false);
  const [hasPendingRejoin, setHasPendingRejoin] = useState(false);
  const [rejoinGwNumber, setRejoinGwNumber] = useState<number | null>(null);

  const bump = useCallback(() => {
    onActivity?.();
  }, [onActivity]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const comp = await lmsGetCompetition(competitionId);
      setCompStatus(comp?.status ?? null);
      const me = await lmsGetMyParticipant(competitionId, userId);
      setStatus(me?.status ?? null);

      if (me?.status === 'eliminated') {
        try {
          const rejoin = await lmsGetCompetitionRejoinInfo(competitionId);
          setCanRequestRejoin(!!rejoin.can_request_rejoin);
          setHasPendingRejoin(!!rejoin.has_pending_rejoin);
          setRejoinGwNumber(rejoin.rejoin_valid_for_gameweek_number);
        } catch {
          setCanRequestRejoin(false);
          setHasPendingRejoin(false);
          setRejoinGwNumber(null);
        }
      } else {
        setCanRequestRejoin(false);
        setHasPendingRejoin(false);
        setRejoinGwNumber(null);
      }

      const { gameweek, startGameweekNumber } = await lmsGetCompetitionCurrentGameweek(
        competitionId,
        comp
      );
      setCurrentGw(gameweek);
      setStartGwNumber(startGameweekNumber);

      const [allTeams, pool, used] = await Promise.all([
        lmsListTeams(),
        lmsListCompetitionTeamIds(competitionId),
        lmsListUsedTeamIds(competitionId, userId),
      ]);
      setTeams(allTeams);
      setPoolIds(pool);
      setUsedIds(used);

      if (gameweek) {
        const [myPick, gwFixtures] = await Promise.all([
          lmsGetMyPick(competitionId, userId, gameweek.id),
          lmsListFixturesForGameweek(gameweek.id),
        ]);
        setPick(myPick);
        setSelectedTeamId(myPick?.team_id ?? null);
        setFixtures(gwFixtures);
      } else {
        setPick(null);
        setSelectedTeamId(null);
        setFixtures([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your pick.');
    } finally {
      setLoading(false);
    }
  }, [competitionId, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const competitionTeams = useMemo(() => {
    const pool = new Set(poolIds);
    return teams.filter((t) => pool.has(t.id));
  }, [teams, poolIds]);

  const playingTeamIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of fixtures) {
      if (f.excluded_from_lms) continue;
      ids.add(f.home_team_id);
      ids.add(f.away_team_id);
    }
    return ids;
  }, [fixtures]);

  const unavailableNoteByTeamId = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fixtures) {
      if (!f.excluded_from_lms) continue;
      const note = f.excluded_reason?.trim() || 'No game this week';
      map.set(f.home_team_id, note);
      map.set(f.away_team_id, note);
    }
    for (const t of competitionTeams) {
      if (playingTeamIds.has(t.id) || map.has(t.id)) continue;
      const hasAny = fixtures.some(
        (f) => f.home_team_id === t.id || f.away_team_id === t.id
      );
      if (!hasAny) map.set(t.id, 'No game this week');
    }
    return map;
  }, [fixtures, competitionTeams, playingTeamIds]);

  const opponentByTeamId = useMemo(() => {
    const map = new Map<string, LmsTeam>();
    for (const f of fixtures) {
      if (f.away_team) map.set(f.home_team_id, f.away_team);
      if (f.home_team) map.set(f.away_team_id, f.home_team);
    }
    return map;
  }, [fixtures]);

  const venueByTeamId = useMemo(() => {
    const map = new Map<string, 'H' | 'A'>();
    for (const f of fixtures) {
      map.set(f.home_team_id, 'H');
      map.set(f.away_team_id, 'A');
    }
    return map;
  }, [fixtures]);

  const selectionTeams = useMemo(() => {
    const used = new Set(usedIds);
    if (pick?.team_id) used.delete(pick.team_id);
    return competitionTeams
      .filter((t) => !used.has(t.id))
      .sort((a, b) =>
        (a.short_name || a.name).localeCompare(b.short_name || b.name, undefined, {
          sensitivity: 'base',
        })
      );
  }, [competitionTeams, usedIds, pick?.team_id]);

  const remainingTeams = useMemo(
    () => selectionTeams.filter((t) => playingTeamIds.has(t.id)),
    [selectionTeams, playingTeamIds]
  );

  const currentPickTeam = useMemo(
    () => (pick ? competitionTeams.find((t) => t.id === pick.team_id) ?? null : null),
    [pick, competitionTeams]
  );

  const deadlinePassed = currentGw
    ? new Date(currentGw.deadline_at).getTime() <= Date.now()
    : true;
  const canPick =
    status === 'active' && !!currentGw && !deadlinePassed && compStatus !== 'completed';

  const onSave = async () => {
    if (!selectedTeamId || !currentGw) return;
    bump();
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await lmsSubmitPick({
        competitionId,
        gameweekId: currentGw.id,
        teamId: selectedTeamId,
      });
      if (!res.success) {
        setError(lmsPickErrorMessage(res.error));
        return;
      }
      const team = competitionTeams.find((t) => t.id === selectedTeamId) ?? null;
      setPick({
        id: pick?.id ?? `local-${selectedTeamId}`,
        competition_id: competitionId,
        user_id: userId,
        gameweek_id: currentGw.id,
        team_id: selectedTeamId,
        result: pick?.result ?? 'pending',
        team: team ?? undefined,
      });
      setUsedIds((prev) => {
        const withoutOld = pick?.team_id ? prev.filter((id) => id !== pick.team_id) : prev;
        return withoutOld.includes(selectedTeamId)
          ? withoutOld
          : [...withoutOld, selectedTeamId];
      });
      setSavedMsg(
        team
          ? `Locked in: ${lmsDisplayTeamName(team.name)}. You’re set for GW${currentGw.number}.`
          : `Pick saved for GW${currentGw.number}.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save pick');
    } finally {
      setSaving(false);
    }
  };

  const onRequestRejoin = async () => {
    bump();
    setRejoining(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await lmsRequestRejoin(competitionId);
      if (!res.success) {
        setError(lmsJoinErrorMessage(res.error));
        return;
      }
      setHasPendingRejoin(true);
      setCanRequestRejoin(false);
      setSavedMsg(
        rejoinGwNumber != null
          ? `Re-entry requested for GW${rejoinGwNumber}. Wait for staff to confirm.`
          : 'Re-entry requested. Wait for staff to confirm.'
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not request re-entry');
    } finally {
      setRejoining(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.block}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.body}>Loading your selection…</Text>
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Text style={styles.title}>
        {status === 'eliminated' ? 'You’re out' : 'Your selection'}
      </Text>
      <Text style={styles.body}>
        {status === 'eliminated'
          ? 'You were knocked out earlier. You can’t pick until staff bring you back in a re-entry round.'
          : 'You’re already in this competition. Review or lock in this week’s pick, then tap Done so the next person can use the hub.'}
      </Text>

      {currentPickTeam ? (
        <View style={styles.currentCard}>
          <Text style={styles.currentLabel}>
            {currentGw ? `GW${currentGw.number} pick` : 'Current pick'}
          </Text>
          <View style={styles.currentRow}>
            <TeamColourChip
              shortName={currentPickTeam.short_name}
              name={currentPickTeam.name}
              slug={currentPickTeam.slug}
              size={36}
            />
            <Text style={styles.currentName}>
              {lmsDisplayTeamName(currentPickTeam.name)}
            </Text>
          </View>
        </View>
      ) : null}

      {status !== 'active' ? (
        <View style={styles.statusBlock}>
          <Text style={styles.muted}>
            {status === 'winner'
              ? 'You won this competition — no further picks needed.'
              : status === 'eliminated'
                ? 'You’re out this round and can’t make a pick until you’re back in.'
                : 'Your entry isn’t active for picks yet. Ask staff if you’re waiting on approval.'}
          </Text>
          {status === 'eliminated' && hasPendingRejoin ? (
            <Text style={styles.successText}>
              Re-entry request is with staff
              {rejoinGwNumber != null ? ` (GW${rejoinGwNumber})` : ''}.
            </Text>
          ) : null}
          {status === 'eliminated' && canRequestRejoin ? (
            <Pressable
              style={[styles.primaryBtn, rejoining && styles.primaryBtnDisabled]}
              disabled={rejoining}
              onPress={() => void onRequestRejoin()}
            >
              {rejoining ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {rejoinGwNumber != null
                    ? `Request re-entry · GW${rejoinGwNumber}`
                    : 'Request re-entry'}
                </Text>
              )}
            </Pressable>
          ) : null}
          {status === 'eliminated' && !canRequestRejoin && !hasPendingRejoin ? (
            <Text style={styles.muted}>
              No rollover window is open right now. Come back if the club runs a re-entry round.
            </Text>
          ) : null}
        </View>
      ) : !currentGw ? (
        <Text style={styles.muted}>
          {startGwNumber != null
            ? `This competition starts at GW${startGwNumber}. Selection opens then.`
            : 'No open gameweek for picks yet.'}
        </Text>
      ) : !canPick ? (
        <Text style={styles.muted}>
          {pick
            ? `Picks are locked for GW${currentGw.number}. Come back after settlement.`
            : `Picks are closed for GW${currentGw.number}.`}
        </Text>
      ) : selectionTeams.length === 0 ? (
        <Text style={styles.muted}>No unused teams left in this competition’s pool.</Text>
      ) : remainingTeams.length === 0 ? (
        <Text style={styles.muted}>
          Every remaining pool team is unavailable this gameweek.
        </Text>
      ) : (
        <>
          <Text style={styles.poolTitle}>Choose a winner · GW{currentGw.number}</Text>
          <View style={styles.teamGrid}>
            {selectionTeams.map((t) => {
              const selected = selectedTeamId === t.id;
              const pickable = playingTeamIds.has(t.id);
              const note = unavailableNoteByTeamId.get(t.id);
              const opponent = opponentByTeamId.get(t.id);
              const venue = venueByTeamId.get(t.id);
              const opponentVenue = opponent ? venueByTeamId.get(opponent.id) : undefined;
              const teamLabel = venue
                ? `${lmsDisplayTeamName(t.name)} (${venue})`
                : lmsDisplayTeamName(t.name);
              const vsLabel =
                opponent && opponentVenue
                  ? `vs ${opponent.short_name || opponent.name} (${opponentVenue})`
                  : opponent
                    ? `vs ${opponent.short_name || opponent.name}`
                    : null;
              return (
                <Pressable
                  key={t.id}
                  style={[
                    styles.teamTile,
                    selected && pickable && styles.teamTileSelected,
                    !pickable && styles.teamTileDisabled,
                  ]}
                  disabled={!pickable || saving}
                  onPress={() => {
                    bump();
                    setSelectedTeamId(t.id);
                    setSavedMsg(null);
                  }}
                >
                  <TeamColourChip
                    shortName={t.short_name}
                    name={t.name}
                    slug={t.slug}
                    size={28}
                  />
                  <View style={styles.teamTileTextCol}>
                    <Text
                      style={[
                        styles.teamTileName,
                        selected && pickable && styles.teamTileNameSelected,
                        !pickable && styles.teamTileNameDisabled,
                      ]}
                      numberOfLines={1}
                    >
                      {teamLabel}
                    </Text>
                    <Text style={styles.teamTileMeta} numberOfLines={1}>
                      {!pickable ? note ?? 'Unavailable' : vsLabel ?? ' '}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={[
              styles.primaryBtn,
              (!selectedTeamId ||
                saving ||
                !playingTeamIds.has(selectedTeamId)) &&
                styles.primaryBtnDisabled,
            ]}
            disabled={
              !selectedTeamId || saving || !playingTeamIds.has(selectedTeamId ?? '')
            }
            onPress={() => void onSave()}
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>
                {pick ? 'Update pick' : 'Lock in pick'}
              </Text>
            )}
          </Pressable>
        </>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {savedMsg ? <Text style={styles.successText}>{savedMsg}</Text> : null}

      <Pressable
        style={styles.secondaryBtn}
        onPress={() => {
          bump();
          onFinished();
        }}
      >
        <Text style={styles.secondaryBtnText}>Done</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    block: {
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
    },
    title: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 24,
      color: theme.colors.text,
    },
    body: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 16,
      lineHeight: 24,
      color: theme.colors.textSecondary,
    },
    muted: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 14,
      lineHeight: 20,
      color: theme.colors.textMuted,
      marginTop: 4,
    },
    statusBlock: {
      gap: 8,
      marginTop: 4,
    },
    poolTitle: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 15,
      color: theme.colors.text,
      marginTop: 8,
    },
    currentCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: 8,
    },
    currentLabel: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
    },
    currentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    currentName: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 18,
      color: theme.colors.text,
      flex: 1,
    },
    teamGrid: {
      gap: 8,
      marginTop: 4,
    },
    teamTile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    teamTileSelected: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentMuted,
    },
    teamTileDisabled: {
      opacity: 0.45,
    },
    teamTileTextCol: {
      flex: 1,
      gap: 2,
    },
    teamTileName: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 15,
      color: theme.colors.text,
    },
    teamTileNameSelected: {
      color: theme.colors.accent,
    },
    teamTileNameDisabled: {
      color: theme.colors.textMuted,
    },
    teamTileMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    primaryBtn: {
      marginTop: theme.spacing.sm,
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.md,
      paddingVertical: 16,
      alignItems: 'center',
    },
    primaryBtnDisabled: {
      opacity: 0.55,
    },
    primaryBtnText: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 17,
      color: theme.colors.white,
    },
    secondaryBtn: {
      marginTop: 8,
      borderRadius: theme.radius.md,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    secondaryBtnText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 15,
      color: theme.colors.textSecondary,
    },
    errorText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.error,
    },
    successText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.accent,
      lineHeight: 20,
    },
  });
}
