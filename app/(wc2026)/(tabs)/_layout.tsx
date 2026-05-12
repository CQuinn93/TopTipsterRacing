import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Platform, useColorScheme } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { useWcShell } from '@/contexts/WcShellContext';
import { Tabs, useSegments, router } from 'expo-router';
import { wcHref } from '@/features/wc2026/utils/href';

function WebWcHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const theme = useTheme();
  const segments = useSegments();

  const current = String(segments[segments.length - 1] ?? 'index');
  const titleMap: Record<string, string> = {
    index: 'Home',
    selections: 'My Selections',
    competitions: 'My Competitions',
    results: 'Fixtures & results',
    fixtures: 'Fixtures',
  };
  const title = titleMap[current] ?? 'Top Tipster Football';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 12,
          paddingVertical: 12,
          backgroundColor: theme.colors.background,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        },
        left: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        title: {
          flex: 1,
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '700',
          color: theme.colors.text,
          textAlign: 'center',
        },
        right: { flexDirection: 'row', alignItems: 'center' },
        iconBtn: { padding: 6 },
      }),
    [theme]
  );

  return (
    <View style={styles.header}>
      <View style={styles.left}>
        <TouchableOpacity onPress={onOpenMenu} hitSlop={12} style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="menu" size={22} color={theme.colors.text} />
        </TouchableOpacity>
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right} />
    </View>
  );
}

function WebWcTopNav() {
  const theme = useTheme();
  const segments = useSegments();
  const current = String(segments[segments.length - 1] ?? 'index');

  const isActive = (target: string) => {
    if (target === 'index') return current === 'index' || current === '(tabs)';
    return current === target;
  };

  const navItems: Array<{ key: string; label: string; icon: keyof typeof Ionicons.glyphMap; href: string }> = [
    { key: 'index', label: 'Home', icon: 'home-outline', href: wcHref('/(wc2026)/(tabs)') },
    { key: 'selections', label: 'My Selections', icon: 'list', href: wcHref('/(wc2026)/(tabs)/selections') },
    { key: 'competitions', label: 'My Competitions', icon: 'medal-outline', href: wcHref('/(wc2026)/(tabs)/competitions') },
    { key: 'results', label: 'Fixtures & results', icon: 'calendar-outline', href: wcHref('/(wc2026)/(tabs)/results') },
  ];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        bar: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.accent,
          paddingVertical: 8,
          paddingHorizontal: 6,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(0,0,0,0.12)',
        },
        item: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 6,
          borderRadius: 10,
          marginHorizontal: 4,
          gap: 3,
        },
        itemActive: {
          backgroundColor: 'rgba(255, 255, 255, 0.18)',
        },
        label: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 10,
          color: 'rgba(255, 255, 255, 0.82)',
        },
        labelActive: {
          color: theme.colors.white,
          fontWeight: '700',
        },
      }),
    [theme]
  );

  return (
    <View style={styles.bar}>
      {navItems.map((item) => {
        const active = isActive(item.key);
        return (
          <TouchableOpacity
            key={item.key}
            onPress={() => router.push(item.href as any)}
            activeOpacity={0.8}
            style={[styles.item, active && styles.itemActive]}
          >
            <Ionicons name={item.icon} size={18} color={theme.colors.white} />
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function WorldCupTabsLayout() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isLight = scheme !== 'dark';
  const isWeb = Platform.OS === 'web';
  const { openMenu } = useWcShell();

  return (
    <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: isLight ? theme.colors.accent : theme.colors.background },
          headerTintColor: isLight ? theme.colors.white : theme.colors.text,
          headerTitleStyle: { fontFamily: theme.fontFamily.regular },
          headerLeft: Platform.OS === 'web' ? undefined : () => null,
          tabBarStyle: isWeb
            ? ({ display: 'none' } as any)
            : ({
                backgroundColor: theme.colors.accent,
                borderTopWidth: 0,
              } as any),
          tabBarBackground: isWeb ? undefined : () => <View style={{ flex: 1, backgroundColor: theme.colors.accent }} />,
          tabBarActiveTintColor: theme.colors.white,
          tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.7)',
          header: isWeb
            ? () => (
                <View>
                  <WebWcHeader onOpenMenu={openMenu} />
                  <WebWcTopNav />
                </View>
              )
            : undefined,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => <Ionicons name="football-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="selections"
          options={{
            title: 'My selections',
            tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="competitions"
          options={{
            title: 'My Competitions',
            tabBarIcon: ({ color, size }) => <Ionicons name="medal" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="results"
          options={{
            title: 'Fixtures & results',
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="fixtures"
          options={{
            title: 'Fixtures',
            href: null,
          }}
        />
    </Tabs>
  );
}
