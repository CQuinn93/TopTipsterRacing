import { useRef } from 'react';
import { View, Pressable, Alert, TouchableOpacity } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
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
import { OnboardingProvider } from '@/contexts/OnboardingContext';

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
