import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { TeamCrest } from '@/components/lms/TeamCrest';
import { TeamFormDots } from '@/components/lms/TeamFormDots';
import { LmsTrademarkDisclaimer } from '@/components/lms/LmsTrademarkDisclaimer';
import {
  lmsAdminSetCompetitionTeam,
  lmsAdminSetFixtureExcluded,
  lmsAdminDeleteCompetition,
  lmsGetCompetition,
  lmsGetCompetitionCurrentGameweek,
  lmsGetMyParticipant,
  lmsGetMyPick,
  lmsIsProfileAdmin,
  lmsListCompetitionGameweeks,
  lmsListCompetitionTeamIds,
  lmsListCompletedPicksForUser,
  lmsListFixturesForGameweek,
  lmsListParticipants,
  lmsListPicksForGameweek,
  lmsListSeasonFixtures,
  lmsListTeams,
  lmsListUsedTeamIds,
  lmsPickErrorMessage,
  lmsSubmitPick,
  lmsTeamFormFromFixtures,
  type LmsCompetition,
  type LmsCompletedPick,
  type LmsFixture,
  type LmsGameweek,
  type LmsParticipant,
  type LmsPick,
  type LmsTeam,
} from '@/lib/lms/api';

type TabKey = 'gameweeks' | 'selection' | 'leaderboard' | 'admin';

