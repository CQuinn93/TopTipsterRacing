import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
  TextInput,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { AdminScreenLayout, useAdminAccent } from '@/components/AdminScreenLayout';
import { getProfileRole, isOwnerRole } from '@/lib/adminSession';
import {
  ownerDeleteUser,
  ownerListCompetitions,
  ownerListUsers,
  ownerSetUserBanned,
  ownerSetUserRole,
  type OwnerCompetitionRow,
  type OwnerUserRow,
} from '@/lib/ownerApi';
import { racingDeleteCompetition } from '@/lib/racingAdminApi';
import {
  lmsAdminDeleteCompetition,
  lmsAdminSetFixtureExcluded,
  lmsGetCurrentGameweek,
  lmsListFixturesForGameweek,
  lmsListGameweeks,
  type LmsFixture,
  type LmsGameweek,
} from '@/lib/lms/api';
import {
  ownerListFootballPlayers,
  ownerListFootballPlayersFplAlerts,
  ownerSetFootballPlayerFlagged,
  ownerSyncFootballPlayersBbs,
} from '@/lib/f2t/api';
import { FootballPlayerFlagCard } from '@/components/f2t/FootballPlayerFlagCard';
import {
  DEFAULT_HUB_GAME_MODES,
  HUB_GAME_MODE_LABELS,
  getHubGameModes,
  ownerSetHubGameModes,
  type HubGameModeKey,
  type HubGameModes,
} from '@/lib/hubGameModes';

type TabKey = 'users' | 'competitions' | 'exclusions' | 'f2t_players' | 'game_modes';

const LMS_SEASON = '2026/27';

function roleErrorMessage(code?: string): string {
  switch (code) {
    case 'unauthorized':
      return 'Only the Owner can change roles.';
    case 'cannot_change_own_role':
      return 'You cannot change your own role.';
    case 'cannot_change_owner':
      return 'Owner accounts cannot be changed here.';
    case 'invalid_role':
      return 'Role must be User or Admin.';
    case 'user_not_found':
      return 'User not found.';
    default:
      return code ?? 'Could not update role.';
  }
}

function banErrorMessage(code?: string): string {
  switch (code) {
    case 'unauthorized':
      return 'Only the Owner can ban users.';
    case 'cannot_ban_self':
      return 'You cannot ban yourself.';
    case 'cannot_ban_owner':
      return 'Owner accounts cannot be banned.';
    case 'user_not_found':
      return 'User not found.';
    default:
      return code ?? 'Could not update ban status.';
  }
}

function deleteErrorMessage(code?: string): string {
  switch (code) {
    case 'unauthorized':
      return 'Only the Owner can remove users.';
    case 'cannot_delete_self':
      return 'You cannot remove your own account here.';
    case 'cannot_delete_owner':
      return 'Owner accounts cannot be removed.';
    case 'user_not_found':
      return 'User not found.';
    case 'not_signed_in':
      return 'You are not signed in.';
    default:
      return code ?? 'Could not remove user.';
  }
}

function notify(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  if (message) Alert.alert(title, message);
  else Alert.alert(title);
}

function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void
) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

function fixtureLabel(f: LmsFixture): string {
  const home = f.home_team?.short_name || f.home_team?.name || 'Home';
  const away = f.away_team?.short_name || f.away_team?.name || 'Away';
  return `${home} vs ${away}`;
}

