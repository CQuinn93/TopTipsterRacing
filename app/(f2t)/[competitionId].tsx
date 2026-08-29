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
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { PlayerProgressGrid } from '@/components/f2t/PlayerProgressGrid';
import { F2tPlayerPicker } from '@/components/f2t/F2tPlayerPicker';
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

type TabKey = 'team' | 'leaderboard' | 'admin';

export default function F2tCompetitionScreen() {
  const theme = useTheme();
  const { openSidebar } = useSidebar();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ competitionId: string }>();
  const competitionId = String(params.competitionId ?? '');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('team');
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

  const openPicker = () => {
    const existing = selections.map((s) => s.player_id);
    setPickedIds(existing);
    setSubMode(false);
    setSubOutId(null);
    setPickerOpen(true);
  };

  const openSubPicker = (outId: string) => {
    setSubMode(true);
    setSubOutId(outId);
    setPickedIds([]);
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
        {(['team', 'leaderboard', ...(canManage ? ['admin'] : [])] as TabKey[]).map(
          (key) => (
            <Pressable
              key={key}
              style={[styles.tab, tab === key && styles.tabActive]}
              onPress={() => setTab(key)}
            >
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
                {key === 'team'
                  ? 'Team Management'
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
          {tab === 'team' ? (
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
                    ? deadlineAt && Date.now() >= new Date(deadlineAt).getTime()
                      ? 'Selections locked — manage substitutions below when eligible.'
                      : 'Your 20 players are locked in.'
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
              {canRegularSub ? (
                <Text style={styles.subtitle}>
                  Regular substitution available (one unused player swap after 3 completed
                  gameweeks).
                </Text>
              ) : null}
              {selections.some((s) => s.owner_flagged && !s.scored_at) ? (
                <Text style={styles.subtitle}>
                  Flagged players can be replaced with a free substitution from their card.
                </Text>
              ) : null}
              <PlayerProgressGrid
                selections={selections}
                scoredCount={scoredCount}
                canRegularSub={canRegularSub}
                onSubstitute={openSubPicker}
              />
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

      <F2tPlayerPicker
        visible={pickerOpen}
        title={subMode ? 'Choose replacement' : 'Pick 20 players'}
        players={players}
        loading={playersLoading}
        selectedIds={pickedIds}
        submitting={submitting}
        subMode={subMode}
        onClose={() => setPickerOpen(false)}
        onToggle={togglePick}
        onSubmit={() => void submitPicks()}
      />
    </View>
  );
}
