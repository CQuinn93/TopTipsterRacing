import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, useWindowDimensions, type ViewStyle, type DimensionValue } from 'react-native';
import { useState, useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { AppLockProvider, useAppLock } from '@/contexts/AppLockContext';
import { ForceRefreshProvider } from '@/contexts/ForceRefreshContext';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { AppSidebar } from '@/components/AppSidebar';
import { AppUnlockScreen } from '@/components/AppUnlockScreen';
import { clearTabletCodeCache, getOrCreateTabletCode } from '@/lib/tabletCode';
import { clearAvailableRacesCache } from '@/lib/availableRacesCache';
import { clearLatestResultsCache } from '@/lib/latestResultsCache';
import { clearSelectionsBulkCache } from '@/lib/selectionsBulkCache';
import { supabase, getSupabaseUrl } from '@/lib/supabase';

const SIDEBAR_WIDTH = 260;
const MOBILE_BREAKPOINT = 768;

const NAV_ITEMS = [
  { href: '/(app)', label: 'Home', icon: 'home' as const },
  { href: '/(app)/selections', label: 'My Selections', icon: 'list' as const },
  { href: '/(app)/competitions', label: 'Competitions', icon: 'medal' as const },
  { href: '/(app)/results', label: 'Results', icon: 'trophy' as const },
];

const MENU_ITEMS = [
  { href: '/(app)/rules', label: 'Rules', icon: 'document-text-outline' as const },
  { href: '/(app)/points', label: 'Points System', icon: 'stats-chart-outline' as const },
  { href: '/(app)/reminders', label: 'Reminders', icon: 'notifications-outline' as const },
];

async function doSignOut(
  signOut: () => Promise<void>,
  userId: string | null,
  router: ReturnType<typeof useRouter>
) {
  await clearTabletCodeCache();
  if (userId) {
    await clearAvailableRacesCache(userId);
    await clearLatestResultsCache(userId);
    await clearSelectionsBulkCache(userId);
  }
  await signOut();
  router.replace('/(auth)/login');
}

function WebSidebar() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const isLight = String(theme.colors.background) === String(lightTheme.colors.background);

  const styles = StyleSheet.create({
    sidebar: {
      width: SIDEBAR_WIDTH,
      flexShrink: 0,
      backgroundColor: isLight ? '#ffffff' : theme.colors.surface,
      borderRightWidth: 1,
      borderRightColor: theme.colors.border,
      paddingTop: 24,
      paddingBottom: 20,
      paddingHorizontal: 12,
      shadowColor: '#000',
      shadowOffset: { width: 2, height: 0 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 4,
    },
    logo: {
      fontFamily: theme.fontFamily.regular,
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 4,
      paddingHorizontal: 8,
    },
    tagline: {
      fontFamily: theme.fontFamily.light,
      fontSize: 10,
      color: theme.colors.textSecondary,
      marginBottom: 20,
      paddingHorizontal: 8,
    },
    navSection: {
      marginBottom: 14,
    },
    navLabel: {
      fontFamily: theme.fontFamily.regular,
      fontSize: 9,
      fontWeight: '600',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 6,
      paddingHorizontal: 8,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: 8,
      marginBottom: 2,
      gap: 6,
    },
    navItemActive: {
      backgroundColor: theme.colors.accentMuted,
    },
    navItemText: {
      fontFamily: theme.fontFamily.regular,
      fontSize: 12,
      color: theme.colors.text,
    },
    navItemTextActive: {
      color: theme.colors.accent,
      fontWeight: '600',
    },
  });

  const isActive = (href: string) => {
    const target = href.replace('/(app)', '').replace(/^\/+/, '') || 'index';
    const current = String(segments[segments.length - 1] ?? 'index');
    return current === target || (target === 'index' && (current === 'index' || current === '(app)' || !current));
  };

  return (
    <View style={styles.sidebar}>
      <View style={{ flex: 1, minHeight: 0 }}>
      <Text style={styles.logo}>Top Tipster Racing</Text>
      <Text style={styles.tagline}>Fantasy racing tips</Text>
      <View style={styles.navSection}>
        <Text style={styles.navLabel}>Main</Text>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <TouchableOpacity
              key={item.href}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => router.push(item.href as any)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={20} color={active ? theme.colors.accent : theme.colors.textSecondary} />
              <Text style={[styles.navItemText, active && styles.navItemTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.navSection}>
        <Text style={styles.navLabel}>More</Text>
        {MENU_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <TouchableOpacity
              key={item.href}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => router.push(item.href as any)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={20} color={active ? theme.colors.accent : theme.colors.textSecondary} />
              <Text style={[styles.navItemText, active && styles.navItemTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      </View>
      <WebSidebarFooter />
    </View>
  );
}

function WebSidebarFooter() {
  const theme = useTheme();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { openSidebar } = useSidebar();
  const userId = session?.user?.id ?? null;
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [role, setRole] = useState<'User' | 'Admin'>('User');
  const [adminRequestPending, setAdminRequestPending] = useState(false);
  const [adminRequestLoading, setAdminRequestLoading] = useState(false);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setAccessCode(null);
      return;
    }
    getOrCreateTabletCode(userId)
      .then(setAccessCode)
      .catch(() => setAccessCode(null));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setRole('User');
      setAdminRequestPending(false);
      return;
    }
    (async () => {
      const [{ data: profile }, { data: req }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
        supabase.from('admin_access_requests').select('status').eq('user_id', userId).maybeSingle(),
      ]);
      const profileRow = profile as { role?: string } | null;
      const requestRow = req as { status?: string } | null;
      setRole(profileRow?.role === 'Admin' ? 'Admin' : 'User');
      setAdminRequestPending(requestRow?.status === 'pending');
    })();
  }, [userId]);

  const handleRequestAdmin = async () => {
    if (!userId || role === 'Admin') return;
    setAdminRequestLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_request_access');
      if (error) throw error;
      const result = data as { success?: boolean; status?: string; error?: string } | null;
      if (!result?.success) {
        window.alert(result?.error ?? 'Could not request admin access.');
        return;
      }
      if (result.status === 'already_admin') {
        setRole('Admin');
        window.alert('Your account already has admin access.');
        return;
      }
      setAdminRequestPending(true);
      window.alert('Your admin access request has been sent for approval.');
    } catch (e: unknown) {
      window.alert(e instanceof Error ? e.message : 'Could not request admin access.');
    } finally {
      setAdminRequestLoading(false);
    }
  };

  const handleSignOut = () => {
    if (typeof window !== 'undefined' && window.confirm('Are you sure you want to sign out?')) {
      doSignOut(signOut, userId, router);
    }
  };

  const handleDeleteAccount = () => {
    if (typeof window === 'undefined') return;
    if (!window.confirm('This will permanently delete your account and all your data (selections, competition entries). You will not be able to sign in again with this email. This cannot be undone. Are you sure?')) {
      return;
    }
    setDeleteAccountLoading(true);
    (async () => {
      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        const token = s?.access_token;
        if (!token) {
          window.alert('Not signed in.');
          return;
        }
        const url = `${getSupabaseUrl()}/functions/v1/delete-account`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          window.alert((body as { error?: string })?.error ?? 'Could not delete account. Try again later.');
          return;
        }
        await doSignOut(signOut, userId, router);
        window.alert('Your account has been permanently deleted.');
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Something went wrong.');
      } finally {
        setDeleteAccountLoading(false);
      }
    })();
  };

  const openAdminTools = () => {
    if (role !== 'Admin' || !accessCode) {
      window.alert('Your admin quick access code is not ready yet. Please try again in a moment.');
      return;
    }
    router.push({
      pathname: '/(auth)/admin',
      params: { code: accessCode, returnTo: '/(app)' },
    } as any);
  };

  return (
    <View style={{ marginTop: 'auto', paddingTop: 24, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
      {role === 'Admin' && (
        <View style={{ marginBottom: 8, marginHorizontal: 12, backgroundColor: theme.colors.accentMuted, borderRadius: theme.radius.sm, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.colors.accent }}>
          <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.accent, fontWeight: '700' }}>Admin</Text>
        </View>
      )}
      <View style={{ paddingVertical: 4, paddingHorizontal: 12 }}>
        <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 9, color: theme.colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Your access code
        </Text>
        {accessCode ? (
          <>
            <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 16, letterSpacing: 4, color: theme.colors.accent, fontWeight: '600' }}>
              {accessCode}
            </Text>
            {role === 'Admin' && (
              <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 10, color: theme.colors.textMuted, marginTop: 4 }}>
                This code also lets you manage competitions in Quick access.
              </Text>
            )}
          </>
        ) : (
          <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textMuted }}>…</Text>
        )}
      </View>
      {role === 'Admin' && (
        <TouchableOpacity
          onPress={openAdminTools}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 8,
            paddingHorizontal: 12,
            gap: 8,
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="construct-outline" size={18} color={theme.colors.accent} />
          <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.accent }}>
            Admin tools
          </Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={handleSignOut}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 12,
          gap: 8,
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={18} color={theme.colors.textSecondary} />
        <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textSecondary }}>
          Sign out
        </Text>
      </TouchableOpacity>

      <View style={{ paddingVertical: 4, paddingHorizontal: 12 }}>
        {role !== 'Admin' && (
          <TouchableOpacity
            onPress={handleRequestAdmin}
            disabled={adminRequestLoading || adminRequestPending}
            style={{ paddingVertical: 4 }}
            activeOpacity={0.7}
          >
            {adminRequestLoading ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 12, color: adminRequestPending ? theme.colors.textMuted : theme.colors.accent }}>
                {adminRequestPending ? 'Admin request pending' : 'Request admin access'}
              </Text>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => setAccountExpanded((e) => !e)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="person-outline" size={18} color={theme.colors.textSecondary} />
            <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textSecondary }}>
              Account
            </Text>
          </View>
          <Ionicons
            name="chevron-down"
            size={16}
            color={theme.colors.textMuted}
            style={{ transform: [{ rotate: accountExpanded ? '0deg' : '-90deg' }] }}
          />
        </TouchableOpacity>
        {accountExpanded && (
          <View style={{ paddingLeft: 28, paddingBottom: 6 }}>
            <TouchableOpacity
              onPress={handleDeleteAccount}
              disabled={deleteAccountLoading}
              style={{ paddingVertical: 4 }}
              activeOpacity={0.7}
            >
              {deleteAccountLoading ? (
                <ActivityIndicator size="small" color={theme.colors.error} />
              ) : (
                <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.error }}>
                  Delete account
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={openSidebar}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 12,
          gap: 8,
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="menu" size={18} color={theme.colors.textSecondary} />
        <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textSecondary }}>
          More options
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function MobileWebLayout() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const { openSidebar } = useSidebar();
  const insets = useSafeAreaInsets();
  const isLight = String(theme.colors.background) === String(lightTheme.colors.background);

  const currentSegment = String(segments[segments.length - 1] ?? 'index');
  const tabTitles: Record<string, string> = {
    index: 'Home',
    '(app)': 'Home',
    selections: 'My Selections',
    competitions: 'Competitions',
    results: 'Results',
  };
  const headerTitle = tabTitles[currentSegment] ?? 'Top Tipster Racing';

  const isActive = (href: string) => {
    const target = href.replace('/(app)', '').replace(/^\/+/, '') || 'index';
    return currentSegment === target || (target === 'index' && (currentSegment === 'index' || currentSegment === '(app)'));
  };

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      minHeight: '100vh' as DimensionValue,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 12,
      paddingTop: Math.max(12, insets.top),
      backgroundColor: isLight ? theme.colors.accent : theme.colors.background,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: {
      flex: 1,
      fontFamily: theme.fontFamily.regular,
      fontSize: 16,
      fontWeight: '600',
      color: isLight ? theme.colors.white : theme.colors.text,
      marginLeft: 6,
    },
    content: {
      flex: 1,
      minHeight: 0,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: theme.colors.accent,
      paddingBottom: Math.max(12, insets.bottom) + 28,
      paddingTop: 10,
      borderTopWidth: 0,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
    },
    tabLabel: {
      fontFamily: theme.fontFamily.regular,
      fontSize: 10,
      marginTop: 2,
    },
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={openSidebar} hitSlop={12} style={{ padding: 4 }}>
          <Ionicons name="menu" size={24} color={isLight ? theme.colors.white : theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
      </View>
      <View style={styles.content}>
        <Slot />
      </View>
      <View style={styles.tabBar}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const color = active ? '#ffffff' : 'rgba(255, 255, 255, 0.7)';
          return (
            <TouchableOpacity
              key={item.href}
              style={styles.tabItem}
              onPress={() => router.push(item.href as any)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={24} color={color} />
              <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <AppSidebar />
    </View>
  );
}

function WebLayoutContent() {
  const theme = useTheme();

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: theme.colors.background,
      minHeight: '100vh' as DimensionValue,
      minWidth: '100%',
    },
    main: {
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      padding: 20,
      paddingTop: 20,
    },
    content: {
      flex: 1,
      width: '100%',
      minHeight: 0,
    },
  });

  return (
    <View style={styles.wrapper as ViewStyle}>
      <WebSidebar />
      <View style={styles.main as ViewStyle}>
        <View style={[styles.content, { flex: 1 }]}>
          <Slot />
        </View>
      </View>
      <AppSidebar />
    </View>
  );
}

function AppLayoutWebContent() {
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const { isLocked } = useAppLock();
  const isNarrow = width < MOBILE_BREAKPOINT;

  return (
    <ForceRefreshProvider>
      <SidebarProvider>
        <OnboardingProvider>
          {session && isLocked ? <AppUnlockScreen /> : isNarrow ? <MobileWebLayout /> : <WebLayoutContent />}
        </OnboardingProvider>
      </SidebarProvider>
    </ForceRefreshProvider>
  );
}

export default function AppLayoutWeb() {
  return (
    <AppLockProvider>
      <AppLayoutWebContent />
    </AppLockProvider>
  );
}
