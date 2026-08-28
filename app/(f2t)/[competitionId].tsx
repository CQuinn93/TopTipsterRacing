import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Modal,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { PlayerProgressGrid } from '@/components/f2t/PlayerProgressGrid';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import {
  f2tApproveJoin,
  f2tGetCompetition,
  f2tListPendingForCompetition,
  f2tListSelectablePlayers,
  f2tRejectJoin,
  f2tSubmitSelections,
  f2tUseSubstitution,
  type F2tSelectablePlayer,
  type F2tSelectionRow,
} from '@/lib/f2t/api';
import {
  f2tSessionGetPlayers,
  f2tSessionInvalidatePlayers,
  f2tSessionSetPlayers,
} from '@/lib/f2t/sessionCache';

type TabKey = 'progress' | 'picker' | 'leaderboard' | 'admin';
type PositionFilter = 'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD';
type SortKey = 'name' | 'goals' | 'assists' | 'form' | 'xg';

const POSITION_FILTERS: PositionFilter[] = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'form', label: 'Form' },
  { key: 'xg', label: 'xG' },
];

function numStat(stats: Record<string, unknown> | undefined, ...keys: string[]): number | null {
  if (!stats) return null;
  for (const k of keys) {
    const v = stats[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function playerStatValue(p: F2tSelectablePlayer, key: SortKey): number {
  const stats = p.picker_stats;
  switch (key) {
    case 'goals':
      return numStat(stats, 'season_goals', 'goals_scored') ?? -1;
    case 'assists':
      return numStat(stats, 'season_assists', 'assists') ?? -1;
    case 'form':
      return numStat(stats, 'form') ?? -1;
    case 'xg':
      return numStat(stats, 'expected_goals') ?? -1;
    default:
      return 0;
  }
}

export default function F2tCompetitionScreen() {
  const theme = useTheme();
  const { openSidebar } = useSidebar();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ competitionId: string }>();
  const competitionId = String(params.competitionId ?? '');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('progress');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [startGw, setStartGw] = useState<number | null>(null);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const [selections, setSelections] = useState<F2tSelectionRow[]>([]);
  const [scoredCount, setScoredCount] = useState(0);
  const [selectionCount, setSelectionCount] = useState(0);
  const [selectionsLocked, setSelectionsLocked] = useState(false);
  const [subEligible, setSubEligible] = useState(false);
  const [regularSubUsed, setRegularSubUsed] = useState(false);
  const [leaderboard, setLeaderboard] = useState<
    Array<{
      user_id: string;
      username: string | null;
      status: string;
      scored_count: number;
      completed_at: string | null;
    }>
  >([]);
  const [canManage, setCanManage] = useState(false);
  const [canHandleJoins, setCanHandleJoins] = useState(false);
  const [pending, setPending] = useState<
    Array<{ id: string; user_id: string; username: string | null; created_at: string }>
  >([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [players, setPlayers] = useState<F2tSelectablePlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('ALL');
  const [teamFilterId, setTeamFilterId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('goals');
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [subMode, setSubMode] = useState(false);
  const [subOutId, setSubOutId] = useState<string | null>(null);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!competitionId) return;
    try {
      const data = await f2tGetCompetition(competitionId);
      if (!data.success || !data.competition) {
        Alert.alert('Error', data.error ?? 'Competition not found');
        router.replace('/(f2t)' as any);
        return;
      }
      setName(data.competition.name);
      setStatus(data.competition.status);
      setStartGw(data.competition.start_gameweek_number);
      setDeadlineAt(data.competition.start_gameweek_deadline ?? null);
      setSelections(data.selections ?? []);
      setScoredCount(data.participant?.scored_count ?? 0);
      setSelectionCount(data.participant?.selection_count ?? 0);
      // Match submit RPC: active participant can pick while competition is open/active
      // and before the start-GW deadline (count of 20 does not lock edits early).
      const partActive = data.participant?.status === 'active';
      const compDone = data.competition.status === 'completed';
      const deadlinePassed = data.competition.start_gameweek_deadline
        ? Date.now() >= new Date(data.competition.start_gameweek_deadline).getTime()
        : false;
      setSelectionsLocked(!partActive || compDone || deadlinePassed);
      setSubEligible(data.participant?.sub_eligible_regular ?? false);
      setRegularSubUsed(data.participant?.regular_sub_used ?? false);
      setLeaderboard(data.leaderboard ?? []);
      setCanManage(data.permissions?.can_manage ?? false);
      setCanHandleJoins(data.permissions?.can_handle_joins ?? false);
      if (data.permissions?.can_handle_joins) {
        const list = await f2tListPendingForCompetition(competitionId);
        setPending(list);
      } else setPending([]);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [competitionId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const loadPlayers = useCallback(async () => {
    if (!competitionId) return;
    setPlayersLoading(true);
    try {
      const cached = f2tSessionGetPlayers(competitionId);
      if (cached) {
        setPlayers(cached);
        return;
      }
      const list = await f2tListSelectablePlayers(competitionId);
      f2tSessionSetPlayers(competitionId, list);
      setPlayers(list);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load players');
      setPlayers([]);
    } finally {
      setPlayersLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    if (pickerOpen) void loadPlayers();
  }, [pickerOpen, loadPlayers]);

  const teamOptions = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; name: string; short_name: string; slug: string }
    >();
    for (const p of players) {
      if (!byId.has(p.team_id)) {
        byId.set(p.team_id, {
          id: p.team_id,
          name: p.team_name,
          short_name: p.team_short_name,
          slug: p.team_slug,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    let list = players.filter((p) => {
      if (positionFilter !== 'ALL' && (p.position ?? '').toUpperCase() !== positionFilter) {
        return false;
      }
      if (teamFilterId && p.team_id !== teamFilterId) return false;
      if (!q) return true;
      return (
        p.display_name.toLowerCase().includes(q) ||
        (p.full_name ?? '').toLowerCase().includes(q) ||
        p.team_name.toLowerCase().includes(q) ||
        p.team_short_name.toLowerCase().includes(q) ||
        (p.position ?? '').toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      if (sortKey === 'name') {
        return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' });
      }
      const diff = playerStatValue(b, sortKey) - playerStatValue(a, sortKey);
      if (diff !== 0) return diff;
      return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' });
    });
    return list;
  }, [players, playerSearch, positionFilter, teamFilterId, sortKey]);

  const resetPickerFilters = () => {
    setPlayerSearch('');
    setPositionFilter('ALL');
    setTeamFilterId(null);
    setSortKey('goals');
  };

  const openPicker = () => {
    const existing = selections.map((s) => s.player_id);
    setPickedIds(existing);
    setSubMode(false);
    setSubOutId(null);
    resetPickerFilters();
    setPickerOpen(true);
  };

  const openSubPicker = (outId: string) => {
    setSubMode(true);
    setSubOutId(outId);
    setPickedIds([]);
    resetPickerFilters();
    setPickerOpen(true);
  };

  const togglePick = (playerId: string) => {
    if (subMode) {
      setPickedIds([playerId]);
      return;
    }
    setPickedIds((prev) => {
      if (prev.includes(playerId)) return prev.filter((id) => id !== playerId);
      if (prev.length >= 20) return prev;
      return [...prev, playerId];
    });
  };

  const submitPicks = async () => {
    if (!competitionId) return;
    setSubmitting(true);
    try {
      if (subMode && subOutId) {
        const inId = pickedIds[0];
        if (!inId) {
          Alert.alert('Substitution', 'Choose a replacement player.');
          return;
        }
        const flaggedOut = selections.find((s) => s.player_id === subOutId)?.owner_flagged;
        const type = flaggedOut ? 'owner_flag' : 'regular';
        const res = await f2tUseSubstitution(competitionId, subOutId, inId, type);
        if (!res.success) {
          Alert.alert('Substitution failed', res.error ?? 'Could not substitute');
          return;
        }
      } else {
        if (pickedIds.length !== 20) {
          Alert.alert('Selections', 'Pick exactly 20 players.');
          return;
        }
        const res = await f2tSubmitSelections(competitionId, pickedIds);
        if (!res.success) {
          Alert.alert('Submit failed', res.error ?? 'Could not save selections');
          return;
        }
      }
      setPickerOpen(false);
      f2tSessionInvalidatePlayers(competitionId);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (requestId: string, approve: boolean) => {
    setBusyRequestId(requestId);
    try {
      const res = approve
        ? await f2tApproveJoin(requestId)
        : await f2tRejectJoin(requestId);
      if (!res.success) {
        Alert.alert('Error', res.error ?? 'Action failed');
        return;
      }
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyRequestId(null);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          paddingTop: insets.top + theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        },
        backBtn: { padding: 4 },
        titleBlock: { flex: 1 },
        title: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 18,
          color: theme.colors.text,
        },
        subtitle: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        tabs: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: theme.spacing.lg,
          gap: 8,
          marginBottom: theme.spacing.sm,
        },
        tab: {
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        tabActive: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        tabText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.textSecondary,
        },
        tabTextActive: { color: theme.colors.accent },
        content: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.md,
        },
        primaryBtn: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: 12,
          alignItems: 'center',
        },
        primaryBtnText: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 14,
          color: theme.colors.white,
        },
        lbRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        lbRank: {
          width: 28,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 14,
          color: theme.colors.textMuted,
        },
        lbName: {
          flex: 1,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 15,
          color: theme.colors.text,
        },
        lbScore: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 14,
          color: theme.colors.accent,
        },
        adminCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
          gap: 8,
        },
        adminActions: { flexDirection: 'row', gap: 8 },
        adminBtn: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        adminBtnApprove: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        subBtn: {
          alignSelf: 'flex-start',
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.accent,
        },
        subBtnText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          color: theme.colors.accent,
        },
        modalBackdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'flex-end',
        },
        modalSheet: {
          maxHeight: '85%',
          backgroundColor: theme.colors.background,
          borderTopLeftRadius: theme.radius.lg,
          borderTopRightRadius: theme.radius.lg,
          paddingTop: theme.spacing.md,
        },
        modalHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          gap: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        },
        modalTitle: {
          flex: 1,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 17,
          color: theme.colors.text,
        },
        search: {
          marginHorizontal: theme.spacing.lg,
          marginBottom: theme.spacing.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: Platform.OS === 'web' ? 8 : 10,
          fontFamily: theme.fontFamily.baiMedium,
          color: theme.colors.text,
          backgroundColor: theme.colors.surface,
        },
        filterScroll: {
          marginBottom: 6,
        },
        filterRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: 4,
        },
        filterChip: {
          paddingVertical: 6,
          paddingHorizontal: 11,
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
        teamChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 5,
          paddingHorizontal: 10,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        teamChipActive: {
          backgroundColor: theme.colors.accentMuted,
          borderColor: theme.colors.accent,
        },
        playerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingVertical: 11,
          paddingHorizontal: theme.spacing.lg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        playerRowSelected: { backgroundColor: theme.colors.accentMuted },
        playerNameRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 2,
        },
        playerName: {
          flexShrink: 1,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 14,
          color: theme.colors.text,
        },
        positionBadge: {
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: theme.colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        positionBadgeText: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 10,
          letterSpacing: 0.4,
          color: theme.colors.textSecondary,
        },
        playerMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        emptyFilter: {
          paddingVertical: 28,
          paddingHorizontal: theme.spacing.lg,
          alignItems: 'center',
        },
        pickerFooter: {
          padding: theme.spacing.lg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          gap: 8,
        },
        pickCount: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
      }),
    [theme, insets]
  );

  const canPick = !selectionsLocked;
  const canRegularSub = subEligible && !regularSubUsed;
  const deadlineLabel = deadlineAt
    ? new Date(deadlineAt).toLocaleString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>{name}</Text>
          <Text style={styles.subtitle}>
            GW{startGw ?? '—'} start · {status}
            {deadlineLabel ? ` · picks until ${deadlineLabel}` : ''}
          </Text>
        </View>
        <Pressable onPress={openSidebar} hitSlop={12}>
          <Ionicons name="menu" size={24} color={theme.colors.text} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(['progress', 'picker', 'leaderboard', ...(canManage ? ['admin'] : [])] as TabKey[]).map(
          (key) => (
            <Pressable
              key={key}
              style={[styles.tab, tab === key && styles.tabActive]}
              onPress={() => setTab(key)}
            >
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
                {key === 'progress'
                  ? 'Progress'
                  : key === 'picker'
                    ? 'Pick'
                    : key === 'leaderboard'
                      ? 'Standings'
                      : 'Admin'}
              </Text>
            </Pressable>
          )
        )}
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
          {tab === 'progress' ? (
            <>
              <PlayerProgressGrid selections={selections} scoredCount={scoredCount} />
              {selections.some(
                (s) => s.owner_flagged && !s.scored_at
              ) ? (
                <Text style={styles.subtitle}>
                  Flagged players can be replaced with a free substitution.
                </Text>
              ) : null}
            </>
          ) : null}

          {tab === 'picker' ? (
            <>
              {canPick ? (
                <Pressable style={styles.primaryBtn} onPress={openPicker}>
                  <Text style={styles.primaryBtnText}>
                    {selectionCount > 0 ? 'Edit selections' : 'Pick 20 players'}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.subtitle}>
                  {selectionCount >= 20
                    ? 'Your 20 players are locked in.'
                    : deadlineAt && Date.now() >= new Date(deadlineAt).getTime()
                      ? 'Selections are closed for this league.'
                      : 'Selections are not available for this league.'}
                </Text>
              )}
              {canPick && selectionCount > 0 && selectionCount < 20 ? (
                <Text style={styles.subtitle}>
                  {selectionCount}/20 selected — choose {20 - selectionCount} more to submit.
                </Text>
              ) : null}
              {selections
                .filter((s) => !s.scored_at && (s.owner_flagged || canRegularSub))
                .map((s) => (
                  <View key={s.slot} style={styles.adminCard}>
                    <Text style={styles.lbName}>{s.display_name}</Text>
                    <Text style={styles.subtitle}>
                      {s.owner_flagged ? 'Flagged — free sub' : 'Regular sub available'}
                    </Text>
                    <Pressable style={styles.subBtn} onPress={() => openSubPicker(s.player_id)}>
                      <Text style={styles.subBtnText}>Substitute</Text>
                    </Pressable>
                  </View>
                ))}
            </>
          ) : null}

          {tab === 'leaderboard' ? (
            leaderboard.map((row, idx) => (
              <View key={row.user_id} style={styles.lbRow}>
                <Text style={styles.lbRank}>{idx + 1}</Text>
                <Text style={styles.lbName}>{row.username?.trim() || row.user_id.slice(0, 8)}</Text>
                <Text style={styles.lbScore}>{row.scored_count}/20</Text>
              </View>
            ))
          ) : null}

          {tab === 'admin' && canHandleJoins ? (
            pending.length === 0 ? (
              <Text style={styles.subtitle}>No pending join requests.</Text>
            ) : (
              pending.map((p) => (
                <View key={p.id} style={styles.adminCard}>
                  <Text style={styles.lbName}>{p.username?.trim() || p.user_id.slice(0, 8)}</Text>
                  <Text style={styles.subtitle}>
                    Requested {new Date(p.created_at).toLocaleString()}
                  </Text>
                  <View style={styles.adminActions}>
                    <Pressable
                      style={[styles.adminBtn, styles.adminBtnApprove]}
                      disabled={busyRequestId === p.id}
                      onPress={() => void handleJoin(p.id, true)}
                    >
                      <Text style={styles.tabTextActive}>Approve</Text>
                    </Pressable>
                    <Pressable
                      style={styles.adminBtn}
                      disabled={busyRequestId === p.id}
                      onPress={() => void handleJoin(p.id, false)}
                    >
                      <Text style={styles.tabText}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )
          ) : null}
        </ScrollView>
      )}

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {subMode ? 'Choose replacement' : 'Pick 20 players'}
              </Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </Pressable>
            </View>
            <TextInput
              style={styles.search}
              value={playerSearch}
              onChangeText={setPlayerSearch}
              placeholder="Search players or teams"
              placeholderTextColor={theme.colors.textMuted}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterRow}
            >
              {POSITION_FILTERS.map((pos) => {
                const active = positionFilter === pos;
                return (
                  <Pressable
                    key={pos}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setPositionFilter(pos)}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {pos === 'ALL' ? 'All positions' : pos}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterRow}
            >
              <Pressable
                style={[styles.teamChip, !teamFilterId && styles.teamChipActive]}
                onPress={() => setTeamFilterId(null)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    !teamFilterId && styles.filterChipTextActive,
                  ]}
                >
                  All teams
                </Text>
              </Pressable>
              {teamOptions.map((t) => {
                const active = teamFilterId === t.id;
                return (
                  <Pressable
                    key={t.id}
                    style={[styles.teamChip, active && styles.teamChipActive]}
                    onPress={() => setTeamFilterId(t.id)}
                  >
                    <TeamColourChip
                      shortName={t.short_name}
                      name={t.name}
                      slug={t.slug}
                      size={18}
                    />
                    <Text
                      style={[
                        styles.filterChipText,
                        active && styles.filterChipTextActive,
                      ]}
                    >
                      {t.short_name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
              contentContainerStyle={styles.filterRow}
            >
              {SORT_OPTIONS.map((opt) => {
                const active = sortKey === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setSortKey(opt.key)}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      Sort: {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {playersLoading ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={theme.colors.accent} />
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {filteredPlayers.length === 0 ? (
                  <View style={styles.emptyFilter}>
                    <Text style={styles.subtitle}>No players match these filters.</Text>
                  </View>
                ) : (
                  filteredPlayers.map((p) => {
                    const selected = pickedIds.includes(p.id);
                    const stats = p.picker_stats as Record<string, unknown>;
                    const goals = numStat(stats, 'season_goals', 'goals_scored');
                    const assists = numStat(stats, 'season_assists', 'assists');
                    const form = numStat(stats, 'form');
                    const xg = numStat(stats, 'expected_goals');
                    const news = typeof stats?.news === 'string' ? stats.news.trim() : '';
                    const metaParts = [
                      p.team_short_name,
                      goals != null ? `${goals} G` : null,
                      assists != null ? `${assists} A` : null,
                      form != null ? `Form ${form}` : null,
                      xg != null ? `xG ${xg.toFixed(1)}` : null,
                    ].filter(Boolean);
                    return (
                      <Pressable
                        key={p.id}
                        style={[styles.playerRow, selected && styles.playerRowSelected]}
                        onPress={() => togglePick(p.id)}
                      >
                        <TeamColourChip
                          shortName={p.team_short_name}
                          name={p.team_name}
                          slug={p.team_slug}
                          size={36}
                        />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.playerNameRow}>
                            <Text style={styles.playerName} numberOfLines={1}>
                              {p.display_name}
                            </Text>
                            {p.position ? (
                              <View style={styles.positionBadge}>
                                <Text style={styles.positionBadgeText}>{p.position}</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.playerMeta} numberOfLines={1}>
                            {metaParts.join(' · ')}
                          </Text>
                          {news ? (
                            <Text style={styles.playerMeta} numberOfLines={1}>
                              {news}
                            </Text>
                          ) : null}
                        </View>
                        {selected ? (
                          <Ionicons name="checkmark-circle" size={22} color={theme.colors.accent} />
                        ) : null}
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            )}
            <View style={styles.pickerFooter}>
              {!subMode ? (
                <Text style={styles.pickCount}>{pickedIds.length} / 20 selected</Text>
              ) : null}
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void submitPicks()}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.colors.white} size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {subMode ? 'Confirm substitution' : 'Save selections'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
