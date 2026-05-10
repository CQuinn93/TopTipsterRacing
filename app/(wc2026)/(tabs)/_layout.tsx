import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, TouchableOpacity, useColorScheme } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import { wcHref } from '@/features/wc2026/utils/href';

function HubHeaderButton() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isLight = scheme !== 'dark';
  const iconColor = isLight ? theme.colors.white : theme.colors.text;

  return (
    <TouchableOpacity onPress={() => router.replace(wcHref('/competition-hub'))} style={{ marginLeft: 12 }} hitSlop={12}>
      <Ionicons name="swap-horizontal-outline" size={22} color={iconColor} />
    </TouchableOpacity>
  );
}

export default function WorldCupTabsLayout() {
  const theme = useTheme();
  const scheme = useColorScheme();
  const isLight = scheme !== 'dark';

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: isLight ? theme.colors.accent : theme.colors.background },
        headerTintColor: isLight ? theme.colors.white : theme.colors.text,
        headerTitleStyle: { fontFamily: theme.fontFamily.regular },
        headerLeft: () => <HubHeaderButton />,
        tabBarStyle: {
          backgroundColor: theme.colors.accent,
          borderTopWidth: 0,
        },
        tabBarBackground: () => <View style={{ flex: 1, backgroundColor: theme.colors.accent }} />,
        tabBarActiveTintColor: theme.colors.white,
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.7)',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'World Cup',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="football-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="fixtures"
        options={{
          title: 'Fixtures',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
