import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { TeamCrest } from '@/components/lms/TeamCrest';
import { LmsTrademarkDisclaimer } from '@/components/lms/LmsTrademarkDisclaimer';
import {
  lmsGetCompetition,
  lmsGetCompetitionCurrentGameweek,
  lmsGetMyParticipant,
  lmsGetMyPick,
  lmsListFixturesForGameweek,
  lmsListParticipants,
  lmsListTeams,
  lmsListUsedTeamIds,
  lmsPickErrorMessage,
  lmsSubmitPick,
  type LmsFixture,
  type LmsGameweek,
  type LmsParticipant,
  type LmsPick,
  type LmsTeam,
} from '@/lib/lms/api';

export default function LmsCompetitionDashboard() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ competitionId: string }>();
  const competitionId = String(params.competitionId ?? '');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState('');
  const [compStatus, setCompStatus] = useState('');
  const [startGwNumber, setStartGwNumber] = useState<number | null>(null);
  const [me, setMe] = useState<LmsParticipant | null>(null);
  const [gw, setGw] = useState<LmsGameweek | null>(null);
  const [fixtures, setFixtures] = useState<LmsFixture[]>([]);
  const [teams, setTeams] = useState<LmsTeam[]>([]);
  const [usedIds, setUsedIds] = useState<string[]>([]);
  const [pick, setPick] = useState<LmsPick | null>(null);
  const [leaderboard, setLeaderboard] = useState<LmsParticipant[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!competitionId || !userId) return;
    try {
      const [comp, participant, gwInfo, allTeams, parts] = await Promise.all([
        lmsGetCompetition(competitionId),
        lmsGetMyParticipant(competitionId, userId),
        lmsGetCompetitionCurrentGameweek(competitionId),
        lmsListTeams(),
        lmsListParticipants(competitionId),
      ]);
      const currentGw = gwInfo.gameweek;
      setName(comp?.name ?? 'Competition');
      setCompStatus(comp?.status ?? '');
      setStartGwNumber(gwInfo.startGameweekNumber);
      setMe(participant);
      setGw(currentGw);
      setTeams(allTeams);
      setLeaderboard(parts);

      if (currentGw) {
        const [fx, used, myPick] = await Promise.all([
          lmsListFixturesForGameweek(currentGw.id),
          lmsListUsedTeamIds(competitionId, userId),
          lmsGetMyPick(competitionId, userId, currentGw.id),
        ]);
        setFixtures(fx);
        setUsedIds(used);
        setPick(myPick);
        setSelectedTeamId(myPick?.team_id ?? null);
      } else {
        setFixtures([]);
        setUsedIds([]);
        setPick(null);
        setSelectedTeamId(null);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [competitionId, userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const playingTeamIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of fixtures) {
      ids.add(f.home_team_id);
      ids.add(f.away_team_id);
    }
    return ids;
  }, [fixtures]);

  const remainingTeams = useMemo(() => {
    const used = new Set(usedIds);
    // Allow current GW pick team to appear as selected even though it's in used_teams
    if (pick?.team_id) used.delete(pick.team_id);
    return teams.filter((t) => !used.has(t.id) && playingTeamIds.has(t.id));
  }, [teams, usedIds, playingTeamIds, pick?.team_id]);

  const deadlinePassed = gw ? new Date(gw.deadline_at).getTime() <= Date.now() : true;
  const canPick = me?.status === 'active' && !!gw && !deadlinePassed && compStatus !== 'completed';

  const onSavePick = async () => {
    if (!selectedTeamId || !gw) return;
    setSaving(true);
    try {
      const res = await lmsSubmitPick({
        competitionId,
        gameweekId: gw.id,
        teamId: selectedTeamId,
      });
      if (!res.success) {
        Alert.alert('Pick not saved', lmsPickErrorMessage(res.error));
        return;
      }
      Alert.alert('Saved', 'Your gameweek pick is locked in until the deadline.');
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save pick');
    } finally {
      setSaving(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        },
        titleBlock: { flex: 1 },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          fontWeight: '700',
          color: theme.colors.text,
        },
        sub: {
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.textSecondary,
          marginTop: 2,
        },
        content: {
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.lg,
        },
        sectionLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: theme.colors.accent,
          marginBottom: theme.spacing.sm,
        },
        panel: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.sm,
        },
        statusLine: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.text,
          marginBottom: theme.spacing.xs,
        },
        muted: {
          fontFamily: theme.fontFamily.light,
          fontSize: 13,
          color: theme.colors.textMuted,
          lineHeight: 18,
        },
        fixtureRow: {
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        fixtureTeams: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        },
        fixtureSide: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        fixtureText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.text,
        },
        fixtureMeta: {
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginTop: 2,
        },
        teamRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          gap: 10,
        },
        teamLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          flex: 1,
        },
        teamName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.text,
          flexShrink: 1,
        },
        teamSelected: { color: theme.colors.accent, fontWeight: '700' },
        remainingRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 6,
        },
        primaryBtn: {
          marginTop: theme.spacing.md,
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: 12,
          alignItems: 'center',
          opacity: canPick ? 1 : 0.5,
        },
        primaryBtnText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.white,
          fontWeight: '700',
        },
        lbRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        lbName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.text,
        },
        lbStatus: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.textMuted,
          textTransform: 'capitalize',
        },
      }),
    [theme, insets.top, insets.bottom, canPick]
  );

  const formatKickoff = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.sub}>
            {compStatus}
            {startGwNumber != null ? ` · starts GW${startGwNumber}` : ''}
            {me ? ` · you are ${me.status}` : ''}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.accent} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={theme.colors.accent}
            />
          }
        >
          <View>
            <Text style={styles.sectionLabel}>Gameweek</Text>
            <View style={styles.panel}>
              {gw ? (
                <>
                  <Text style={styles.statusLine}>Gameweek {gw.number}</Text>
                  <Text style={styles.muted}>
                    Deadline {formatKickoff(gw.deadline_at)}
                    {deadlinePassed ? ' · closed' : ''}
                  </Text>
                </>
              ) : (
                <Text style={styles.muted}>
                  {startGwNumber != null
                    ? `This competition starts at GW${startGwNumber}. Picks will appear when that gameweek is open.`
                    : 'No upcoming gameweek.'}
                </Text>
              )}
            </View>
          </View>

          <View>
            <Text style={styles.sectionLabel}>Fixtures</Text>
            <View style={styles.panel}>
              {fixtures.length === 0 ? (
                <Text style={styles.muted}>Fixtures for this gameweek are not loaded yet.</Text>
              ) : (
                fixtures.map((f, i) => (
                  <View
                    key={f.id}
                    style={[styles.fixtureRow, i === fixtures.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <View style={styles.fixtureTeams}>
                      <View style={styles.fixtureSide}>
                        <TeamCrest uri={f.home_team?.crest_url} label={f.home_team?.name} size={22} />
                        <Text style={styles.fixtureText}>
                          {f.home_team?.short_name ?? 'H'}
                        </Text>
                      </View>
                      <Text style={styles.fixtureText}>
                        {f.status === 'finished'
                          ? `${f.home_goals ?? 0}-${f.away_goals ?? 0}`
                          : 'vs'}
                      </Text>
                      <View style={styles.fixtureSide}>
                        <TeamCrest uri={f.away_team?.crest_url} label={f.away_team?.name} size={22} />
                        <Text style={styles.fixtureText}>
                          {f.away_team?.short_name ?? 'A'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.fixtureMeta}>
                      {f.home_team?.name} vs {f.away_team?.name} · {formatKickoff(f.kickoff_at)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>

          <View>
            <Text style={styles.sectionLabel}>Your pick</Text>
            <View style={styles.panel}>
              {me?.status !== 'active' ? (
                <Text style={styles.muted}>
                  {me?.status === 'winner'
                    ? 'You won this competition. Leaderboard remains available.'
                    : 'You are eliminated and cannot make further picks. Leaderboard remains available.'}
                </Text>
              ) : !canPick ? (
                <Text style={styles.muted}>
                  {pick
                    ? `Current pick locked: ${teams.find((t) => t.id === pick.team_id)?.name ?? 'team'}`
                    : 'Picks are closed for this gameweek.'}
                </Text>
              ) : remainingTeams.length === 0 ? (
                <Text style={styles.muted}>No eligible unused teams playing this gameweek.</Text>
              ) : (
                <>
                  <Text style={styles.muted}>
                    Choose one unused team that must win. Draws knock you out.
                  </Text>
                  {remainingTeams.map((t, i) => {
                    const selected = selectedTeamId === t.id;
                    return (
                      <Pressable
                        key={t.id}
                        style={[styles.teamRow, i === remainingTeams.length - 1 && { borderBottomWidth: 0 }]}
                        onPress={() => setSelectedTeamId(t.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Select ${t.name}`}
                      >
                        <View style={styles.teamLeft}>
                          <TeamCrest uri={t.crest_url} label={t.name} size={32} />
                          <Text style={[styles.teamName, selected && styles.teamSelected]}>
                            {t.name}
                          </Text>
                        </View>
                        {selected ? (
                          <Ionicons name="checkmark-circle" size={18} color={theme.colors.accent} />
                        ) : (
                          <Ionicons name="ellipse-outline" size={18} color={theme.colors.textMuted} />
                        )}
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={styles.primaryBtn}
                    disabled={!selectedTeamId || saving}
                    onPress={() => void onSavePick()}
                  >
                    {saving ? (
                      <ActivityIndicator color={theme.colors.white} />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        {pick ? 'Update pick' : 'Save pick'}
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </View>

          <View>
            <Text style={styles.sectionLabel}>Remaining teams</Text>
            <View style={styles.panel}>
              {(() => {
                const used = new Set(usedIds);
                const remaining = teams.filter((t) => !used.has(t.id));
                if (!remaining.length) {
                  return <Text style={styles.muted}>No teams left in your pool.</Text>;
                }
                return remaining.map((t, i) => (
                  <View
                    key={t.id}
                    style={[
                      styles.remainingRow,
                      i < remaining.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: theme.colors.border,
                      },
                    ]}
                  >
                    <TeamCrest uri={t.crest_url} label={t.name} size={22} />
                    <Text style={styles.muted}>{t.name}</Text>
                  </View>
                ));
              })()}
            </View>
          </View>

          <View>
            <Text style={styles.sectionLabel}>Leaderboard</Text>
            <View style={styles.panel}>
              {leaderboard.map((p, i) => (
                <View
                  key={p.id}
                  style={[styles.lbRow, i === leaderboard.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <Text style={styles.lbName}>
                    {p.username || p.user_id.slice(0, 8)}
                    {p.user_id === userId ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.lbStatus}>{p.status}</Text>
                </View>
              ))}
            </View>
          </View>

          <LmsTrademarkDisclaimer />
        </ScrollView>
      )}
    </View>
  );
}
