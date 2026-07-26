import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Platform, type ViewStyle, type DimensionValue } from 'react-native';
import { useMemo } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, NestedThemeProvider } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { withRacingAccent } from '@/constants/sportThemes';
import { useAuth } from '@/contexts/AuthContext';
import { AppLockProvider, useAppLock } from '@/contexts/AppLockContext';
import { ForceRefreshProvider } from '@/contexts/ForceRefreshContext';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import { AppSidebar } from '@/components/AppSidebar';
import { AppUnlockScreen } from '@/components/AppUnlockScreen';

const SIDEBAR_WIDTH = 260;
const MOBILE_BREAKPOINT = 768;

const NAV_ITEMS = [
  { href: '/(app)', label: 'Home' },
  { href: '/(app)/selections', label: 'Selections' },
  { href: '/(app)/competitions', label: 'Competitions' },
  { href: '/(app)/results', label: 'Results' },
];

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
      fontSize: 13,
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
      fontSize: 11,
      color: theme.colors.text,
    },
    navItemTextActive: {
      color: theme.colors.accent,
      fontWeight: '600',
    },
    homeLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 'auto',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    homeLinkText: {
      fontFamily: theme.fontFamily.regular,
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.accent,
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
                <Text style={[styles.navItemText, active && styles.navItemTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <TouchableOpacity
        style={styles.homeLink}
        onPress={() => router.replace('/competition-hub')}
        activeOpacity={0.7}
      >
        <Ionicons name="home-outline" size={18} color={theme.colors.accent} />
        <Text style={styles.homeLinkText}>Return to Home</Text>
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

  const webMobileShell: ViewStyle | undefined =
    Platform.OS === 'web'
      ? {
          width: '100%',
          height: '100vh' as DimensionValue,
          maxHeight: '100vh' as DimensionValue,
          overflow: 'hidden',
        }
      : undefined;

  const styles = StyleSheet.create({
    wrapper: {
      flex: 1,
      backgroundColor: theme.colors.background,
      ...(Platform.OS !== 'web' ? { minHeight: '100vh' as DimensionValue } : {}),
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
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
      fontSize: 15,
      fontWeight: '600',
      color: isLight ? theme.colors.white : theme.colors.text,
      marginLeft: 6,
    },
    content: {
      flex: 1,
      minHeight: 0,
      overflow: 'hidden',
      paddingBottom: Math.max(12, insets.bottom),
    },
    tabBar: {
      flexDirection: 'row',
      flexShrink: 0,
      backgroundColor: theme.colors.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      paddingHorizontal: theme.spacing.sm,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 11,
      borderBottomWidth: 2,
      borderBottomColor: 'transparent',
    },
    tabItemActive: {
      borderBottomColor: theme.colors.accent,
    },
    tabLabel: {
      fontFamily: theme.fontFamily.baiMedium,
      fontSize: 12,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    tabLabelActive: {
      color: theme.colors.accent,
    },
  });

  return (
    <View style={[styles.wrapper, webMobileShell]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={openSidebar} hitSlop={12} style={{ padding: 4 }}>
          <Ionicons name="menu" size={22} color={isLight ? theme.colors.white : theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
      </View>
      <View style={styles.tabBar}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <TouchableOpacity
              key={item.href}
              style={[styles.tabItem, active && styles.tabItemActive]}
              onPress={() => router.push(item.href as any)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.content}>
        <Slot />
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
  const baseTheme = useTheme();
  const racingTheme = useMemo(() => withRacingAccent(baseTheme), [baseTheme]);
  const isNarrow = width < MOBILE_BREAKPOINT;

  return (
    <NestedThemeProvider theme={racingTheme}>
      <ForceRefreshProvider>
        <SidebarProvider initialVariant="racing">
          {session && isLocked ? <AppUnlockScreen /> : isNarrow ? <MobileWebLayout /> : <WebLayoutContent />}
        </SidebarProvider>
      </ForceRefreshProvider>
    </NestedThemeProvider>
  );
}

export default function AppLayoutWeb() {
  return (
    <AppLockProvider>
      <AppLayoutWebContent />
    </AppLockProvider>
  );
}