export default function LmsCompetitionDashboard() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ competitionId: string }>();
  const competitionId = String(params.competitionId ?? '');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [gameweeksLoading, setGameweeksLoading] = useState(false);
  const [tab, setTab] = useState<TabKey>('leaderboard');
  const [name, setName] = useState('');
  const [compStatus, setCompStatus] = useState('');
  const [startGwNumber, setStartGwNumber] = useState<number | null>(null);
  const [me, setMe] = useState<LmsParticipant | null>(null);
  const [currentGw, setCurrentGw] = useState<LmsGameweek | null>(null);
  const [gameweeks, setGameweeks] = useState<LmsGameweek[]>([]);
  const [seasonFixtures, setSeasonFixtures] = useState<LmsFixture[]>([]);
  const [filterGwId, setFilterGwId] = useState<string | null>(null);
  const [filterTeamId, setFilterTeamId] = useState<string | null>(null);
  const [pickGwFixtures, setPickGwFixtures] = useState<LmsFixture[]>([]);
  const [teams, setTeams] = useState<LmsTeam[]>([]);
  const [usedIds, setUsedIds] = useState<string[]>([]);
  const [pick, setPick] = useState<LmsPick | null>(null);
  const [gwPicks, setGwPicks] = useState<LmsPick[]>([]);
  const [historyPicks, setHistoryPicks] = useState<LmsCompletedPick[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LmsParticipant[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [poolTeamIds, setPoolTeamIds] = useState<string[]>([]);
  const [adminGwId, setAdminGwId] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState<'pool' | 'exclusions'>('pool');
  const [excludeReasons, setExcludeReasons] = useState<Record<string, string>>({});
  const [historyLoadingUserId, setHistoryLoadingUserId] = useState<string | null>(null);

  const competitionRef = useRef<LmsCompetition | null>(null);
  const currentGwIdRef = useRef<string | null>(null);
  const loadedRef = useRef({
    leaderboardExtras: false,
    selection: false,
    gameweeks: false,
    pickGwFixtures: false,
  });
  const historyLoadedUsersRef = useRef(new Set<string>());
  const tabRef = useRef<TabKey>(tab);
  tabRef.current = tab;

  const mergeTeams = useCallback((incoming: LmsTeam[]) => {
    if (!incoming.length) return;
    setTeams((prev) => {
      if (!prev.length) return incoming;
      const byId = new Map(prev.map((t) => [t.id, t]));
      for (const t of incoming) byId.set(t.id, t);
      return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
    });
  }, []);

  const ensurePickGwFixtures = useCallback(
    async (gwId: string) => {
      if (loadedRef.current.pickGwFixtures && currentGwIdRef.current === gwId) {
        return;
      }
      const pickFx = await lmsListFixturesForGameweek(gwId);
      setPickGwFixtures(pickFx);
      loadedRef.current.pickGwFixtures = true;
      currentGwIdRef.current = gwId;
    },
    []
  );

  const loadLeaderboardExtras = useCallback(
    async (gw: LmsGameweek | null, opts?: { force?: boolean }) => {
      if (!competitionId) return;
      if (!opts?.force && loadedRef.current.leaderboardExtras) return;
      if (!gw) {
        setGwPicks([]);
        setPickGwFixtures([]);
        loadedRef.current.leaderboardExtras = true;
        loadedRef.current.pickGwFixtures = false;
        currentGwIdRef.current = null;
        return;
      }
      const [pickFx, picks] = await Promise.all([
        lmsListFixturesForGameweek(gw.id),
        lmsListPicksForGameweek(competitionId, gw.id),
      ]);
      setPickGwFixtures(pickFx);
      setGwPicks(picks);
      loadedRef.current.leaderboardExtras = true;
      loadedRef.current.pickGwFixtures = true;
      currentGwIdRef.current = gw.id;
    },
    [competitionId]
  );

  const loadSelectionSlice = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!competitionId || !userId) return;
      if (!opts?.force && loadedRef.current.selection) return;
      setSelectionLoading(true);
      try {
        const comp = competitionRef.current;
        const gwId = currentGwIdRef.current;

        const base = await Promise.all([
          lmsListTeams(),
          lmsListCompetitionTeamIds(competitionId),
          lmsListUsedTeamIds(competitionId, userId),
          lmsListCompletedPicksForUser(competitionId, userId, comp),
          gwId ? lmsGetMyPick(competitionId, userId, gwId) : Promise.resolve(null),
          gwId && (!loadedRef.current.pickGwFixtures || opts?.force)
            ? ensurePickGwFixtures(gwId)
            : Promise.resolve(),
        ]);

        const allTeams = base[0];
        const poolIds = base[1];
        const used = base[2];
        const myHistory = base[3];
        const myPick = base[4];

        mergeTeams(allTeams);
        setPoolTeamIds(poolIds);
        setUsedIds(used);
        setPick(myPick);
        setSelectedTeamId(myPick?.team_id ?? null);
        if (myPick?.team) mergeTeams([myPick.team]);

        setHistoryPicks((prev) => {
          const others = prev.filter((h) => h.user_id !== userId);
          return [...others, ...myHistory];
        });
        historyLoadedUsersRef.current.add(userId);
        loadedRef.current.selection = true;
      } finally {
        setSelectionLoading(false);
      }
    },
    [competitionId, userId, ensurePickGwFixtures, mergeTeams]
  );

  const loadGameweeksSlice = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!competitionId) return;
      if (!opts?.force && loadedRef.current.gameweeks) return;
      setGameweeksLoading(true);
      try {
        const comp = competitionRef.current ?? (await lmsGetCompetition(competitionId));
        if (comp) competitionRef.current = comp;
        const season = comp?.season ?? '2026/27';
        const [gws, allFx, allTeams] = await Promise.all([
          lmsListCompetitionGameweeks(competitionId, comp),
          lmsListSeasonFixtures(season),
          loadedRef.current.selection && !opts?.force ? Promise.resolve(null) : lmsListTeams(),
        ]);
        setGameweeks(gws);
        setSeasonFixtures(allFx);
        setExcludeReasons((prev) => {
          const next = { ...prev };
          for (const f of allFx) {
            if (f.excluded_from_lms && f.excluded_reason && next[f.id] === undefined) {
              next[f.id] = f.excluded_reason;
            }
          }
          return next;
        });
        if (allTeams) mergeTeams(allTeams);
        setAdminGwId((prev) => prev ?? currentGwIdRef.current ?? gws[0]?.id ?? null);
        if (!loadedRef.current.selection) {
          // Admin pool needs team ids even if Selection was never opened.
          const poolIds = await lmsListCompetitionTeamIds(competitionId);
          setPoolTeamIds(poolIds);
        }
        loadedRef.current.gameweeks = true;
      } finally {
        setGameweeksLoading(false);
      }
    },
    [competitionId, mergeTeams]
  );

  const loadHistoryForUser = useCallback(
    async (targetUserId: string) => {
      if (!competitionId || historyLoadedUsersRef.current.has(targetUserId)) return;
      setHistoryLoadingUserId(targetUserId);
      try {
        const rows = await lmsListCompletedPicksForUser(
          competitionId,
          targetUserId,
          competitionRef.current
        );
        historyLoadedUsersRef.current.add(targetUserId);
        setHistoryPicks((prev) => {
          const others = prev.filter((h) => h.user_id !== targetUserId);
          return [...others, ...rows];
        });
      } finally {
        setHistoryLoadingUserId((prev) => (prev === targetUserId ? null : prev));
      }
    },
    [competitionId]
  );

  const loadShell = useCallback(async () => {
    if (!competitionId || !userId) return;
    const [comp, participant, parts, admin] = await Promise.all([
      lmsGetCompetition(competitionId),
      lmsGetMyParticipant(competitionId, userId),
      lmsListParticipants(competitionId),
      lmsIsProfileAdmin(userId),
    ]);
    competitionRef.current = comp;
    const gwInfo = await lmsGetCompetitionCurrentGameweek(competitionId, comp);
    const gw = gwInfo.gameweek;

    setName(comp?.name ?? 'Competition');
    setCompStatus(comp?.status ?? '');
    setStartGwNumber(gwInfo.startGameweekNumber);
    setMe(participant);
    setCurrentGw(gw);
    setLeaderboard(parts);
    setIsAdmin(admin);
    currentGwIdRef.current = gw?.id ?? null;

    // Reset dependent slices when shell reloads (focus / pull-to-refresh).
    loadedRef.current.leaderboardExtras = false;
    loadedRef.current.selection = false;
    loadedRef.current.gameweeks = false;
    loadedRef.current.pickGwFixtures = false;
    historyLoadedUsersRef.current = new Set();
    setHistoryPicks([]);
    setExpandedUserId(null);

    await loadLeaderboardExtras(gw, { force: true });
  }, [competitionId, userId, loadLeaderboardExtras]);

  const reloadVisible = useCallback(async () => {
    if (!competitionId || !userId) return;
    try {
      await loadShell();
      const t = tabRef.current;
      const tasks: Promise<unknown>[] = [];
      if (t === 'selection') tasks.push(loadSelectionSlice({ force: true }));
      if (t === 'gameweeks' || t === 'admin') tasks.push(loadGameweeksSlice({ force: true }));
      await Promise.all(tasks);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [competitionId, userId, loadShell, loadSelectionSlice, loadGameweeksSlice]);

  useFocusEffect(
    useCallback(() => {
      void reloadVisible();
    }, [reloadVisible])
  );

  useEffect(() => {
    if (tab === 'selection') void loadSelectionSlice().catch((e) => {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load selection');
    });
    if (tab === 'gameweeks' || tab === 'admin') {
      void loadGameweeksSlice().catch((e) => {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load fixtures');
      });
    }
  }, [tab, loadSelectionSlice, loadGameweeksSlice]);

  useEffect(() => {
    if (!expandedUserId) return;
    void loadHistoryForUser(expandedUserId).catch(() => {
      // Non-fatal: drawer shows empty until retry.
    });
  }, [expandedUserId, loadHistoryForUser]);

  const formByTeamId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof lmsTeamFormFromFixtures>>();
    for (const t of teams) {
      map.set(t.id, lmsTeamFormFromFixtures(seasonFixtures, t.id));
    }
    return map;
  }, [teams, seasonFixtures]);

  const filteredFixtures = useMemo(() => {
    return seasonFixtures.filter((f) => {
      if (filterGwId && f.gameweek_id !== filterGwId) return false;
      if (
        filterTeamId &&
        f.home_team_id !== filterTeamId &&
        f.away_team_id !== filterTeamId
      ) {
        return false;
      }
      // Team filter alone: upcoming/live only (helps pick planning)
      if (filterTeamId && !filterGwId && f.status === 'finished') return false;
      return true;
    });
  }, [seasonFixtures, filterGwId, filterTeamId]);

  const fixturesByGameweek = useMemo(() => {
    const groups: { gw: LmsGameweek | null; number: number; fixtures: LmsFixture[] }[] = [];
    const byNumber = new Map<number, LmsFixture[]>();
    for (const f of filteredFixtures) {
      const n = f.gameweek_number ?? 0;
      if (!byNumber.has(n)) byNumber.set(n, []);
      byNumber.get(n)!.push(f);
    }
    const numbers = [...byNumber.keys()].sort((a, b) => a - b);
    for (const n of numbers) {
      groups.push({
        number: n,
        gw: gameweeks.find((g) => g.number === n) ?? null,
        fixtures: byNumber.get(n) ?? [],
      });
    }
    return groups;
  }, [filteredFixtures, gameweeks]);

  const poolTeamIdSet = useMemo(() => new Set(poolTeamIds), [poolTeamIds]);

  const competitionTeams = useMemo(
    () => teams.filter((t) => poolTeamIdSet.has(t.id)),
    [teams, poolTeamIdSet]
  );

  /** Teams playing a non-excluded fixture this pick gameweek. */
  const playingTeamIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of pickGwFixtures) {
      if (f.excluded_from_lms) continue;
      ids.add(f.home_team_id);
      ids.add(f.away_team_id);
    }
    return ids;
  }, [pickGwFixtures]);

  /** Reasons why a pool team cannot be picked this GW (excluded fixture or no game). */
  const unavailableNoteByTeamId = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of pickGwFixtures) {
      if (!f.excluded_from_lms) continue;
      const note = f.excluded_reason?.trim() || 'No game this week';
      map.set(f.home_team_id, note);
      map.set(f.away_team_id, note);
    }
    for (const t of competitionTeams) {
      if (playingTeamIds.has(t.id) || map.has(t.id)) continue;
      const hasAnyFixture = pickGwFixtures.some(
        (f) => f.home_team_id === t.id || f.away_team_id === t.id
      );
      if (!hasAnyFixture) map.set(t.id, 'No game this week');
    }
    return map;
  }, [pickGwFixtures, competitionTeams, playingTeamIds]);

  const opponentByTeamId = useMemo(() => {
    const map = new Map<string, LmsTeam>();
    for (const f of pickGwFixtures) {
      if (f.away_team) map.set(f.home_team_id, f.away_team);
      if (f.home_team) map.set(f.away_team_id, f.home_team);
    }
    return map;
  }, [pickGwFixtures]);

  /** Unused competition-pool teams shown on Selection (pickable + greyed). */
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

  const poolTeams = useMemo(() => {
    const used = new Set(usedIds);
    return {
      available: competitionTeams.filter((t) => !used.has(t.id)),
      used: competitionTeams.filter((t) => used.has(t.id)),
    };
  }, [competitionTeams, usedIds]);

  const teamsAlphabetical = useMemo(
    () =>
      [...competitionTeams].sort((a, b) =>
        (a.short_name || a.name).localeCompare(b.short_name || b.name, undefined, {
          sensitivity: 'base',
        })
      ),
    [competitionTeams]
  );

  const adminFixtures = useMemo(() => {
    if (!adminGwId) return [];
    return seasonFixtures
      .filter((f) => f.gameweek_id === adminGwId)
      .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());
  }, [seasonFixtures, adminGwId]);

  const allTeamsAlphabetical = useMemo(
    () =>
      [...teams].sort((a, b) =>
        (a.short_name || a.name).localeCompare(b.short_name || b.name, undefined, {
          sensitivity: 'base',
        })
      ),
    [teams]
  );

  const usedTeamIdSet = useMemo(() => new Set(usedIds), [usedIds]);

  const picksRevealed = useMemo(() => {
    if (!pickGwFixtures.length) return false;
    const firstKo = Math.min(...pickGwFixtures.map((f) => new Date(f.kickoff_at).getTime()));
    return Number.isFinite(firstKo) && firstKo <= Date.now();
  }, [pickGwFixtures]);

  const pickByUserId = useMemo(() => {
    const map = new Map<string, LmsPick>();
    for (const p of gwPicks) map.set(p.user_id, p);
    return map;
  }, [gwPicks]);

  const historyByUserId = useMemo(() => {
    const map = new Map<string, typeof historyPicks>();
    for (const h of historyPicks) {
      const list = map.get(h.user_id) ?? [];
      list.push(h);
      map.set(h.user_id, list);
    }
    return map;
  }, [historyPicks]);

  const deadlinePassed = currentGw
    ? new Date(currentGw.deadline_at).getTime() <= Date.now()
    : true;
  const canPick =
    me?.status === 'active' && !!currentGw && !deadlinePassed && compStatus !== 'completed';

  const aliveCount = useMemo(
    () => leaderboard.filter((p) => p.status === 'active' || p.status === 'winner').length,
    [leaderboard]
  );

  const rankedStandings = useMemo(() => {
    const rank = (s: string) => {
      if (s === 'winner') return 0;
      if (s === 'active') return 1;
      return 2;
    };
    return [...leaderboard].sort((a, b) => {
      const d = rank(a.status) - rank(b.status);
      if (d !== 0) return d;
      return (a.username || a.user_id).localeCompare(b.username || b.user_id);
    });
  }, [leaderboard]);

  const currentPickTeam = useMemo(
    () => (pick ? teams.find((t) => t.id === pick.team_id) ?? null : null),
    [pick, teams]
  );

  const myPreviousSelections = useMemo(() => {
    const mine = (historyByUserId.get(userId ?? '') ?? []).map((h) => ({
      gameweek_number: h.gameweek_number,
      team: h.team,
      team_id: h.team_id,
    }));
    if (pick && currentGw && currentPickTeam) {
      const already = mine.some((m) => m.gameweek_number === currentGw.number);
      if (!already) {
        mine.push({
          gameweek_number: currentGw.number,
          team: currentPickTeam,
          team_id: currentPickTeam.id,
        });
      }
    }
    return mine.sort((a, b) => a.gameweek_number - b.gameweek_number);
  }, [historyByUserId, userId, pick, currentGw, currentPickTeam]);

  const onSavePick = async () => {
    if (!selectedTeamId || !currentGw || !userId) return;
    setSaving(true);
    try {
      const res = await lmsSubmitPick({
        competitionId,
        gameweekId: currentGw.id,
        teamId: selectedTeamId,
      });
      if (!res.success) {
        Alert.alert('Pick not saved', lmsPickErrorMessage(res.error));
        return;
      }

      const team =
        teams.find((t) => t.id === selectedTeamId) ??
        competitionTeams.find((t) => t.id === selectedTeamId) ??
        null;
      const nextPick: LmsPick = {
        id: pick?.id ?? `local-${selectedTeamId}`,
        competition_id: competitionId,
        user_id: userId,
        gameweek_id: currentGw.id,
        team_id: selectedTeamId,
        result: pick?.result ?? 'pending',
        team: team ?? undefined,
      };
      setPick(nextPick);
      setSelectedTeamId(selectedTeamId);
      setUsedIds((prev) => {
        const withoutOld = pick?.team_id ? prev.filter((id) => id !== pick.team_id) : prev;
        return withoutOld.includes(selectedTeamId)
          ? withoutOld
          : [...withoutOld, selectedTeamId];
      });
      setGwPicks((prev) => {
        const others = prev.filter((p) => p.user_id !== userId);
        return [...others, nextPick];
      });

      Alert.alert('Saved', 'Your gameweek pick is locked in until the deadline.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save pick');
    } finally {
      setSaving(false);
    }
  };

  const confirmDestructive = (
    title: string,
    message: string,
    confirmLabel: string,
    onConfirm: () => void
  ) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
  };

  const onTogglePoolTeam = (team: LmsTeam, enabled: boolean) => {
    const apply = async () => {
      setAdminBusy(true);
      try {
        const res = await lmsAdminSetCompetitionTeam(competitionId, team.id, enabled);
        if (!res.success) {
          Alert.alert('Could not update pool', res.error ?? 'Unknown error');
          return;
        }
        await reloadVisible();
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Could not update team pool');
      } finally {
        setAdminBusy(false);
      }
    };

    if (!enabled) {
      confirmDestructive(
        'Remove from pool?',
        `${team.name} will leave this competition’s team pool. Pending picks using that club will be cleared.`,
        'Remove',
        () => void apply()
      );
      return;
    }
    void apply();
  };

  const applyFixtureExclude = async (fixture: LmsFixture, excluded: boolean, reason?: string) => {
    setAdminBusy(true);
    try {
      const res = await lmsAdminSetFixtureExcluded(
        fixture.id,
        excluded,
        excluded ? reason ?? excludeReasons[fixture.id] ?? null : null
      );
      if (!res.success) {
        Alert.alert('Could not update fixture', res.error ?? 'Unknown error');
        return;
      }
      await reloadVisible();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update fixture');
    } finally {
      setAdminBusy(false);
    }
  };

  const onToggleFixtureExcluded = (fixture: LmsFixture) => {
    if (fixture.excluded_from_lms) {
      confirmDestructive(
        'Restore fixture?',
        'Players will be able to pick either side for this gameweek again.',
        'Restore',
        () => void applyFixtureExclude(fixture, false)
      );
      return;
    }

    const reason =
      Platform.OS === 'ios'
        ? excludeReasons[fixture.id] ?? fixture.excluded_reason ?? ''
        : (excludeReasons[fixture.id] ?? '').trim();

    const runExclude = (finalReason: string) => {
      confirmDestructive(
        'Exclude fixture?',
        'Neither side can be picked in any LMS competition for this gameweek. Pending picks on these teams will be cleared.',
        'Exclude',
        () => void applyFixtureExclude(fixture, true, finalReason)
      );
    };

    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Exclude fixture',
        'Optional reason (shown on Selection), e.g. Postponed',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: (value?: string) => {
              const next = (value ?? '').trim();
              if (next) {
                setExcludeReasons((prev) => ({ ...prev, [fixture.id]: next }));
              }
              runExclude(next);
            },
          },
        ],
        'plain-text',
        reason
      );
      return;
    }

    runExclude(reason);
  };

  const onDeleteCompetition = () => {
    confirmDestructive(
      'Delete competition?',
      `“${name}” will be permanently deleted, including all players, picks, and access codes. This cannot be undone.`,
      'Delete',
      () => {
        void (async () => {
          setAdminBusy(true);
          try {
            const res = await lmsAdminDeleteCompetition(competitionId);
            if (!res.success) {
              Alert.alert('Could not delete', res.error ?? 'Unknown error');
              return;
            }
            router.replace('/(lms)');
          } catch (e) {
            Alert.alert(
              'Error',
              e instanceof Error ? e.message : 'Could not delete competition'
            );
          } finally {
            setAdminBusy(false);
          }
        })();
      }
    );
  };

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

  const statusLabel = (s: string) => {
    if (s === 'active') return 'Still standing';
    if (s === 'winner') return 'Champion';
    if (s === 'eliminated') return 'Eliminated';
    return s;
  };

  const statusColor = (s: string) => {
    if (s === 'active' || s === 'winner') return theme.colors.accent;
    if (s === 'eliminated') return theme.colors.error;
    return theme.colors.textMuted;
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        },
        titleBlock: { flex: 1 },
        title: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 20,
          color: theme.colors.text,
        },
        sub: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textSecondary,
          marginTop: 2,
          textTransform: 'capitalize',
        },
        survivalBanner: {
          marginHorizontal: theme.spacing.lg,
          marginBottom: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
        },
        survivalLeft: { flex: 1, gap: 4 },
        survivalStatus: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 16,
        },
        survivalMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        survivalStat: { alignItems: 'flex-end' },
        survivalStatValue: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 22,
          color: theme.colors.text,
        },
        survivalStatLabel: {
          fontFamily: theme.fontFamily.baiExtraLight,
          fontSize: 11,
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        },
        tabs: {
          flexDirection: 'row',
          marginHorizontal: theme.spacing.lg,
          marginBottom: theme.spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        tab: {
          flex: 1,
          paddingVertical: 12,
          alignItems: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        tabActive: {
          borderBottomColor: theme.colors.accent,
        },
        tabText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: isAdmin ? 12 : 13,
          color: theme.colors.textMuted,
        },
        tabTextActive: {
          color: theme.colors.accent,
        },
        content: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.lg,
        },
        sectionIntro: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textSecondary,
          lineHeight: 18,
        },
        filterLabel: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 11,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.colors.textMuted,
          marginBottom: 6,
        },
        filterScroll: {
          marginHorizontal: -theme.spacing.lg,
        },
        filterRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: 2,
        },
        filterChip: {
          paddingVertical: 7,
          paddingHorizontal: 12,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        filterChipActive: {
          backgroundColor: theme.colors.accentMuted,
          borderColor: theme.colors.accent,
        },
        filterChipText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.textSecondary,
        },
        filterChipTextActive: {
          color: theme.colors.accent,
        },
        gwHeader: {
          gap: 2,
          marginTop: theme.spacing.sm,
          marginBottom: 4,
        },
        gwTitle: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 16,
          color: theme.colors.text,
        },
        gwMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        fixtureList: { gap: 0 },
        fixtureRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          gap: 8,
        },
        fixtureTeam: {
          flex: 1,
          gap: 4,
        },
        fixtureTeamAway: {
          alignItems: 'flex-end',
        },
        fixtureTeamMain: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        fixtureTeamMainAway: {
          flexDirection: 'row-reverse',
        },
        fixtureName: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
          color: theme.colors.text,
          flexShrink: 1,
        },
        fixtureNameAway: {
          textAlign: 'right',
        },
        scoreBox: {
          minWidth: 52,
          alignItems: 'center',
          paddingHorizontal: 6,
        },
        scoreText: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 15,
          color: theme.colors.text,
        },
        vsText: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        kickoffUnder: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
          marginTop: 2,
        },
        pickBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.accentMuted,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.accent,
        },
        pickBannerTitle: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 11,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.colors.accent,
        },
        pickBannerName: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 16,
          color: theme.colors.text,
          marginTop: 2,
        },
        muted: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
          lineHeight: 18,
        },
        teamGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        teamTile: {
          width: '48%',
          flexGrow: 1,
          flexBasis: '46%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1.5,
          borderColor: theme.colors.border,
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
          flexShrink: 1,
          gap: 2,
        },
        teamTileName: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
          color: theme.colors.text,
          flexShrink: 1,
        },
        teamTileNameSelected: { fontFamily: theme.fontFamily.baiSemiBold, color: theme.colors.accent },
        teamTileVs: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textSecondary,
        },
        teamTileVsSelected: {
          color: theme.colors.accentDim,
        },
        primaryBtn: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: 14,
          alignItems: 'center',
        },
        primaryBtnDisabled: {
          opacity: 0.45,
        },
        primaryBtnText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          color: theme.colors.white,
          fontSize: 15,
        },
        filterChipUsed: {
          opacity: 0.75,
          backgroundColor: theme.colors.surfaceElevated,
          borderColor: theme.colors.statusAccent,
          borderWidth: 1.5,
        },
        filterChipTextUsed: {
          color: theme.colors.textMuted,
          textDecorationLine: 'line-through',
        },
        prevWrap: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        prevChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        prevGw: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 10,
          color: theme.colors.textMuted,
        },
        poolTitle: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 11,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          color: theme.colors.textMuted,
          marginBottom: 8,
        },
        usedRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 6,
          opacity: 0.55,
        },
        usedName: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
          textDecorationLine: 'line-through',
        },
        lbRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 12,
        },
        lbBlock: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        lbRank: {
          width: 28,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 14,
          color: theme.colors.textMuted,
        },
        lbBody: { flex: 1 },
        lbNameRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        lbName: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 15,
          color: theme.colors.text,
          flexShrink: 1,
        },
        lbYou: {
          color: theme.colors.accent,
        },
        lbDrawer: {
          paddingLeft: 38,
          paddingBottom: 12,
          gap: 6,
        },
        lbDrawerEmpty: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        lbHistoryRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        lbHistoryGw: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          color: theme.colors.textMuted,
          width: 36,
        },
        lbHistoryName: {
          fontFamily: theme.fontFamily.bai,
          fontSize: 13,
          color: theme.colors.textSecondary,
          flex: 1,
          flexShrink: 1,
        },
        lbHistoryResult: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 11,
          textTransform: 'uppercase',
        },
        lbPick: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          maxWidth: '36%',
        },
        lbPickName: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.textSecondary,
          flexShrink: 1,
        },
        lbPickHidden: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
          fontStyle: 'italic',
        },
        fixtureExcludedNote: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          color: theme.colors.textMuted,
          textAlign: 'center',
          marginTop: 4,
          fontStyle: 'italic',
        },
        teamTileNote: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 10,
          color: theme.colors.textMuted,
          marginTop: 2,
        },
        adminRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        adminRowBody: { flex: 1, gap: 2 },
        adminRowTitle: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 14,
          color: theme.colors.text,
        },
        adminRowMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        adminToggle: {
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
        },
        adminToggleOn: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        adminToggleOff: {
          opacity: 0.85,
        },
        adminToggleText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 11,
          color: theme.colors.textSecondary,
        },
        adminToggleTextOn: {
          color: theme.colors.accent,
        },
        adminReasonInput: {
          marginTop: 6,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
          paddingHorizontal: 10,
          paddingVertical: 8,
          fontFamily: theme.fontFamily.bai,
          fontSize: 13,
          color: theme.colors.text,
          backgroundColor: theme.colors.surface,
        },
        adminSubTabs: {
          flexDirection: 'row',
          gap: 8,
        },
        adminSubTab: {
          flex: 1,
          paddingVertical: 10,
          paddingHorizontal: 8,
          alignItems: 'center',
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        adminSubTabActive: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        adminSubTabText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 12,
          color: theme.colors.textMuted,
          textAlign: 'center',
        },
        adminSubTabTextActive: {
          color: theme.colors.accent,
        },
        dangerZone: {
          marginTop: theme.spacing.md,
          paddingTop: theme.spacing.lg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          gap: theme.spacing.sm,
        },
        dangerBtn: {
          borderRadius: theme.radius.md,
          paddingVertical: 14,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: theme.colors.error,
          backgroundColor: 'transparent',
        },
        dangerBtnDisabled: {
          opacity: 0.45,
        },
        dangerBtnText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 14,
          color: theme.colors.error,
        },
        lbStatus: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          minWidth: 48,
          textAlign: 'right',
        },
      }),
    [theme, insets.top, insets.bottom, isAdmin]
  );

  const renderFixtureRow = (f: LmsFixture, i: number, list: LmsFixture[]) => {
    const finished = f.status === 'finished';
    const excluded = !!f.excluded_from_lms;
    const homeForm = formByTeamId.get(f.home_team_id) ?? [null, null, null, null, null];
    const awayForm = formByTeamId.get(f.away_team_id) ?? [null, null, null, null, null];
    return (
      <View
        key={f.id}
        style={[
          styles.fixtureRow,
          i === list.length - 1 && { borderBottomWidth: 0 },
          excluded && { opacity: 0.55 },
        ]}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.fixtureTeam}>
              <View style={styles.fixtureTeamMain}>
                <TeamCrest uri={f.home_team?.crest_url} label={f.home_team?.name} size={24} />
                <Text style={styles.fixtureName} numberOfLines={1}>
                  {f.home_team?.short_name ?? f.home_team?.name ?? 'H'}
                </Text>
              </View>
              <TeamFormDots results={homeForm} />
            </View>
            <View style={styles.scoreBox}>
              {finished ? (
                <Text style={styles.scoreText}>
                  {f.home_goals ?? 0}–{f.away_goals ?? 0}
                </Text>
              ) : (
                <>
                  <Text style={styles.vsText}>vs</Text>
                  <Text style={styles.kickoffUnder}>
                    {new Date(f.kickoff_at).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </>
              )}
            </View>
            <View style={[styles.fixtureTeam, styles.fixtureTeamAway]}>
              <View style={[styles.fixtureTeamMain, styles.fixtureTeamMainAway]}>
                <TeamCrest uri={f.away_team?.crest_url} label={f.away_team?.name} size={24} />
                <Text style={[styles.fixtureName, styles.fixtureNameAway]} numberOfLines={1}>
                  {f.away_team?.short_name ?? f.away_team?.name ?? 'A'}
                </Text>
              </View>
              <TeamFormDots results={awayForm} />
            </View>
          </View>
          {excluded ? (
            <Text style={styles.fixtureExcludedNote}>
              {f.excluded_reason?.trim() || 'Excluded from LMS'}
            </Text>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.sub}>Last Man Standing · {compStatus || '—'}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.accent} />
      ) : (
        <>
          <View style={styles.survivalBanner}>
            <View style={styles.survivalLeft}>
              <Text
                style={[
                  styles.survivalStatus,
                  { color: statusColor(me?.status ?? 'eliminated') },
                ]}
              >
                {statusLabel(me?.status ?? '—')}
              </Text>
              <Text style={styles.survivalMeta}>
                {currentGw
                  ? `Gameweek ${currentGw.number}${deadlinePassed ? ' · picks closed' : ' · picks open'}`
                  : startGwNumber != null
                    ? `Starts GW${startGwNumber}`
                    : 'Waiting for gameweek'}
              </Text>
            </View>
            <View style={styles.survivalStat}>
              <Text style={styles.survivalStatValue}>{aliveCount}</Text>
              <Text style={styles.survivalStatLabel}>Alive</Text>
            </View>
          </View>

          <View style={styles.tabs}>
            {(
              [
                { key: 'gameweeks' as const, label: 'Gameweeks' },
                { key: 'selection' as const, label: 'Selection' },
                { key: 'leaderboard' as const, label: 'Leaderboard' },
                ...(isAdmin ? [{ key: 'admin' as const, label: 'Admin' }] : []),
              ] as { key: TabKey; label: string }[]
            ).map((t) => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => setTab(t.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void reloadVisible();
                }}
                tintColor={theme.colors.accent}
              />
            }
          >
            {tab === 'gameweeks' ? (
              gameweeksLoading && !seasonFixtures.length ? (
                <ActivityIndicator style={{ marginTop: 24 }} color={theme.colors.accent} />
              ) : (
              <>
                <Text style={styles.sectionIntro}>
                  Fixtures grouped by gameweek. Filter by week or team to plan your pick. Form dots
                  under each club show their last five results (green / grey / red).
                </Text>

                <View>
                  <Text style={styles.filterLabel}>Gameweek</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterScroll}
                    contentContainerStyle={styles.filterRow}
                    nestedScrollEnabled
                  >
                    <Pressable
                      style={[styles.filterChip, !filterGwId && styles.filterChipActive]}
                      onPress={() => setFilterGwId(null)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          !filterGwId && styles.filterChipTextActive,
                        ]}
                      >
                        All
                      </Text>
                    </Pressable>
                    {gameweeks.map((g) => {
                      const active = filterGwId === g.id;
                      return (
                        <Pressable
                          key={g.id}
                          style={[styles.filterChip, active && styles.filterChipActive]}
                          onPress={() => setFilterGwId(active ? null : g.id)}
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              active && styles.filterChipTextActive,
                            ]}
                          >
                            GW{g.number}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View>
                  <Text style={styles.filterLabel}>Team</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterScroll}
                    contentContainerStyle={styles.filterRow}
                    nestedScrollEnabled
                  >
                    <Pressable
                      style={[styles.filterChip, !filterTeamId && styles.filterChipActive]}
                      onPress={() => setFilterTeamId(null)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          !filterTeamId && styles.filterChipTextActive,
                        ]}
                      >
                        All
                      </Text>
                    </Pressable>
                    {teamsAlphabetical.map((t) => {
                      const active = filterTeamId === t.id;
                      const used = usedTeamIdSet.has(t.id);
                      return (
                        <Pressable
                          key={t.id}
                          style={[
                            styles.filterChip,
                            active && styles.filterChipActive,
                            used && styles.filterChipUsed,
                          ]}
                          onPress={() => setFilterTeamId(active ? null : t.id)}
                          accessibilityState={{ selected: active, disabled: false }}
                          accessibilityLabel={
                            used
                              ? `${t.short_name || t.name} already used`
                              : t.short_name || t.name
                          }
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              active && styles.filterChipTextActive,
                              used && styles.filterChipTextUsed,
                            ]}
                          >
                            {t.short_name || t.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {fixturesByGameweek.length === 0 ? (
                  <Text style={styles.muted}>No fixtures match these filters.</Text>
                ) : (
                  fixturesByGameweek.map((group) => (
                    <View key={group.number}>
                      <View style={styles.gwHeader}>
                        <Text style={styles.gwTitle}>Gameweek {group.number}</Text>
                        <Text style={styles.gwMeta}>
                          {group.gw?.status === 'complete'
                            ? 'Results final'
                            : group.gw?.status === 'live'
                              ? 'In play'
                              : group.gw
                                ? `From ${formatKickoff(group.gw.starts_at)}`
                                : `${group.fixtures.length} fixture${group.fixtures.length === 1 ? '' : 's'}`}
                        </Text>
                      </View>
                      <View style={styles.fixtureList}>
                        {group.fixtures.map((f, i) =>
                          renderFixtureRow(f, i, group.fixtures)
                        )}
                      </View>
                    </View>
                  ))
                )}
              </>
              )
            ) : null}

            {tab === 'selection' ? (
              selectionLoading && poolTeamIds.length === 0 ? (
                <ActivityIndicator style={{ marginTop: 24 }} color={theme.colors.accent} />
              ) : (
              <>
                <Text style={styles.sectionIntro}>
                  Pick one unused team that must win this gameweek. Draws eliminate you. Each club
                  can only be used once. Deadline is 20 minutes before the first kick-off — if you
                  miss it, the next unused team alphabetically is assigned for you.
                </Text>

                <View>
                  <Text style={styles.poolTitle}>Previous selected teams</Text>
                  {myPreviousSelections.length === 0 ? (
                    <Text style={styles.muted}>No teams selected yet.</Text>
                  ) : (
                    <View style={styles.prevWrap}>
                      {myPreviousSelections.map((s) => (
                        <View key={`${s.gameweek_number}-${s.team_id}`} style={styles.prevChip}>
                          <Text style={styles.prevGw}>GW{s.gameweek_number}</Text>
                          <TeamCrest
                            uri={s.team?.crest_url}
                            label={s.team?.name}
                            size={18}
                          />
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {currentPickTeam ? (
                  <View style={styles.pickBanner}>
                    <TeamCrest
                      uri={currentPickTeam.crest_url}
                      label={currentPickTeam.name}
                      size={40}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickBannerTitle}>
                        {canPick ? 'Your current pick' : 'Locked pick'}
                      </Text>
                      <Text style={styles.pickBannerName}>{currentPickTeam.name}</Text>
                    </View>
                  </View>
                ) : null}

                {me?.status !== 'active' ? (
                  <Text style={styles.muted}>
                    {me?.status === 'winner'
                      ? 'You won this competition. Check the Leaderboard for the final table.'
                      : 'You are eliminated and cannot make further picks.'}
                  </Text>
                ) : !currentGw ? (
                  <Text style={styles.muted}>
                    {startGwNumber != null
                      ? `This competition starts at GW${startGwNumber}. Selection opens then.`
                      : 'No open gameweek for picks yet.'}
                  </Text>
                ) : !canPick ? (
                  <Text style={styles.muted}>
                    {pick
                      ? 'Picks are locked for this gameweek. Come back after settlement for the next round.'
                      : 'Picks are closed for this gameweek.'}
                  </Text>
                ) : selectionTeams.length === 0 ? (
                  <Text style={styles.muted}>
                    No unused teams left in this competition’s pool for this gameweek.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.poolTitle}>
                      Choose a winner · GW{currentGw.number}
                    </Text>
                    <View style={styles.teamGrid}>
                      {selectionTeams.map((t) => {
                        const selected = selectedTeamId === t.id;
                        const pickable = playingTeamIds.has(t.id);
                        const note = unavailableNoteByTeamId.get(t.id);
                        const opponent = opponentByTeamId.get(t.id);
                        const opponentLabel =
                          opponent?.short_name || opponent?.name || null;
                        return (
                          <Pressable
                            key={t.id}
                            style={[
                              styles.teamTile,
                              selected && pickable && styles.teamTileSelected,
                              !pickable && styles.teamTileDisabled,
                            ]}
                            onPress={() => {
                              if (!pickable) return;
                              setSelectedTeamId(t.id);
                            }}
                            disabled={!pickable}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !pickable, selected }}
                            accessibilityLabel={
                              !pickable
                                ? `${t.name} unavailable: ${note ?? 'No game'}`
                                : opponentLabel
                                  ? `Select ${t.name} versus ${opponentLabel}`
                                  : `Select ${t.name}`
                            }
                          >
                            <TeamCrest uri={t.crest_url} label={t.name} size={28} />
                            <View style={styles.teamTileTextCol}>
                              <Text
                                style={[
                                  styles.teamTileName,
                                  selected && pickable && styles.teamTileNameSelected,
                                ]}
                                numberOfLines={2}
                              >
                                {t.name}
                              </Text>
                              {opponentLabel ? (
                                <Text
                                  style={[
                                    styles.teamTileVs,
                                    selected && pickable && styles.teamTileVsSelected,
                                  ]}
                                  numberOfLines={1}
                                >
                                  vs {opponentLabel}
                                </Text>
                              ) : null}
                              {!pickable && note ? (
                                <Text style={styles.teamTileNote} numberOfLines={2}>
                                  {note}
                                </Text>
                              ) : null}
                            </View>
                            {selected && pickable ? (
                              <Ionicons
                                name="checkmark-circle"
                                size={18}
                                color={theme.colors.accent}
                              />
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                    {remainingTeams.length === 0 ? (
                      <Text style={styles.muted}>
                        Every remaining pool team is unavailable this gameweek (excluded fixture or
                        no game).
                      </Text>
                    ) : (
                      <Pressable
                        style={[
                          styles.primaryBtn,
                          (!selectedTeamId ||
                            saving ||
                            !playingTeamIds.has(selectedTeamId)) &&
                            styles.primaryBtnDisabled,
                        ]}
                        disabled={
                          !selectedTeamId ||
                          saving ||
                          !playingTeamIds.has(selectedTeamId)
                        }
                        onPress={() => void onSavePick()}
                      >
                        {saving ? (
                          <ActivityIndicator color={theme.colors.white} />
                        ) : (
                          <Text style={styles.primaryBtnText}>
                            {pick ? 'Update pick' : 'Lock in pick'}
                          </Text>
                        )}
                      </Pressable>
                    )}
                  </>
                )}

                {poolTeams.available.length > 0 && !canPick ? (
                  <View>
                    <Text style={styles.poolTitle}>Still in your pool</Text>
                    <View style={styles.teamGrid}>
                      {poolTeams.available.map((t) => (
                        <View key={t.id} style={[styles.teamTile, styles.teamTileDisabled]}>
                          <TeamCrest uri={t.crest_url} label={t.name} size={28} />
                          <Text style={styles.teamTileName} numberOfLines={2}>
                            {t.name}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
              )
            ) : null}

            {tab === 'leaderboard' ? (
              <>
                <Text style={styles.sectionIntro}>
                  Last player standing wins. Tap a player to see teams they used in completed
                  gameweeks.
                  {currentGw
                    ? picksRevealed
                      ? ` Showing GW${currentGw.number} picks.`
                      : ` Picks for GW${currentGw.number} stay hidden until the first match kicks off.`
                    : ''}
                </Text>
                {rankedStandings.length === 0 ? (
                  <Text style={styles.muted}>No players in this competition yet.</Text>
                ) : (
                  rankedStandings.map((p, i) => {
                    const isYou = p.user_id === userId;
                    const userPick = pickByUserId.get(p.user_id);
                    const expanded = expandedUserId === p.user_id;
                    const history = historyByUserId.get(p.user_id) ?? [];
                    return (
                      <View key={p.id} style={styles.lbBlock}>
                        <Pressable
                          style={styles.lbRow}
                          onPress={() =>
                            setExpandedUserId((prev) => (prev === p.user_id ? null : p.user_id))
                          }
                          accessibilityRole="button"
                          accessibilityState={{ expanded }}
                          accessibilityLabel={`${p.username || 'Player'} history`}
                        >
                          <Text style={styles.lbRank}>{i + 1}</Text>
                          <View style={styles.lbBody}>
                            <View style={styles.lbNameRow}>
                              <Text style={[styles.lbName, isYou && styles.lbYou]} numberOfLines={1}>
                                {p.username || p.user_id.slice(0, 8)}
                                {isYou ? ' (you)' : ''}
                              </Text>
                              <Ionicons
                                name={expanded ? 'chevron-up' : 'chevron-down'}
                                size={14}
                                color={theme.colors.textMuted}
                              />
                            </View>
                          </View>
                          {currentGw ? (
                            picksRevealed && userPick?.team ? (
                              <View style={styles.lbPick}>
                                <TeamCrest
                                  uri={userPick.team.crest_url}
                                  label={userPick.team.name}
                                  size={22}
                                />
                                <Text style={styles.lbPickName} numberOfLines={1}>
                                  {userPick.team.short_name || userPick.team.name}
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.lbPickHidden}>
                                {picksRevealed ? 'No pick' : 'Hidden'}
                              </Text>
                            )
                          ) : null}
                          <Text style={[styles.lbStatus, { color: statusColor(p.status) }]}>
                            {p.status === 'active'
                              ? 'Alive'
                              : p.status === 'winner'
                                ? 'Winner'
                                : 'Out'}
                          </Text>
                        </Pressable>
                        {expanded ? (
                          <View style={styles.lbDrawer}>
                            {historyLoadingUserId === p.user_id ? (
                              <ActivityIndicator color={theme.colors.accent} />
                            ) : history.length === 0 ? (
                              <Text style={styles.lbDrawerEmpty}>
                                No completed gameweek picks yet.
                              </Text>
                            ) : (
                              history.map((h) => (
                                <View key={`${h.gameweek_id}-${h.team_id}`} style={styles.lbHistoryRow}>
                                  <Text style={styles.lbHistoryGw}>GW{h.gameweek_number}</Text>
                                  <TeamCrest
                                    uri={h.team?.crest_url}
                                    label={h.team?.name}
                                    size={20}
                                  />
                                  <Text style={styles.lbHistoryName} numberOfLines={1}>
                                    {h.team?.name ?? 'Unknown team'}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.lbHistoryResult,
                                      {
                                        color:
                                          h.result === 'correct'
                                            ? theme.colors.accent
                                            : h.result === 'incorrect'
                                              ? theme.colors.error
                                              : theme.colors.textMuted,
                                      },
                                    ]}
                                  >
                                    {h.result === 'correct'
                                      ? 'Won'
                                      : h.result === 'incorrect'
                                        ? 'Out'
                                        : h.result}
                                  </Text>
                                </View>
                              ))
                            )}
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </>
            ) : null}

            {tab === 'admin' && isAdmin ? (
              <>
                <View style={styles.adminSubTabs}>
                  {(
                    [
                      { key: 'pool' as const, label: 'Team pool' },
                      { key: 'exclusions' as const, label: 'Fixture exclusions' },
                    ] as const
                  ).map((t) => {
                    const active = adminSubTab === t.key;
                    return (
                      <Pressable
                        key={t.key}
                        style={[styles.adminSubTab, active && styles.adminSubTabActive]}
                        onPress={() => setAdminSubTab(t.key)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          style={[
                            styles.adminSubTabText,
                            active && styles.adminSubTabTextActive,
                          ]}
                        >
                          {t.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {adminSubTab === 'pool' ? (
                  <>
                    <Text style={styles.sectionIntro}>
                      Choose which clubs are eligible in this competition. Late-start or small
                      leagues can run with a reduced pool.
                    </Text>
                    <Text style={styles.poolTitle}>
                      Team pool · {poolTeamIds.length}/{teams.length} enabled
                    </Text>
                    {allTeamsAlphabetical.map((t) => {
                      const enabled = poolTeamIdSet.has(t.id);
                      return (
                        <View key={t.id} style={styles.adminRow}>
                          <TeamCrest uri={t.crest_url} label={t.name} size={24} />
                          <View style={styles.adminRowBody}>
                            <Text style={styles.adminRowTitle}>{t.name}</Text>
                            <Text style={styles.adminRowMeta}>
                              {enabled ? 'In pool' : 'Not in this competition'}
                            </Text>
                          </View>
                          <Pressable
                            style={[
                              styles.adminToggle,
                              enabled ? styles.adminToggleOn : styles.adminToggleOff,
                            ]}
                            disabled={adminBusy}
                            onPress={() => onTogglePoolTeam(t, !enabled)}
                            accessibilityRole="switch"
                            accessibilityState={{ checked: enabled, disabled: adminBusy }}
                          >
                            <Text
                              style={[
                                styles.adminToggleText,
                                enabled && styles.adminToggleTextOn,
                              ]}
                            >
                              {enabled ? 'In pool' : 'Add'}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </>
                ) : (
                  <>
                    <Text style={styles.sectionIntro}>
                      Exclude postponed or unavailable fixtures from LMS picks. This applies to
                      every competition using the shared calendar.
                    </Text>
                    <Text style={styles.poolTitle}>Fixture exclusions</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.filterScroll}
                      contentContainerStyle={styles.filterRow}
                      nestedScrollEnabled
                    >
                      {gameweeks.map((g) => {
                        const active = adminGwId === g.id;
                        return (
                          <Pressable
                            key={g.id}
                            style={[styles.filterChip, active && styles.filterChipActive]}
                            onPress={() => setAdminGwId(g.id)}
                          >
                            <Text
                              style={[
                                styles.filterChipText,
                                active && styles.filterChipTextActive,
                              ]}
                            >
                              GW{g.number}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    {adminFixtures.length === 0 ? (
                      <Text style={styles.muted}>No fixtures for this gameweek.</Text>
                    ) : (
                      adminFixtures.map((f) => {
                        const excluded = !!f.excluded_from_lms;
                        const home = f.home_team?.short_name ?? f.home_team?.name ?? 'Home';
                        const away = f.away_team?.short_name ?? f.away_team?.name ?? 'Away';
                        return (
                          <View key={f.id} style={styles.adminRow}>
                            <View style={styles.adminRowBody}>
                              <Text style={styles.adminRowTitle}>
                                {home} vs {away}
                              </Text>
                              <Text style={styles.adminRowMeta}>
                                {formatKickoff(f.kickoff_at)}
                                {excluded
                                  ? ` · ${f.excluded_reason?.trim() || 'Excluded'}`
                                  : ''}
                              </Text>
                              {Platform.OS !== 'ios' && !excluded ? (
                                <TextInput
                                  style={styles.adminReasonInput}
                                  placeholder="Reason (optional)"
                                  placeholderTextColor={theme.colors.textMuted}
                                  value={excludeReasons[f.id] ?? ''}
                                  onChangeText={(text) =>
                                    setExcludeReasons((prev) => ({ ...prev, [f.id]: text }))
                                  }
                                />
                              ) : null}
                            </View>
                            <Pressable
                              style={[
                                styles.adminToggle,
                                excluded ? styles.adminToggleOn : styles.adminToggleOff,
                              ]}
                              disabled={adminBusy}
                              onPress={() => onToggleFixtureExcluded(f)}
                              accessibilityRole="switch"
                              accessibilityState={{ checked: excluded, disabled: adminBusy }}
                            >
                              <Text
                                style={[
                                  styles.adminToggleText,
                                  excluded && styles.adminToggleTextOn,
                                ]}
                              >
                                {excluded ? 'Restore' : 'Exclude'}
                              </Text>
                            </Pressable>
                          </View>
                        );
                      })
                    )}
                  </>
                )}

                <View style={styles.dangerZone}>
                  <Text style={styles.poolTitle}>Danger zone</Text>
                  <Text style={styles.muted}>
                    Permanently delete this competition and all related picks, players, and codes.
                  </Text>
                  <Pressable
                    style={[styles.dangerBtn, adminBusy && styles.dangerBtnDisabled]}
                    disabled={adminBusy}
                    onPress={onDeleteCompetition}
                    accessibilityRole="button"
                    accessibilityLabel="Delete competition"
                  >
                    {adminBusy ? (
                      <ActivityIndicator color={theme.colors.error} />
                    ) : (
                      <Text style={styles.dangerBtnText}>Delete competition</Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : null}

            <LmsTrademarkDisclaimer />
          </ScrollView>
        </>
      )}
    </View>
  );
}
