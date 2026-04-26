import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, TouchableOpacity } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { router } from 'expo-router';

function HubHeaderButton() {
  const theme = useTheme();
  const isLight = theme.colors.background === lightTheme.colors.background;
  const iconColor = isLight ? theme.colors.white : theme.colors.text;

  return (
    <TouchableOpacity onPress={() => router.replace('/competition-hub')} style={{ marginLeft: 12 }} hitSlop={12}>
      <Ionicons name="swap-horizontal-outline" size={22} color={iconColor} />
    </TouchableOpacity>
  );
}

export default function WorldCupTabsLayout() {
  const theme = useTheme();
  const isLight = theme.colors.background === lightTheme.colors.background;

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
