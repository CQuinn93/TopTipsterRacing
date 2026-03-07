import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { ForceRefreshProvider } from '@/contexts/ForceRefreshContext';
import { SidebarProvider, useSidebar } from '@/contexts/SidebarContext';
import { OnboardingProvider } from '@/contexts/OnboardingContext';
import { AppSidebar } from '@/components/AppSidebar';

const SIDEBAR_WIDTH = 260;
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
  { href: '/(app)/account', label: 'Account', icon: 'person-outline' as const },
];

function WebSidebar() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const isLight = theme.colors.background === lightTheme.colors.background;

  const styles = StyleSheet.create({
    sidebar: {
      width: SIDEBAR_WIDTH,
      backgroundColor: isLight ? '#ffffff' : theme.colors.surface,
      borderRightWidth: 1,
      borderRightColor: theme.colors.border,
      paddingTop: 28,
      paddingBottom: 24,
      paddingHorizontal: 16,
      shadowColor: '#000',
      shadowOffset: { width: 2, height: 0 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 4,
    },
    logo: {
      fontFamily: theme.fontFamily.regular,
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 8,
      paddingHorizontal: 12,
    },
    tagline: {
      fontFamily: theme.fontFamily.light,
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginBottom: 32,
      paddingHorizontal: 12,
    },
    navSection: {
      marginBottom: 24,
    },
    navLabel: {
      fontFamily: theme.fontFamily.regular,
      fontSize: 11,
      fontWeight: '600',
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
      paddingHorizontal: 12,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      marginBottom: 4,
      gap: 12,
    },
    navItemActive: {
      backgroundColor: theme.colors.accentMuted,
    },
    navItemText: {
      fontFamily: theme.fontFamily.regular,
      fontSize: 15,
      color: theme.colors.text,
    },
    navItemTextActive: {
      color: theme.colors.accent,
      fontWeight: '600',
    },
  });

  const isActive = (href: string) => {
    const target = href.replace('/(app)', '').replace(/^\/+/, '') || 'index';
    const current = segments[segments.length - 1] ?? 'index';
    return current === target || (target === 'index' && (current === 'index' || !current));
  };

  return (
    <View style={[styles.sidebar, { flex: 1 }]}>
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
              <Ionicons name={item.icon} size={22} color={active ? theme.colors.accent : theme.colors.textSecondary} />
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
  const { openSidebar } = useSidebar();
  return (
    <View style={{ marginTop: 'auto', paddingTop: 24, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
      <TouchableOpacity
        onPress={openSidebar}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 12,
          gap: 12,
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="menu" size={20} color={theme.colors.textSecondary} />
        <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textSecondary }}>
          More options
        </Text>
      </TouchableOpacity>
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
      minHeight: '100vh',
      minWidth: '100%',
    },
    main: {
      flex: 1,
      minWidth: 0,
      padding: 32,
      paddingTop: 24,
    },
    content: {
      maxWidth: 880,
      width: '100%',
      marginLeft: 'auto',
      marginRight: 'auto',
    },
  });

  return (
    <View style={styles.wrapper}>
      <WebSidebar />
      <View style={styles.main}>
        <View style={styles.content}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="selections" />
            <Stack.Screen name="competitions" />
            <Stack.Screen name="results" />
            <Stack.Screen name="leaderboard" />
            <Stack.Screen name="participant-selections" />
            <Stack.Screen name="rules" />
            <Stack.Screen name="points" />
            <Stack.Screen name="account" />
            <Stack.Screen name="reminders" />
          </Stack>
        </View>
      </View>
      <AppSidebar />
    </View>
  );
}

export default function AppLayoutWeb() {
  return (
    <ForceRefreshProvider>
      <SidebarProvider>
        <OnboardingProvider>
          <WebLayoutContent />
        </OnboardingProvider>
      </SidebarProvider>
    </ForceRefreshProvider>
  );
}
