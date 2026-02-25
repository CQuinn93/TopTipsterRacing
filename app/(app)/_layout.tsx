import { useRef } from 'react';
import { Pressable, Alert, TouchableOpacity } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useSidebar } from '@/contexts/SidebarContext';
import { AppSidebar } from '@/components/AppSidebar';

function MenuHeaderButton() {
  const { openSidebar } = useSidebar();
  return (
    <TouchableOpacity onPress={openSidebar} style={{ marginLeft: 12 }} hitSlop={12}>
      <Ionicons name="menu" size={24} color={theme.colors.text} />
    </TouchableOpacity>
  );
}

function SelectionsTabButton(props: React.ComponentProps<typeof Pressable>) {
  const router = useRouter();
  return (
    <Pressable
      {...props}
      onPress={() => {
        router.replace('/(app)/selections');
      }}
    />
  );
}
import { useAuth } from '@/contexts/AuthContext';
import { ForceRefreshProvider, useForceRefresh } from '@/contexts/ForceRefreshContext';
import { clearAvailableRacesCache } from '@/lib/availableRacesCache';
import { clearLatestResultsCache } from '@/lib/latestResultsCache';
import { SidebarProvider } from '@/contexts/SidebarContext';

const HOME_TAB_HOLD_MS = 10_000;

function HomeTabButton(props: React.ComponentProps<typeof Pressable> & { onPress?: () => void }) {
  const { userId } = useAuth();
  const { triggerHomeForceRefresh } = useForceRefresh();
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePressIn = () => {
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (userId) {
        clearAvailableRacesCache(userId);
        clearLatestResultsCache(userId);
        triggerHomeForceRefresh();
        Alert.alert('Cache cleared', 'Home cache cleared. Data will refresh.');
      }
    }, HOME_TAB_HOLD_MS);
  };

  const handlePressOut = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  return (
    <Pressable
      {...props}
      onPressIn={(e) => {
        handlePressIn();
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        handlePressOut();
        props.onPressOut?.(e);
      }}
      onPress={props.onPress}
    />
  );
}

function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontFamily: theme.fontFamily.regular },
        headerLeft: () => <MenuHeaderButton />,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          tabBarButton: (props) => <HomeTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="selections"
        options={{
          title: 'My selections',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
          tabBarButton: (props) => <SelectionsTabButton {...props} />,
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
          href: null,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function AppLayout() {
  return (
    <ForceRefreshProvider>
      <SidebarProvider>
        <AppTabs />
        <AppSidebar />
      </SidebarProvider>
    </ForceRefreshProvider>
  );
}
