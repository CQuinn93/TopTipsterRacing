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

type TabKey = 'users' | 'competitions';

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

export default function OwnerScreen() {
  const theme = useTheme();
  const admin = useAdminAccent();
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnToRaw = String(params.returnTo ?? '/competition-hub?tab=admin').trim();
  const returnTo =
    returnToRaw === '/competition-hub' || returnToRaw.startsWith('/competition-hub')
      ? returnToRaw
      : '/competition-hub?tab=admin';

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<TabKey>('users');
  const [users, setUsers] = useState<OwnerUserRow[]>([]);
  const [comps, setComps] = useState<OwnerCompetitionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

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

  useFocusEffect(
    useCallback(() => {
      if (allowed !== true) return;
      setLoading(true);
      void load();
    }, [allowed, load])
  );

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

  return (
    <AdminScreenLayout
      sectionTitle="Owner"
      onExit={() => router.replace(returnTo as any)}
      tabs={[
        { key: 'users', label: 'Users' },
        { key: 'competitions', label: 'Competitions' },
      ]}
      activeTab={tab}
      onTabChange={(key) => setTab(key as TabKey)}
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
        ) : (
          <>
            <Text style={styles.hint}>
              Every competition across Racing and Football, with join codes. Pull to refresh.
            </Text>

            <Text style={[styles.meta, { textTransform: 'uppercase', letterSpacing: 0.8 }]}>
              Racing ({racingComps.length})
            </Text>
            {racingComps.length === 0 ? (
              <Text style={styles.empty}>No racing competitions</Text>
            ) : (
              racingComps.map((c) => (
                <View key={`racing-${c.id}`} style={styles.card}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={2}>
                      {c.name}
                    </Text>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{c.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>
                    Join code{' '}
                    <Text style={styles.code}>{c.join_code?.trim() || '—'}</Text>
                  </Text>
                  <Text style={styles.meta}>
                    {c.participant_count ?? 0} players
                    {c.creator_username ? ` · created by ${c.creator_username}` : ''}
                  </Text>
                </View>
              ))
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
              lmsComps.map((c) => (
                <View key={`lms-${c.id}`} style={styles.card}>
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
                  {c.rejoin_code ? (
                    <Text style={styles.meta}>
                      Rejoin code <Text style={styles.code}>{c.rejoin_code}</Text>
                    </Text>
                  ) : null}
                  <Text style={styles.meta}>
                    {c.active_count ?? 0} active / {c.participant_count ?? 0} total
                    {c.season ? ` · ${c.season}` : ''}
                  </Text>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </AdminScreenLayout>
  );
}
