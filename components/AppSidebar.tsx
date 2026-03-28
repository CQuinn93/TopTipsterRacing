import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Linking,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { useAuth } from '@/contexts/AuthContext';
import { getOrCreateTabletCode } from '@/lib/tabletCode';
import { clearTabletCodeCache } from '@/lib/tabletCode';
import { clearAvailableRacesCache } from '@/lib/availableRacesCache';
import { clearLatestResultsCache } from '@/lib/latestResultsCache';
import { clearSelectionsBulkCache } from '@/lib/selectionsBulkCache';
import { supabase, getSupabaseUrl } from '@/lib/supabase';

async function doSignOut(signOut: () => Promise<void>, userId: string | null, router: ReturnType<typeof useRouter>) {
  await clearTabletCodeCache();
  if (userId) {
    await clearAvailableRacesCache(userId);
    await clearLatestResultsCache(userId);
    await clearSelectionsBulkCache(userId);
  }
  await signOut();
  router.replace('/(auth)/login');
}

export function AppSidebar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open, closeSidebar } = useSidebar();
  const { session, signOut } = useAuth();
  const userId = session?.user?.id ?? null;
  const [howItWorksExpanded, setHowItWorksExpanded] = useState(false);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [role, setRole] = useState<'User' | 'Admin'>('User');
  const [adminRequestPending, setAdminRequestPending] = useState(false);
  const [adminRequestLoading, setAdminRequestLoading] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);

  useEffect(() => {
    if (!userId || !open) return;
    getOrCreateTabletCode(userId).then(setAccessCode).catch(() => setAccessCode(null));
  }, [userId, open]);

  useEffect(() => {
    if (!userId || !open) return;
    (async () => {
      const [{ data: profile }, { data: req }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
        supabase.from('admin_access_requests').select('status').eq('user_id', userId).maybeSingle(),
      ]);
      const roleValue = (profile?.role === 'Admin' ? 'Admin' : 'User') as 'User' | 'Admin';
      setRole(roleValue);
      setAdminRequestPending(req?.status === 'pending');
    })();
  }, [userId, open]);

  const handleRequestAdmin = async () => {
    if (!userId || role === 'Admin') return;
    setAdminRequestLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_request_access');
      if (error) throw error;
      const result = data as { success?: boolean; status?: string; error?: string } | null;
      if (!result?.success) {
        Alert.alert('Error', result?.error ?? 'Could not send admin request.');
        return;
      }
      if (result.status === 'already_admin') {
        setRole('Admin');
        Alert.alert('Already admin', 'Your account already has admin access.');
        return;
      }
      setAdminRequestPending(true);
      Alert.alert('Request sent', 'Your admin access request has been sent for approval.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not request admin access.');
    } finally {
      setAdminRequestLoading(false);
    }
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to sign out?')) {
        closeSidebar();
        void doSignOut(signOut, userId, router);
      }
      return;
    }
    closeSidebar();
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => doSignOut(signOut, userId, router) },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all your data. You will not be able to sign in again. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete my account',
          style: 'destructive',
          onPress: async () => {
            setDeleteAccountLoading(true);
            try {
              const { data: { session: s } } = await supabase.auth.getSession();
              const token = s?.access_token;
              if (!token) {
                Alert.alert('Error', 'Not signed in.');
                return;
              }
              const res = await fetch(`${getSupabaseUrl()}/functions/v1/delete-account`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) {
                Alert.alert('Error', (body as { error?: string })?.error ?? 'Could not delete account.');
                return;
              }
              await doSignOut(signOut, userId, router);
              Alert.alert('Account deleted', 'Your account has been permanently deleted.');
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
            } finally {
              setDeleteAccountLoading(false);
            }
          },
        },
      ]
    );
  };

  const openAdminTools = () => {
    if (role !== 'Admin' || !accessCode) {
      Alert.alert('Admin tools unavailable', 'Your admin quick access code is not ready yet. Please try again in a moment.');
      return;
    }
    closeSidebar();
    router.push({
      pathname: '/(auth)/admin',
      params: { code: accessCode, returnTo: '/(app)' },
    });
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          flexDirection: 'row',
          justifyContent: 'flex-start',
        },
        panel: {
          width: '85%',
          maxWidth: 340,
          flex: 1,
          flexDirection: 'column',
          backgroundColor: theme.colors.surface,
          borderRightWidth: 1,
          borderRightColor: theme.colors.border,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        },
        headerTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          fontWeight: '600',
          color: theme.colors.text,
        },
        closeBtn: {
          padding: theme.spacing.xs,
        },
        buttons: {
          padding: theme.spacing.sm,
        },
        menuButton: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.background,
          borderRadius: theme.radius.sm,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          marginBottom: theme.spacing.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: theme.spacing.sm,
        },
        menuButtonText: {
          flex: 1,
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.text,
        },
        accountFolderHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.background,
          borderRadius: theme.radius.sm,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          marginBottom: theme.spacing.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: theme.spacing.sm,
        },
        accountFolderContent: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm },
        accountFolderItem: { paddingVertical: theme.spacing.sm },
        deleteAccountText: { fontFamily: theme.fontFamily.regular, fontSize: 15, color: theme.colors.error },
        footer: {
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          paddingBottom: theme.spacing.lg,
        },
        footerCodeLabel: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 },
        footerCodeValue: { fontFamily: theme.fontFamily.regular, fontSize: 18, letterSpacing: 4, color: theme.colors.accent, fontWeight: '600', marginBottom: theme.spacing.md },
      }),
    [theme]
  );

  const goTo = (path: string) => {
    closeSidebar();
    router.push(path);
  };

  const showTour = () => {
    closeSidebar();
    startGuidedTour();
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={closeSidebar}
    >
      <Pressable style={styles.backdrop} onPress={closeSidebar}>
        <Pressable style={[styles.panel, { paddingTop: insets.top }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Menu</Text>
            <TouchableOpacity onPress={closeSidebar} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.buttons} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={[styles.menuButton, styles.accountFolderHeader]}
              onPress={() => setHowItWorksExpanded((e) => !e)}
              activeOpacity={0.7}
            >
              <Ionicons name="help-circle-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>How it works</Text>
              <Ionicons
                name="chevron-down"
                size={20}
                color={theme.colors.textMuted}
                style={{ transform: [{ rotate: howItWorksExpanded ? '0deg' : '-90deg' }] }}
              />
            </TouchableOpacity>
            {howItWorksExpanded && (
              <View style={styles.accountFolderContent}>
                <TouchableOpacity
                  style={styles.accountFolderItem}
                  onPress={() => goTo('/(app)/rules')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuButtonText}>FAQs</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => goTo('/(app)/rules')}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Rules</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => goTo('/(app)/points')}
              activeOpacity={0.7}
            >
              <Ionicons name="stats-chart-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Points system</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => goTo('/(app)/reminders')}
              activeOpacity={0.7}
            >
              <Ionicons name="notifications-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Reminders</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            {role === 'Admin' && (
              <TouchableOpacity
                style={styles.menuButton}
                onPress={openAdminTools}
                activeOpacity={0.7}
              >
                <Ionicons name="construct-outline" size={22} color={theme.colors.accent} />
                <Text style={styles.menuButtonText}>Admin tools</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.menuButton, styles.accountFolderHeader]}
              onPress={() => setAccountExpanded((e) => !e)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Account</Text>
              <Ionicons
                name="chevron-down"
                size={20}
                color={theme.colors.textMuted}
                style={{ transform: [{ rotate: accountExpanded ? '0deg' : '-90deg' }] }}
              />
            </TouchableOpacity>
            {accountExpanded && (
              <View style={styles.accountFolderContent}>
                {role !== 'Admin' && (
                  <TouchableOpacity
                    style={styles.accountFolderItem}
                    onPress={handleRequestAdmin}
                    disabled={adminRequestLoading || adminRequestPending}
                    activeOpacity={0.7}
                  >
                    {adminRequestLoading ? (
                      <ActivityIndicator size="small" color={theme.colors.accent} />
                    ) : (
                      <Text style={[styles.menuButtonText, { color: adminRequestPending ? theme.colors.textMuted : theme.colors.accent }]}>
                        {adminRequestPending ? 'Admin request pending' : 'Request admin access'}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.accountFolderItem}
                  onPress={handleDeleteAccount}
                  disabled={deleteAccountLoading}
                  activeOpacity={0.7}
                >
                  {deleteAccountLoading ? (
                    <ActivityIndicator size="small" color={theme.colors.error} />
                  ) : (
                    <Text style={styles.deleteAccountText}>Delete account</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => {
                closeSidebar();
                Linking.openURL('https://doc-hosting.flycricket.io/top-tipster-racing-fantasy-sports-privacy-policy/98fbb3c4-4795-4774-bba7-c2ebb872eb92/privacy');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="shield-checkmark-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Privacy Policy</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => {
                closeSidebar();
                Linking.openURL('https://doc-hosting.flycricket.io/top-tipster-racing-terms-of-use/bf206b6c-02a2-4394-aedc-dbf95f95d955/terms');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="document-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Terms of Use</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(theme.spacing.lg, insets.bottom) }]}>
            {role === 'Admin' && (
              <View style={{ marginBottom: theme.spacing.md, backgroundColor: theme.colors.accentMuted, borderRadius: theme.radius.sm, padding: theme.spacing.sm, borderWidth: 1, borderColor: theme.colors.accent }}>
                <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.accent, fontWeight: '700' }}>Admin</Text>
              </View>
            )}
            {accessCode && (
              <View style={styles.accountFolderItem}>
                <Text style={styles.footerCodeLabel}>Your access code</Text>
                <Text style={styles.footerCodeValue}>{accessCode}</Text>
                {role === 'Admin' && (
                  <Text style={[styles.footerCodeLabel, { marginBottom: 0 }]}>This code also lets you manage competitions in Quick access.</Text>
                )}
              </View>
            )}
            <TouchableOpacity style={styles.menuButton} onPress={handleSignOut} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
