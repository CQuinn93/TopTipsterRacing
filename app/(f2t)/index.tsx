import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { useAuth } from '@/contexts/AuthContext';
import { LeagueTablePanel } from '@/components/lms/LeagueTablePanel';
import { LmsTrademarkDisclaimer } from '@/components/lms/LmsTrademarkDisclaimer';
import {
  f2tCreateCompetition,
  f2tGetHome,
  f2tJoinErrorMessage,
  f2tRequestJoin,
  type F2tCompetitionHomeSummary,
  type F2tPendingJoin,
} from '@/lib/f2t/api';
import { lmsListGameweeks, type LmsGameweek } from '@/lib/lms/api';
import { getProfileRole, isStaffRole } from '@/lib/adminSession';

type HomeTab = 'competitions' | 'join' | 'table';
const F2T_SEASON = '2026/27';

export default function F2tHomeScreen() {
  const theme = useTheme();
  const { openSidebar } = useSidebar();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();

  const [comps, setComps] = useState<F2tCompetitionHomeSummary[]>([]);
  const [pending, setPending] = useState<F2tPendingJoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<HomeTab>('competitions');
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEntry, setCreateEntry] = useState('');
  const [createGwId, setCreateGwId] = useState<string | null>(null);
  const [gameweeks, setGameweeks] = useState<LmsGameweek[]>([]);
  const [creating, setCreating] = useState(false);

  const homeLoadedRef = useRef(false);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  const load = useCallback(async () => {
    try {
      const data = await f2tGetHome(F2T_SEASON);
      setComps(data.competitions ?? []);
      setPending(data.pending ?? []);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load');
      setComps([]);
      setPending([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  loadRef.current = load;

  useEffect(() => {
    if (!userId) return;
    void getProfileRole(userId).then((role) => setIsStaff(isStaffRole(role)));
  }, [userId]);

  useEffect(() => {
    if (!isStaff) return;
    void lmsListGameweeks(F2T_SEASON).then((gws) => {
      setGameweeks(gws);
      const open = gws.find((g) => g.status !== 'complete');
      setCreateGwId(open?.id ?? gws[0]?.id ?? null);
    });
  }, [isStaff]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      if (homeLoadedRef.current) return;
      homeLoadedRef.current = true;
      void loadRef.current();
    }, [userId])
  );

  const onRefresh = () => {
    setRefreshing(true);
    if (tab === 'table') setTableRefreshKey((k) => k + 1);
    void load();
  };

  const onJoin = async () => {
    if (!code.trim()) {
      Alert.alert('Competition code', 'Enter the competition code to join.');
      return;
    }
    setJoining(true);
    try {
      const res = await f2tRequestJoin(code);
      if (!res.success) {
        Alert.alert('Join failed', f2tJoinErrorMessage(res.error));
        return;
      }
      setCode('');
      const compName = res.competition_name?.trim() || 'the competition';
      const msg =
        `You have requested to join ${compName}. ` +
        'An admin will approve your request before you can pick players.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
      else Alert.alert('Request sent', msg);
      await load();
      setTab('competitions');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Join failed');
    } finally {
      setJoining(false);
    }
  };

  const onCreate = async () => {
    if (!createName.trim()) {
      Alert.alert('Name required', 'Enter a competition name.');
      return;
    }
    if (!createGwId) {
      Alert.alert('Starting week required', 'Choose a starting gameweek.');
      return;
    }
    setCreating(true);
    try {
      const res = await f2tCreateCompetition(
        createName.trim(),
        createGwId,
        F2T_SEASON,
        createEntry.trim() || undefined
      );
      if (!res.success) {
        Alert.alert('Failed', res.error ?? 'Could not create competition');
        return;
      }
      setCreateName('');
      setCreateEntry('');
      setShowCreate(false);
      Alert.alert(
        'Created',
        `Join code: ${res.access_code ?? '—'}`
      );
      await load();
      if (res.competition_id) router.push(`/(f2t)/${res.competition_id}` as any);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
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
        title: {
          flex: 1,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 22,
          color: theme.colors.text,
        },
        tabs: {
          flexDirection: 'row',
          paddingHorizontal: theme.spacing.lg,
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.sm,
        },
        tab: {
          paddingVertical: 8,
          paddingHorizontal: 14,
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
          fontSize: 13,
          color: theme.colors.textSecondary,
        },
        tabTextActive: { color: theme.colors.accent },
        content: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.md,
        },
        sectionLabel: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 14,
          color: theme.colors.text,
          marginBottom: theme.spacing.xs,
        },
        card: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        },
        cardBody: { flex: 1, gap: 4 },
        cardTitle: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 16,
          color: theme.colors.text,
        },
        cardMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
        },
        progress: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
          color: theme.colors.accent,
        },
        empty: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 14,
          color: theme.colors.textMuted,
          lineHeight: 20,
        },
        joinRow: {
          flexDirection: 'row',
          gap: theme.spacing.sm,
          alignItems: 'center',
        },
        input: {
          flex: 1,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: Platform.OS === 'web' ? 10 : 12,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 16,
          color: theme.colors.text,
          backgroundColor: theme.colors.surface,
        },
        joinBtn: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: 12,
          minWidth: 80,
          alignItems: 'center',
        },
        joinBtnText: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 14,
          color: theme.colors.white,
        },
        joinHint: {
          marginTop: theme.spacing.sm,
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
          lineHeight: 18,
        },
        createBtn: {
          alignSelf: 'flex-start',
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.accent,
        },
        createBtnText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
          color: theme.colors.accent,
        },
        createPanel: {
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        gwRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
        gwChip: {
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        gwChipActive: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        gwChipText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.textSecondary,
        },
        pendingCard: {
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          gap: 4,
        },
      }),
    [theme, insets]
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={openSidebar} hitSlop={12}>
          <Ionicons name="menu" size={26} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.title}>First2 Twenty</Text>
        <Pressable onPress={onRefresh} hitSlop={12}>
          <Ionicons name="refresh" size={22} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(['competitions', 'join', 'table'] as HomeTab[]).map((key) => (
          <Pressable
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key)}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>
              {key === 'competitions' ? 'My leagues' : key === 'join' ? 'Join' : 'Table'}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.accent} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
          }
        >
          {tab === 'competitions' ? (
            <>
              {isStaff ? (
                <View style={{ gap: theme.spacing.sm }}>
                  {showCreate ? (
                    <View style={styles.createPanel}>
                      <Text style={styles.sectionLabel}>New competition</Text>
                      <TextInput
                        style={styles.input}
                        value={createName}
                        onChangeText={setCreateName}
                        placeholder="League name"
                        placeholderTextColor={theme.colors.textMuted}
                      />
                      <TextInput
                        style={styles.input}
                        value={createEntry}
                        onChangeText={setCreateEntry}
                        placeholder="Entry fee (optional)"
                        placeholderTextColor={theme.colors.textMuted}
                      />
                      <Text style={styles.cardMeta}>Starts on gameweek</Text>
                      <View style={styles.gwRow}>
                        {gameweeks.map((gw) => (
                          <Pressable
                            key={gw.id}
                            style={[styles.gwChip, createGwId === gw.id && styles.gwChipActive]}
                            onPress={() => setCreateGwId(gw.id)}
                          >
                            <Text style={styles.gwChipText}>GW{gw.number}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <Pressable
                        style={styles.joinBtn}
                        onPress={() => void onCreate()}
                        disabled={creating}
                      >
                        {creating ? (
                          <ActivityIndicator color={theme.colors.white} size="small" />
                        ) : (
                          <Text style={styles.joinBtnText}>Create</Text>
                        )}
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable style={styles.createBtn} onPress={() => setShowCreate(true)}>
                      <Text style={styles.createBtnText}>+ Create competition</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}

              {pending.length > 0 ? (
                <View style={{ gap: theme.spacing.sm }}>
                  <Text style={styles.sectionLabel}>Pending approval</Text>
                  {pending.map((p) => (
                    <View key={p.competition_id} style={styles.pendingCard}>
                      <Text style={styles.cardTitle}>{p.name}</Text>
                      <Text style={styles.cardMeta}>Awaiting admin approval</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>My competitions</Text>
              {comps.length === 0 ? (
                <Text style={styles.empty}>
                  No leagues yet. Use Join to enter a code from your organiser.
                </Text>
              ) : (
                comps.map((c) => (
                  <Pressable
                    key={c.competition_id}
                    style={styles.card}
                    onPress={() => router.push(`/(f2t)/${c.competition_id}` as any)}
                  >
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle}>{c.name}</Text>
                      <Text style={styles.cardMeta}>
                        GW{c.start_gameweek_number} start · {c.participant_status}
                      </Text>
                      <Text style={styles.progress}>
                        {c.scored_count}/20 scored · {c.selection_count} picked
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </Pressable>
                ))
              )}
            </>
          ) : null}

          {tab === 'join' ? (
            <View>
              <Text style={styles.sectionLabel}>Competition code</Text>
              <View style={styles.joinRow}>
                <TextInput
                  style={styles.input}
                  value={code}
                  onChangeText={setCode}
                  placeholder="CODE"
                  placeholderTextColor={theme.colors.textMuted}
                  autoCapitalize="characters"
                  maxLength={6}
                  autoCorrect={false}
                />
                <Pressable style={styles.joinBtn} onPress={() => void onJoin()} disabled={joining}>
                  {joining ? (
                    <ActivityIndicator color={theme.colors.white} size="small" />
                  ) : (
                    <Text style={styles.joinBtnText}>Join</Text>
                  )}
                </Pressable>
              </View>
              <Text style={styles.joinHint}>
                Enter the 6-character code from your organiser. You can pick players once approved.
              </Text>
            </View>
          ) : null}

          {tab === 'table' ? <LeagueTablePanel refreshKey={tableRefreshKey} /> : null}

          <LmsTrademarkDisclaimer />
        </ScrollView>
      )}
    </View>
  );
}
