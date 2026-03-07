import { View, TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { useSidebar } from '@/contexts/SidebarContext';
import { AppSidebar } from '@/components/AppSidebar';

function MenuHeaderButton() {
  const theme = useTheme();
  const { openSidebar } = useSidebar();
  const isLight = theme.colors.background === lightTheme.colors.background;
  const iconColor = isLight ? theme.colors.white : theme.colors.text;
  return (
    <TouchableOpacity onPress={openSidebar} style={{ marginLeft: 12 }} hitSlop={12}>
      <Ionicons name="menu" size={24} color={iconColor} />
    </TouchableOpacity>
  );
}

import { ForceRefreshProvider } from '@/contexts/ForceRefreshContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { OnboardingProvider } from '@/contexts/OnboardingContext';

function AppTabs() {
  const theme = useTheme();
  const isLight = theme.colors.background === lightTheme.colors.background;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: isLight ? theme.colors.accent : theme.colors.background },
        headerTintColor: isLight ? theme.colors.white : theme.colors.text,
        headerTitleStyle: { fontFamily: theme.fontFamily.regular },
        headerLeft: () => <MenuHeaderButton />,
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
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
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
        name="leaderboard"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="participant-selections"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="rules"
        options={{
          title: 'Rules',
          href: null,
        }}
      />
      <Tabs.Screen
        name="points"
        options={{
          title: 'Points system',
          href: null,
        }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: 'Results',
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          href: null,
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          title: 'Reminders',
          href: null,
        }}
      />
    </Tabs>
  );
}

export default function AppLayout() {
  return (
    <ForceRefreshProvider>
      <SidebarProvider>
        <OnboardingProvider>
          <AppTabs />
          <AppSidebar />
        </OnboardingProvider>
      </SidebarProvider>
    </ForceRefreshProvider>
  );
}