export default function OwnerScreen() {
  const theme = useTheme();
  const admin = useAdminAccent();
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ returnTo?: string; ownerTab?: string }>();
  const returnToRaw = String(params.returnTo ?? '/competition-hub?tab=admin').trim();
  const returnTo =
    returnToRaw === '/competition-hub' || returnToRaw.startsWith('/competition-hub')
      ? returnToRaw
      : '/competition-hub?tab=admin';

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<TabKey>('users');

  useEffect(() => {
    const ownerTab = String(params.ownerTab ?? '').trim();
    if (
      ownerTab === 'game_modes' ||
      ownerTab === 'f2t_players' ||
      ownerTab === 'exclusions' ||
      ownerTab === 'competitions' ||
      ownerTab === 'users'
    ) {
      setTab(ownerTab as TabKey);
    }
  }, [params.ownerTab]);
  const [users, setUsers] = useState<OwnerUserRow[]>([]);
  const [comps, setComps] = useState<OwnerCompetitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [busyCompKey, setBusyCompKey] = useState<string | null>(null);

  const [gameweeks, setGameweeks] = useState<LmsGameweek[]>([]);
  const [selectedGwId, setSelectedGwId] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<LmsFixture[]>([]);
  const [exclusionsLoading, setExclusionsLoading] = useState(false);
  const [busyFixtureId, setBusyFixtureId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});

  const [f2tPlayers, setF2tPlayers] = useState<Array<Record<string, unknown>>>([]);
  const [f2tPlayersLoading, setF2tPlayersLoading] = useState(false);
  const [f2tPlayerSearch, setF2tPlayerSearch] = useState('');
  const [f2tSyncBusy, setF2tSyncBusy] = useState(false);
  const [f2tBusyPlayerId, setF2tBusyPlayerId] = useState<string | null>(null);

  const [hubModes, setHubModes] = useState<HubGameModes>(DEFAULT_HUB_GAME_MODES);
  const [hubModesLoading, setHubModesLoading] = useState(false);
  const [hubModesSaving, setHubModesSaving] = useState(false);

  useEffect(() => {
    if (!userId) {
      setAllowed(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const role = await getProfileRole(userId);
        if (!cancelled) setAllowed(isOwnerRole(role));
      } catch {
        if (!cancelled) setAllowed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const load = useCallback(async () => {
    try {
      const [u, c] = await Promise.all([ownerListUsers(), ownerListCompetitions()]);
      setUsers(u);
      setComps(c);
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Failed to load owner data');
      setUsers([]);
      setComps([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadExclusions = useCallback(async (preferGwId?: string | null) => {
    setExclusionsLoading(true);
    try {
      const [gws, current] = await Promise.all([
        lmsListGameweeks(LMS_SEASON),
        lmsGetCurrentGameweek(LMS_SEASON),
      ]);
      setGameweeks(gws);
      const gwId =
        preferGwId && gws.some((g) => g.id === preferGwId)
          ? preferGwId
          : current?.id ??
            gws.find((g) => g.status !== 'complete')?.id ??
            gws[0]?.id ??
            null;
      setSelectedGwId(gwId);
      if (!gwId) {
        setFixtures([]);
        setReasonById({});
        return;
      }
      const list = await lmsListFixturesForGameweek(gwId);
      setFixtures(list);
      setReasonById(
        Object.fromEntries(list.map((f) => [f.id, f.excluded_reason?.trim() || '']))
      );
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Failed to load fixtures');
      setFixtures([]);
    } finally {
      setExclusionsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (allowed !== true) return;
      setLoading(true);
      void load();
    }, [allowed, load])
  );

  const loadF2tPlayers = useCallback(async (search?: string) => {
    setF2tPlayersLoading(true);
    try {
      const q = search?.trim();
      const list = q
        ? await ownerListFootballPlayers(undefined, q)
        : await ownerListFootballPlayersFplAlerts();
      setF2tPlayers(list);
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Failed to load players');
      setF2tPlayers([]);
    } finally {
      setF2tPlayersLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadHubModes = useCallback(async () => {
    setHubModesLoading(true);
    try {
      const modes = await getHubGameModes();
      setHubModes(modes);
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Failed to load game modes');
      setHubModes(DEFAULT_HUB_GAME_MODES);
    } finally {
      setHubModesLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (allowed !== true || tab !== 'f2t_players') return;
    void loadF2tPlayers(f2tPlayerSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, tab, loadF2tPlayers]);

  useEffect(() => {
    if (allowed !== true || tab !== 'game_modes') return;
    void loadHubModes();
  }, [allowed, tab, loadHubModes]);

  useEffect(() => {
    if (allowed !== true || tab !== 'exclusions') return;
    void loadExclusions(selectedGwId);
    // Intentionally omit selectedGwId — chip presses call loadExclusions directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, tab, loadExclusions]);

  const syncF2tPlayers = async () => {
    setF2tSyncBusy(true);
    try {
      const res = await ownerSyncFootballPlayersBbs();
      if (!res.success) {
        const hint = res.hint ? ` ${res.hint}` : '';
        notify('Sync failed', `${res.error ?? 'Could not sync players'}${hint}`);
        return;
      }
      const skipped =
        (res.skipped_no_team ?? 0) + (res.skipped_no_name ?? 0);
      const detail =
        skipped > 0
          ? ` (${skipped} skipped — ${res.skipped_no_team ?? 0} no team match)`
          : '';
      notify(
        'Synced',
        `Updated ${res.upserted ?? 0} of ${res.fetched ?? 0} players from Big Balls.${detail}`
      );
      await loadF2tPlayers(f2tPlayerSearch);
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setF2tSyncBusy(false);
    }
  };

  const togglePlayerFlag = async (playerId: string, flagged: boolean) => {
    setF2tBusyPlayerId(playerId);
    try {
      const res = await ownerSetFootballPlayerFlagged(playerId, flagged);
      if (!res.success) {
        notify('Error', res.error ?? 'Could not update flag');
        return;
      }
      setF2tPlayers((prev) =>
        prev.map((p) =>
          String(p.id) === playerId ? { ...p, owner_flagged: flagged } : p
        )
      );
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Could not update flag');
    } finally {
      setF2tBusyPlayerId(null);
    }
  };

  const saveHubMode = async (key: HubGameModeKey, open: boolean) => {
    const next = { ...hubModes, [key]: open };
    setHubModes(next);
    setHubModesSaving(true);
    try {
      const res = await ownerSetHubGameModes(next);
      if (!res.success) {
        notify('Error', res.error ?? 'Could not update game mode');
        await loadHubModes();
        return;
      }
      if (res.modes) setHubModes(res.modes);
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Could not update game mode');
      await loadHubModes();
    } finally {
      setHubModesSaving(false);
    }
  };

  const setRole = async (user: OwnerUserRow, role: 'User' | 'Admin') => {
    if (user.role === role) return;
    setBusyUserId(user.id);
    try {
      const res = await ownerSetUserRole(user.id, role);
      if (!res.success) {
        notify('Error', roleErrorMessage(res.error));
        return;
      }
      setUsers((prev) => prev.map((row) => (row.id === user.id ? { ...row, role } : row)));
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Could not update role');
    } finally {
      setBusyUserId(null);
    }
  };

  const setBanned = async (user: OwnerUserRow, banned: boolean) => {
    setBusyUserId(user.id);
    try {
      const res = await ownerSetUserBanned(user.id, banned);
      if (!res.success) {
        notify('Error', banErrorMessage(res.error));
        return;
      }
      setUsers((prev) =>
        prev.map((row) =>
          row.id === user.id
            ? {
                ...row,
                banned_at: banned ? new Date().toISOString() : null,
                banned_by: banned ? userId : null,
              }
            : row
        )
      );
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Could not update ban');
    } finally {
      setBusyUserId(null);
    }
  };

  const removeUser = (user: OwnerUserRow) => {
    const label = user.username?.trim() || 'this user';
    confirmDestructive(
      'Remove user?',
      `Permanently delete ${label} and all their competition data. They will not be able to sign in again. This cannot be undone.`,
      'Remove',
      () => {
        void (async () => {
          setBusyUserId(user.id);
          try {
            const res = await ownerDeleteUser(user.id);
            if (!res.success) {
              notify('Error', deleteErrorMessage(res.error));
              return;
            }
            setUsers((prev) => prev.filter((row) => row.id !== user.id));
            notify('Removed', `${label} has been permanently deleted.`);
          } catch (e) {
            notify('Error', e instanceof Error ? e.message : 'Could not remove user');
          } finally {
            setBusyUserId(null);
          }
        })();
      }
    );
  };

  const deleteCompetition = (c: OwnerCompetitionRow) => {
    const key = `${c.sport}-${c.id}`;
    const label = c.name?.trim() || 'this competition';
    confirmDestructive(
      'Delete competition?',
      `Permanently delete ${label} and all related entries. This cannot be undone.`,
      'Delete',
      () => {
        void (async () => {
          setBusyCompKey(key);
          try {
            const res =
              c.sport === 'lms'
                ? await lmsAdminDeleteCompetition(c.id)
                : await racingDeleteCompetition(c.id);
            if (!res.success) {
              notify('Error', res.error ?? 'Could not delete competition');
              return;
            }
            setComps((prev) => prev.filter((row) => !(row.id === c.id && row.sport === c.sport)));
            notify('Deleted', `${res.name?.trim() || label} has been deleted.`);
          } catch (e) {
            notify('Error', e instanceof Error ? e.message : 'Could not delete competition');
          } finally {
            setBusyCompKey(null);
          }
        })();
      }
    );
  };

  const setFixtureExcluded = async (fixture: LmsFixture, excluded: boolean) => {
    setBusyFixtureId(fixture.id);
    try {
      const reason = reasonById[fixture.id]?.trim() || null;
      const res = await lmsAdminSetFixtureExcluded(
        fixture.id,
        excluded,
        excluded ? reason : null
      );
      if (!res.success) {
        notify('Error', res.error ?? 'Could not update exclusion');
        return;
      }
      setFixtures((prev) =>
        prev.map((f) =>
          f.id === fixture.id
            ? {
                ...f,
                excluded_from_lms: excluded,
                excluded_reason: excluded ? reason : null,
              }
            : f
        )
      );
      if (!excluded) {
        setReasonById((prev) => ({ ...prev, [fixture.id]: '' }));
      }
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Could not update exclusion');
    } finally {
      setBusyFixtureId(null);
    }
  };

  const saveFixtureReason = async (fixture: LmsFixture, reasonText: string) => {
    if (!fixture.excluded_from_lms) return;
    setBusyFixtureId(fixture.id);
    try {
      const reason = reasonText.trim() || null;
      const res = await lmsAdminSetFixtureExcluded(fixture.id, true, reason);
      if (!res.success) {
        notify('Error', res.error ?? 'Could not update reason');
        return;
      }
      setFixtures((prev) =>
        prev.map((f) =>
          f.id === fixture.id ? { ...f, excluded_reason: reason } : f
        )
      );
    } catch (e) {
      notify('Error', e instanceof Error ? e.message : 'Could not update reason');
    } finally {
      setBusyFixtureId(null);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    if (tab === 'exclusions') {
      void loadExclusions(selectedGwId);
    } else if (tab === 'f2t_players') {
      void loadF2tPlayers(f2tPlayerSearch);
    } else if (tab === 'game_modes') {
      void loadHubModes();
    } else {
      void load();
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xxl,
          gap: theme.spacing.md,
        },
        hint: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
          lineHeight: 18,
        },
        card: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
          gap: 8,
        },
        rowTop: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        },
        name: {
          flex: 1,
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
        },
        meta: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        code: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '700',
          color: admin.accent,
          letterSpacing: 1.2,
        },
        badge: {
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: admin.accent,
          backgroundColor: admin.accentMuted,
        },
        badgeText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          color: admin.accent,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        },
        actions: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginTop: 4,
        },
        actionBtn: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
        },
        actionBtnActive: {
          borderColor: admin.accent,
          backgroundColor: admin.accentMuted,
        },
        actionBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.textSecondary,
        },
        actionBtnTextActive: {
          color: admin.accent,
        },
        actionBtnDanger: {
          borderColor: theme.colors.error,
          backgroundColor: 'transparent',
        },
        actionBtnTextDanger: {
          color: theme.colors.error,
        },
        empty: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textMuted,
          textAlign: 'center',
          marginTop: theme.spacing.xl,
        },
        blocked: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.xl,
          gap: theme.spacing.md,
          backgroundColor: theme.colors.background,
        },
        blockedTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          fontWeight: '700',
          color: theme.colors.text,
        },
        backBtn: {
          paddingVertical: 10,
          paddingHorizontal: 16,
          borderRadius: theme.radius.md,
          backgroundColor: admin.accent,
        },
        backBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '700',
          color: theme.colors.black,
        },
        gwScroll: {
          flexGrow: 0,
        },
        gwChip: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          marginRight: 8,
          backgroundColor: theme.colors.surfaceElevated,
        },
        gwChipActive: {
          borderColor: admin.accent,
          backgroundColor: admin.accentMuted,
        },
        gwChipText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textSecondary,
        },
        gwChipTextActive: {
          color: admin.accent,
          fontWeight: '700',
        },
        excludeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        },
        excludeLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: theme.colors.textSecondary,
        },
        reasonInput: {
          fontFamily: theme.fontFamily.input,
          fontSize: 14,
          color: theme.colors.text,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 8,
          backgroundColor: theme.colors.surfaceElevated,
        },
      }),
    [theme, admin.accent, admin.accentMuted]
  );

  if (allowed === false) {
    return (
      <View style={styles.blocked}>
        <Text style={styles.blockedTitle}>Owner access required</Text>
        <Pressable style={styles.backBtn} onPress={() => router.replace(returnTo as any)}>
          <Text style={styles.backBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (allowed === null) {
    return (
      <View style={styles.blocked}>
        <ActivityIndicator color={admin.accent} />
      </View>
    );
  }

  const racingComps = comps.filter((c) => c.sport === 'racing');
  const lmsComps = comps.filter((c) => c.sport === 'lms');
  const selectedGw = gameweeks.find((g) => g.id === selectedGwId) ?? null;

  const renderCompCard = (c: OwnerCompetitionRow) => {
    const key = `${c.sport}-${c.id}`;
    const busy = busyCompKey === key;
    return (
      <View key={key} style={styles.card}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={2}>
            {c.name}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{c.status}</Text>
          </View>
        </View>
        <Text style={styles.meta}>
          Join code <Text style={styles.code}>{c.join_code?.trim() || '—'}</Text>
        </Text>
        {c.sport === 'lms' && c.rejoin_code ? (
          <Text style={styles.meta}>
            Rejoin code <Text style={styles.code}>{c.rejoin_code}</Text>
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {c.sport === 'lms'
            ? `${c.active_count ?? 0} active / ${c.participant_count ?? 0} total${
                c.season ? ` · ${c.season}` : ''
              }`
            : `${c.participant_count ?? 0} players${
                c.creator_username ? ` · created by ${c.creator_username}` : ''
              }`}
        </Text>
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnDanger]}
            disabled={busy}
            onPress={() => deleteCompetition(c)}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${c.name}`}
          >
            {busy ? (
              <ActivityIndicator size="small" color={theme.colors.error} />
            ) : (
              <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>Delete</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <AdminScreenLayout
      sectionTitle="Owner"
      onExit={() => router.replace(returnTo as any)}
      tabs={[
        { key: 'users', label: 'Users' },
        { key: 'competitions', label: 'Competitions' },
        { key: 'game_modes', label: 'Game modes' },
        { key: 'f2t_players', label: 'F2T players' },
        { key: 'exclusions', label: 'Exclusions' },
      ]}
      activeTab={tab}
      onTabChange={(key) => setTab(key as TabKey)}
      loading={
        loading && tab !== 'exclusions' && tab !== 'f2t_players' && tab !== 'game_modes'
      }
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={admin.accent}
          />
        }
      >
        {tab === 'users' ? (
          <>
            <Text style={styles.hint}>
              All accounts on the platform. Change User/Admin roles, ban an account so they cannot
              sign in or join competitions, or permanently remove a user. Owner accounts are locked.
            </Text>
            {users.length === 0 ? (
              <Text style={styles.empty}>No users found</Text>
            ) : (
              users.map((u) => {
                const busy = busyUserId === u.id;
                const isSelf = u.id === userId;
                const locked = u.role === 'Owner' || isSelf;
                const banned = Boolean(u.banned_at);
                return (
                  <View key={u.id} style={styles.card}>
                    <View style={styles.rowTop}>
                      <Text style={styles.name} numberOfLines={1}>
                        {u.username?.trim() || 'No username'}
                      </Text>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{banned ? 'Banned' : u.role}</Text>
                      </View>
                    </View>
                    {u.email?.trim() ? (
                      <Text style={styles.meta} numberOfLines={1} selectable>
                        {u.email.trim()}
                      </Text>
                    ) : (
                      <Text style={styles.meta}>No email on file</Text>
                    )}
                    <Text style={styles.meta}>
                      Joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      {isSelf ? ' · you' : ''}
                      {banned && u.banned_at
                        ? ` · banned ${new Date(u.banned_at).toLocaleDateString()}`
                        : ''}
                    </Text>
                    {!locked ? (
                      <View style={styles.actions}>
                        <Pressable
                          style={[styles.actionBtn, u.role === 'User' && !banned && styles.actionBtnActive]}
                          disabled={busy || banned}
                          onPress={() => void setRole(u, 'User')}
                        >
                          <Text
                            style={[
                              styles.actionBtnText,
                              u.role === 'User' && !banned && styles.actionBtnTextActive,
                            ]}
                          >
                            User
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.actionBtn,
                            u.role === 'Admin' && !banned && styles.actionBtnActive,
                          ]}
                          disabled={busy || banned}
                          onPress={() => void setRole(u, 'Admin')}
                        >
                          <Text
                            style={[
                              styles.actionBtnText,
                              u.role === 'Admin' && !banned && styles.actionBtnTextActive,
                            ]}
                          >
                            Admin
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.actionBtn, banned && styles.actionBtnActive]}
                          disabled={busy}
                          onPress={() => void setBanned(u, !banned)}
                        >
                          <Text
                            style={[
                              styles.actionBtnText,
                              banned && styles.actionBtnTextActive,
                            ]}
                          >
                            {banned ? 'Unban' : 'Ban'}
                          </Text>
                        </Pressable>
                        <Pressable
                          style={[styles.actionBtn, styles.actionBtnDanger]}
                          disabled={busy}
                          onPress={() => removeUser(u)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${u.username?.trim() || 'user'}`}
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color={theme.colors.error} />
                          ) : (
                            <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>
                              Remove
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        ) : tab === 'competitions' ? (
          <>
            <Text style={styles.hint}>
              Every competition across Racing and Football, with join codes. Delete removes the
              competition permanently. Pull to refresh.
            </Text>

            <Text style={[styles.meta, { textTransform: 'uppercase', letterSpacing: 0.8 }]}>
              Racing ({racingComps.length})
            </Text>
            {racingComps.length === 0 ? (
              <Text style={styles.empty}>No racing competitions</Text>
            ) : (
              racingComps.map(renderCompCard)
            )}

            <Text
              style={[
                styles.meta,
                { textTransform: 'uppercase', letterSpacing: 0.8, marginTop: theme.spacing.md },
              ]}
            >
              Football / LMS ({lmsComps.length})
            </Text>
            {lmsComps.length === 0 ? (
              <Text style={styles.empty}>No LMS competitions</Text>
            ) : (
              lmsComps.map(renderCompCard)
            )}
          </>
        ) : tab === 'game_modes' ? (
          <>
            <Text style={styles.hint}>
              Control which game modes appear open on the competition hub for regular users. You
              always have access to every mode regardless of these toggles.
            </Text>
            {hubModesLoading ? (
              <ActivityIndicator color={admin.accent} style={{ marginTop: theme.spacing.lg }} />
            ) : (
              (Object.keys(HUB_GAME_MODE_LABELS) as HubGameModeKey[]).map((key) => {
                const open = hubModes[key];
                const label = HUB_GAME_MODE_LABELS[key];
                const note =
                  key === 'f2t6'
                    ? 'Not implemented yet — toggle stores preference for when the mode ships.'
                    : null;
                return (
                  <View key={key} style={styles.card}>
                    <View style={styles.rowTop}>
                      <Text style={styles.name}>{label}</Text>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{open ? 'Open' : 'Closed'}</Text>
                      </View>
                    </View>
                    {note ? <Text style={styles.meta}>{note}</Text> : null}
                    <View style={styles.excludeRow}>
                      <Text style={styles.excludeLabel}>
                        {open ? 'Visible to users on hub' : 'Hidden from users (Owner can still enter)'}
                      </Text>
                      {hubModesSaving ? (
                        <ActivityIndicator size="small" color={admin.accent} />
                      ) : (
                        <Switch
                          value={open}
                          onValueChange={(value) => void saveHubMode(key, value)}
                          trackColor={{ false: theme.colors.border, true: admin.accent }}
                          thumbColor={theme.colors.surface}
                        />
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </>
        ) : tab === 'f2t_players' ? (
          <>
            <Text style={styles.hint}>
              FPL injury and availability alerts only (run daily FPL sync for updates). Flag
              long-term absences — excluded players cannot be newly picked and grant a free sub if
              unscored. Search to find any player in the squad.
            </Text>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnActive]}
              disabled={f2tSyncBusy}
              onPress={() => void syncF2tPlayers()}
            >
              {f2tSyncBusy ? (
                <ActivityIndicator size="small" color={admin.accent} />
              ) : (
                <Text style={[styles.actionBtnText, styles.actionBtnTextActive]}>Sync player list</Text>
              )}
            </Pressable>
            <TextInput
              style={styles.reasonInput}
              value={f2tPlayerSearch}
              onChangeText={setF2tPlayerSearch}
              placeholder="Search any player"
              placeholderTextColor={theme.colors.textMuted}
              onSubmitEditing={() => void loadF2tPlayers(f2tPlayerSearch)}
              onBlur={() => void loadF2tPlayers(f2tPlayerSearch)}
            />
            {f2tPlayersLoading ? (
              <ActivityIndicator color={admin.accent} style={{ marginTop: theme.spacing.lg }} />
            ) : f2tPlayers.length === 0 ? (
              <Text style={styles.empty}>
                {f2tPlayerSearch.trim()
                  ? 'No players match your search'
                  : 'No FPL alerts — run FPL daily sync or check back later'}
              </Text>
            ) : (
              f2tPlayers.map((p) => {
                const id = String(p.id ?? '');
                return (
                  <FootballPlayerFlagCard
                    key={id}
                    player={p}
                    accent={admin.accent}
                    busy={f2tBusyPlayerId === id}
                    onToggleFlag={(playerId, flagged) => void togglePlayerFlag(playerId, flagged)}
                  />
                );
              })
            )}
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              Exclusions apply to all LMS competitions (season calendar). Excluded fixtures cannot be
              picked in any Last Man Standing league.
            </Text>

            <Text style={[styles.meta, { textTransform: 'uppercase', letterSpacing: 0.8 }]}>
              Gameweek
              {selectedGw ? ` · GW${selectedGw.number}` : ''}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gwScroll}>
              {gameweeks.map((g) => {
                const active = selectedGwId === g.id;
                return (
                  <Pressable
                    key={g.id}
                    style={[styles.gwChip, active && styles.gwChipActive]}
                    onPress={() => {
                      setSelectedGwId(g.id);
                      void loadExclusions(g.id);
                    }}
                  >
                    <Text style={[styles.gwChipText, active && styles.gwChipTextActive]}>
                      GW{g.number}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {exclusionsLoading ? (
              <ActivityIndicator color={admin.accent} style={{ marginTop: theme.spacing.lg }} />
            ) : fixtures.length === 0 ? (
              <Text style={styles.empty}>No fixtures for this gameweek</Text>
            ) : (
              fixtures.map((f) => {
                const excluded = !!f.excluded_from_lms;
                const busy = busyFixtureId === f.id;
                return (
                  <View key={f.id} style={styles.card}>
                    <Text style={styles.name} numberOfLines={2}>
                      {fixtureLabel(f)}
                    </Text>
                    <Text style={styles.meta}>
                      {f.kickoff_at
                        ? new Date(f.kickoff_at).toLocaleString(undefined, {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Kickoff TBD'}
                      {f.status ? ` · ${f.status}` : ''}
                    </Text>
                    <View style={styles.excludeRow}>
                      <Text style={styles.excludeLabel}>
                        {excluded ? 'Excluded from LMS' : 'Available to pick'}
                      </Text>
                      {busy ? (
                        <ActivityIndicator size="small" color={admin.accent} />
                      ) : (
                        <Switch
                          value={excluded}
                          onValueChange={(value) => void setFixtureExcluded(f, value)}
                          trackColor={{ false: theme.colors.border, true: admin.accent }}
                          thumbColor={theme.colors.surface}
                        />
                      )}
                    </View>
                    <TextInput
                      style={styles.reasonInput}
                      value={reasonById[f.id] ?? ''}
                      onChangeText={(text) =>
                        setReasonById((prev) => ({ ...prev, [f.id]: text }))
                      }
                      placeholder="Optional exclusion reason"
                      placeholderTextColor={theme.colors.textMuted}
                      editable={!busy}
                      onBlur={() => {
                        if (!excluded) return;
                        const next = reasonById[f.id]?.trim() || '';
                        const prev = f.excluded_reason?.trim() || '';
                        if (next !== prev) void saveFixtureReason(f, reasonById[f.id] ?? '');
                      }}
                    />
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </AdminScreenLayout>
  );
}
