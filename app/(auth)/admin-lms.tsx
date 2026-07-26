import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { AdminScreenLayout, useAdminAccent } from '@/components/AdminScreenLayout';
import { resolveAdminTabletCode } from '@/lib/adminSession';
import {
  lmsAdminApproveJoin,
  lmsAdminCreateCompetition,
  lmsAdminCreateRejoinCode,
  lmsAdminListCompetitions,
  lmsAdminListPending,
  lmsAdminRejectJoin,
  lmsGetCurrentGameweek,
  lmsListGameweeks,
  type LmsGameweek,
} from '@/lib/lms/api';

type AdminComp = {
  id: string;
  name: string;
  season: string;
  status: string;
  start_gameweek_id: string | null;
  start_gameweek_number: number | null;
  join_code: string | null;
  active_rejoin_code: string | null;
  participant_count: number;
  active_count: number;
};

type PendingRow = {
  id: string;
  competition_id: string;
  competition_name: string;
  username: string | null;
  code_type: string;
  created_at: string;
};

export default function AdminLmsScreen() {
  const theme = useTheme();
  const admin = useAdminAccent();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ code?: string; returnTo?: string }>();
  const paramCode = String(params.code ?? '').trim();
  const [adminCode, setAdminCode] = useState(paramCode);
  const [codeReady, setCodeReady] = useState(!!paramCode);
  const returnToRaw = String(params.returnTo ?? '/competition-hub?tab=admin').trim() || '/competition-hub?tab=admin';
  const returnTo =
    returnToRaw === '/competition-hub' ||
    returnToRaw.startsWith('/competition-hub') ||
    returnToRaw === '/(auth)/admin' ||
    returnToRaw.startsWith('/(app)') ||
    returnToRaw.startsWith('/(lms)')
      ? returnToRaw
      : '/competition-hub?tab=admin';

  const [tab, setTab] = useState<'comps' | 'joins'>('comps');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [comps, setComps] = useState<AdminComp[]>([]);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [newName, setNewName] = useState('');
  const [startGwId, setStartGwId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [gameweeks, setGameweeks] = useState<LmsGameweek[]>([]);
  const [currentGwId, setCurrentGwId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const code = await resolveAdminTabletCode(userId, paramCode);
      if (cancelled) return;
      setAdminCode(code ?? '');
      setCodeReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, paramCode]);

  const load = useCallback(async () => {
    if (!adminCode) {
      setLoading(false);
      return;
    }
    try {
      const [c, p, gws, current] = await Promise.all([
        lmsAdminListCompetitions(adminCode),
        lmsAdminListPending(adminCode),
        lmsListGameweeks('2026/27'),
        lmsGetCurrentGameweek('2026/27'),
      ]);
      setComps(c as AdminComp[]);
      setPending(p as PendingRow[]);
      setGameweeks(gws);
      const defaultGw =
        current?.id ?? gws.find((g) => g.status !== 'complete')?.id ?? gws[0]?.id ?? null;
      setCurrentGwId(defaultGw);
      setStartGwId((prev) => prev ?? defaultGw);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load Football admin');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [adminCode]);

  useFocusEffect(
    useCallback(() => {
      if (!codeReady) return;
      void load();
    }, [load, codeReady])
  );

  const onCreate = async () => {
    if (!newName.trim()) {
      Alert.alert('Name required', 'Enter a competition name.');
      return;
    }
    if (!startGwId) {
      Alert.alert('Starting week required', 'Choose which gameweek this competition starts on.');
      return;
    }
    setCreating(true);
    try {
      const res = await lmsAdminCreateCompetition(adminCode, newName.trim(), startGwId);
      if (!res.success) {
        Alert.alert('Failed', res.error ?? 'Could not create competition');
        return;
      }
      setNewName('');
      Alert.alert(
        'Created',
        `Join code: ${res.access_code}${
          res.start_gameweek_number != null ? `\nStarts GW${res.start_gameweek_number}` : ''
        }`
      );
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const onApprove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await lmsAdminApproveJoin(adminCode, id);
      if (!res.success) Alert.alert('Failed', res.error ?? 'Confirm failed');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (id: string) => {
    setBusyId(id);
    try {
      const res = await lmsAdminRejectJoin(adminCode, id);
      if (!res.success) Alert.alert('Failed', res.error ?? 'Reject failed');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const onCreateRejoin = async (competitionId: string) => {
    const next =
      gameweeks.find((g) => g.id === currentGwId) ?? gameweeks.find((g) => g.status !== 'complete');
    if (!next) {
      Alert.alert('No gameweek', 'No upcoming gameweek is available for a rejoin code.');
      return;
    }
    setBusyId(competitionId);
    try {
      const res = await lmsAdminCreateRejoinCode(adminCode, competitionId, next.id);
      if (!res.success) {
        Alert.alert('Failed', res.error ?? 'Could not create rejoin code');
        return;
      }
      Alert.alert('Rejoin code', `${res.access_code} (GW ${next.number})`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const copyJoinCode = async (code: string | null) => {
    if (!code) {
      Alert.alert('No join code', 'This competition does not have a join code yet.');
      return;
    }
    try {
      await Clipboard.setStringAsync(code);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(`Copied join code: ${code}`);
      } else {
        Alert.alert('Copied', `Join code ${code} copied to clipboard.`);
      }
    } catch {
      Alert.alert('Copy failed', 'Could not copy the join code. Try selecting it manually.');
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: {
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.md,
        },
        panel: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          gap: 8,
        },
        input: {
          fontFamily: theme.fontFamily.input,
          fontSize: 16,
          color: theme.colors.text,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 10,
        },
        fieldLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.textSecondary,
          marginTop: 4,
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
        btn: {
          backgroundColor: admin.accent,
          borderRadius: theme.radius.md,
          paddingVertical: 11,
          alignItems: 'center',
        },
        btnText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.white,
          fontWeight: '700',
        },
        ghostBtn: {
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingVertical: 8,
          paddingHorizontal: 12,
          alignItems: 'center',
        },
        ghostText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.text,
        },
        rowTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.text,
        },
        rowMeta: {
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.textSecondary,
        },
        cardHeader: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
        },
        cardHeaderLeft: {
          flex: 1,
          minWidth: 0,
          gap: 4,
        },
        joinedStat: {
          alignItems: 'flex-end',
          flexShrink: 0,
          paddingLeft: theme.spacing.sm,
        },
        joinedCount: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 22,
          fontWeight: '700',
          color: admin.accent,
          letterSpacing: -0.3,
        },
        joinedLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '600',
          color: theme.colors.textMuted,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        },
        joinCodeBtn: {
          marginTop: 4,
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 10,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
        joinCodeText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 28,
          fontWeight: '700',
          letterSpacing: 4,
          color: admin.accent,
        },
        joinCodeHint: {
          fontFamily: theme.fontFamily.light,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        actions: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
        emptyWrap: {
          flex: 1,
          padding: theme.spacing.lg,
          paddingTop: insets.top + theme.spacing.lg,
          gap: theme.spacing.md,
        },
        emptyTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '700',
          color: theme.colors.text,
        },
      }),
    [theme, admin.accent, admin.accentMuted, insets.bottom, insets.top]
  );

  if (!codeReady) {
    return (
      <View style={styles.emptyWrap}>
        <ActivityIndicator color={admin.accent} />
      </View>
    );
  }

  if (!adminCode) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>Admin code required</Text>
        <Text style={styles.rowMeta}>
          Reopen Admin tools from the Home Admin tab or the sport menu.
        </Text>
        <Pressable style={styles.btn} onPress={() => router.replace(returnTo as any)}>
          <Text style={styles.btnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <AdminScreenLayout
      sectionTitle="Football"
      onExit={() => router.replace(returnTo as any)}
      tabs={[
        { key: 'comps', label: 'Competitions' },
        { key: 'joins', label: 'Verify users' },
      ]}
      activeTab={tab}
      onTabChange={(key) => setTab(key as typeof tab)}
      loading={loading}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={admin.accent}
          />
        }
      >
        {tab === 'comps' ? (
          <>
            <View style={styles.panel}>
              <Text style={styles.rowTitle}>Create competition</Text>
              <Text style={styles.rowMeta}>
                Create a Last Man Standing competition and choose which gameweek it starts on.
              </Text>
              <TextInput
                style={styles.input}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Office LMS"
                placeholderTextColor={theme.colors.textMuted}
              />
              <Text style={styles.fieldLabel}>Starting gameweek</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gwScroll}>
                {gameweeks.slice(0, 20).map((g) => {
                  const active = startGwId === g.id;
                  return (
                    <Pressable
                      key={g.id}
                      style={[styles.gwChip, active && styles.gwChipActive]}
                      onPress={() => setStartGwId(g.id)}
                    >
                      <Text style={[styles.gwChipText, active && styles.gwChipTextActive]}>
                        GW{g.number}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable style={styles.btn} onPress={() => void onCreate()} disabled={creating}>
                {creating ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <Text style={styles.btnText}>Create + join code</Text>
                )}
              </Pressable>
            </View>
            {comps.map((c) => (
              <View key={c.id} style={styles.panel}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    <Text style={styles.rowMeta}>
                      {c.status}
                      {c.start_gameweek_number != null ? ` · starts GW${c.start_gameweek_number}` : ''}
                      {c.active_rejoin_code ? ` · rejoin ${c.active_rejoin_code}` : ''}
                    </Text>
                  </View>
                  <View style={styles.joinedStat}>
                    <Text style={styles.joinedCount}>{c.participant_count}</Text>
                    <Text style={styles.joinedLabel}>Joined</Text>
                  </View>
                </View>

                <Pressable
                  style={styles.joinCodeBtn}
                  onPress={() => void copyJoinCode(c.join_code)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    c.join_code ? `Copy join code ${c.join_code}` : 'No join code available'
                  }
                >
                  <View>
                    <Text style={styles.joinCodeText}>{c.join_code ?? '————'}</Text>
                    <Text style={styles.joinCodeHint}>
                      {c.join_code ? 'Tap to copy' : 'No join code'}
                    </Text>
                  </View>
                  {c.join_code ? (
                    <Ionicons name="copy-outline" size={20} color={admin.accent} />
                  ) : null}
                </Pressable>

                <View style={styles.actions}>
                  <Pressable
                    style={styles.ghostBtn}
                    onPress={() => void onCreateRejoin(c.id)}
                    disabled={busyId === c.id}
                  >
                    <Text style={styles.ghostText}>New rejoin code</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : null}

        {tab === 'joins' ? (
          <>
            <View style={styles.panel}>
              <Text style={styles.rowTitle}>Verify sign-ups</Text>
              <Text style={styles.rowMeta}>
                Confirm or reject players who have requested to join with a competition code.
              </Text>
            </View>
            {pending.length === 0 ? (
              <Text style={styles.rowMeta}>No users waiting for verification.</Text>
            ) : (
              pending.map((r) => (
                <View key={r.id} style={styles.panel}>
                  <Text style={styles.rowTitle}>{r.username || 'User'}</Text>
                  <Text style={styles.rowMeta}>
                    {r.competition_name} · {r.code_type} code
                  </Text>
                  <View style={styles.actions}>
                    <Pressable
                      style={styles.btn}
                      onPress={() => void onApprove(r.id)}
                      disabled={busyId === r.id}
                    >
                      <Text style={styles.btnText}>Confirm</Text>
                    </Pressable>
                    <Pressable
                      style={styles.ghostBtn}
                      onPress={() => void onReject(r.id)}
                      disabled={busyId === r.id}
                    >
                      <Text style={styles.ghostText}>Reject</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        ) : null}
      </ScrollView>
    </AdminScreenLayout>
  );
}
