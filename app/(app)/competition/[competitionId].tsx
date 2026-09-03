import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import {
  racingAdminListPendingForCompetition,
  racingApproveJoinRequest,
  racingRejectJoinRequest,
  racingDeleteCompetition,
  racingCanManageCompetition,
  type RacingJoinRequestRow,
} from '@/lib/racingAdminApi';
import { useNarrowWebCompact, cfs } from '@/lib/narrowWebTypography';

type HubTab = 'overview' | 'admin';

export default function RacingCompetitionHubScreen() {
  const theme = useTheme();
  const compact = useNarrowWebCompact();
  const params = useLocalSearchParams<{ competitionId: string }>();
  const competitionId = String(params.competitionId ?? '');

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [tab, setTab] = useState<HubTab>('overview');
  const [pending, setPending] = useState<RacingJoinRequestRow[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!competitionId) {
      setLoading(false);
      return;
    }
    try {
      const [compRes, manage] = await Promise.all([
        supabase.from('competitions').select('id, name').eq('id', competitionId).maybeSingle(),
        racingCanManageCompetition(competitionId).catch(() => false),
      ]);
      if (compRes.error) throw compRes.error;
      setName((compRes.data as { name?: string } | null)?.name ?? 'Competition');
      setCanManage(!!manage);

      if (manage) {
        const rows = await racingAdminListPendingForCompetition(competitionId);
        setPending(rows);
      } else {
        setPending([]);
        setTab((prev) => (prev === 'admin' ? 'overview' : prev));
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load competition');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [competitionId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const onApprove = async (requestId: string) => {
    setActingId(requestId);
    try {
      const res = await racingApproveJoinRequest(requestId);
      if (!res.success) {
        Alert.alert('Error', res.error ?? 'Could not approve');
        return;
      }
      setPending((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not approve');
    } finally {
      setActingId(null);
    }
  };

  const onReject = async (requestId: string) => {
    setActingId(requestId);
    try {
      const res = await racingRejectJoinRequest(requestId);
      if (!res.success) {
        Alert.alert('Error', res.error ?? 'Could not reject');
        return;
      }
      setPending((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not reject');
    } finally {
      setActingId(null);
    }
  };

  const openEditSelections = () => {
    router.push({
      pathname: '/(auth)/admin',
      params: {
        returnTo: `/(app)/competition/${competitionId}`,
      },
    });
  };

  const onDelete = () => {
    Alert.alert(
      'Delete competition?',
      `“${name}” will be permanently deleted, including participants and selections. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeleting(true);
              try {
                const res = await racingDeleteCompetition(competitionId);
                if (!res.success) {
                  Alert.alert('Could not delete', res.error ?? 'Unknown error');
                  return;
                }
                router.back();
              } catch (e) {
                Alert.alert('Error', e instanceof Error ? e.message : 'Could not delete');
              } finally {
                setDeleting(false);
              }
            })();
          },
        },
      ]
    );
  };

  const styles = useMemo(() => {
    const isLight = theme.colors.background === lightTheme.colors.background;
    const cardBorder = isLight ? theme.colors.white : theme.colors.border;
    const cardBorderWidth = isLight ? 2 : 1;
    return StyleSheet.create({
      container: { flex: 1, backgroundColor: theme.colors.background },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        gap: theme.spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
      },
      headerBtn: { padding: 6 },
      headerTitle: {
        flex: 1,
        fontFamily: theme.fontFamily.regular,
        fontSize: cfs(17, compact),
        fontWeight: '600',
        color: theme.colors.text,
      },
      content: {
        padding: compact ? theme.spacing.sm : theme.spacing.md,
        paddingBottom: theme.spacing.xxl,
      },
      tabsRow: {
        flexDirection: 'row',
        marginBottom: theme.spacing.md,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
      },
      tab: {
        flex: 1,
        paddingVertical: 11,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
      },
      tabActive: { borderBottomColor: theme.colors.accent },
      tabText: {
        fontFamily: theme.fontFamily.baiMedium,
        fontSize: cfs(13, compact),
        color: theme.colors.textMuted,
      },
      tabTextActive: { color: theme.colors.accent },
      linkCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
        padding: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        marginBottom: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      },
      linkTitle: {
        flex: 1,
        fontFamily: theme.fontFamily.regular,
        fontSize: cfs(16, compact),
        color: theme.colors.text,
        fontWeight: '600',
      },
      linkHint: {
        fontFamily: theme.fontFamily.regular,
        fontSize: cfs(12, compact),
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.md,
      },
      sectionTitle: {
        fontFamily: theme.fontFamily.regular,
        fontSize: cfs(15, compact),
        color: theme.colors.accent,
        marginBottom: theme.spacing.xs,
      },
      muted: {
        fontFamily: theme.fontFamily.regular,
        fontSize: cfs(13, compact),
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.md,
      },
      requestCard: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.sm,
      },
      requestName: {
        fontFamily: theme.fontFamily.regular,
        fontSize: cfs(15, compact),
        color: theme.colors.text,
        fontWeight: '600',
      },
      requestMeta: {
        fontFamily: theme.fontFamily.regular,
        fontSize: cfs(12, compact),
        color: theme.colors.textMuted,
        marginTop: 4,
        marginBottom: theme.spacing.sm,
      },
      actionsRow: { flexDirection: 'row', gap: theme.spacing.sm },
      approveBtn: {
        backgroundColor: theme.colors.accent,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
      },
      approveBtnText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: cfs(13, compact),
        fontWeight: '600',
        color: isLight ? theme.colors.black : theme.colors.white,
      },
      rejectBtn: {
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      rejectBtnText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: cfs(13, compact),
        color: theme.colors.textSecondary,
      },
      adminActionBtn: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
      },
      dangerBtn: {
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.error,
        padding: theme.spacing.md,
        alignItems: 'center',
        marginTop: theme.spacing.sm,
      },
      dangerBtnText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: cfs(14, compact),
        fontWeight: '600',
        color: theme.colors.error,
      },
      centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg },
    });
  }, [theme, compact]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {name || 'Competition'}
        </Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onRefresh}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : (
            <Ionicons name="refresh" size={20} color={theme.colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />
        }
      >
        <View style={styles.tabsRow}>
          {(
            [
              { key: 'overview' as const, label: 'Overview' },
              ...(canManage ? [{ key: 'admin' as const, label: 'Admin' }] : []),
            ] as const
          ).map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {tab === 'overview' ? (
          <>
            <Text style={styles.linkHint}>Open selections, the leaderboard, or results for this competition.</Text>
            <TouchableOpacity
              style={styles.linkCard}
              onPress={() =>
                router.push({ pathname: '/(app)/selections', params: { competitionId } })
              }
              activeOpacity={0.8}
            >
              <Ionicons name="checkbox-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.linkTitle}>Selections</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkCard}
              onPress={() =>
                router.push({ pathname: '/(app)/leaderboard', params: { competitionId } })
              }
              activeOpacity={0.8}
            >
              <Ionicons name="trophy-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.linkTitle}>Leaderboard</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkCard}
              onPress={() => router.push('/(app)/results')}
              activeOpacity={0.8}
            >
              <Ionicons name="list-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.linkTitle}>Results</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </>
        ) : null}

        {tab === 'admin' && canManage ? (
          <>
            <Text style={styles.sectionTitle}>Join requests</Text>
            <Text style={styles.muted}>
              {pending.length === 0
                ? 'No pending join requests.'
                : `${pending.length} waiting for approval.`}
            </Text>
            {pending.map((r) => {
              const busy = actingId === r.id;
              return (
                <View key={r.id} style={styles.requestCard}>
                  <Text style={styles.requestName}>{r.display_name || 'User'}</Text>
                  <Text style={styles.requestMeta}>
                    {r.created_at ? new Date(r.created_at).toLocaleString() : ''}
                  </Text>
                  {r.payment_method ? (
                    <Text style={styles.requestMeta}>
                      {r.payment_method === 'cash'
                        ? 'Payment: cash at collection'
                        : r.payment_method === 'online'
                          ? 'Payment: online'
                          : `Payment: ${r.payment_method}`}
                    </Text>
                  ) : null}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.approveBtn, busy && { opacity: 0.7 }]}
                      onPress={() => void onApprove(r.id)}
                      disabled={busy}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={theme.colors.black} />
                      ) : (
                        <Text style={styles.approveBtnText}>Approve</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rejectBtn, busy && { opacity: 0.7 }]}
                      onPress={() => void onReject(r.id)}
                      disabled={busy}
                    >
                      <Text style={styles.rejectBtnText}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            <Text style={[styles.sectionTitle, { marginTop: theme.spacing.md }]}>Selections</Text>
            <TouchableOpacity style={styles.adminActionBtn} onPress={openEditSelections} activeOpacity={0.8}>
              <Ionicons name="create-outline" size={22} color={theme.colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={styles.linkTitle}>Edit selections</Text>
                <Text style={styles.muted}>Open the admin editor for this competition.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Danger zone</Text>
            <Text style={styles.muted}>Permanently delete this competition and all related data.</Text>
            <TouchableOpacity
              style={[styles.dangerBtn, deleting && { opacity: 0.7 }]}
              onPress={onDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color={theme.colors.error} />
              ) : (
                <Text style={styles.dangerBtnText}>Delete competition</Text>
              )}
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
