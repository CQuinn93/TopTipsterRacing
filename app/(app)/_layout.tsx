import { useEffect, useMemo } from 'react';
import { TouchableOpacity } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, NestedThemeProvider } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { withRacingAccent } from '@/constants/sportThemes';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar, SidebarProvider } from '@/contexts/SidebarContext';
import { AppSidebar } from '@/components/AppSidebar';
import { AppUnlockScreen } from '@/components/AppUnlockScreen';
import { RacingTabBar } from '@/components/RacingTabBar';
import { setLastRoute } from '@/lib/lastRoute';
import { ForceRefreshProvider } from '@/contexts/ForceRefreshContext';
import { AppLockProvider, useAppLock } from '@/contexts/AppLockContext';

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

function AppTabs() {
  const theme = useTheme();
  const isLight = theme.colors.background === lightTheme.colors.background;
  return (
    <Tabs
      tabBar={(props) => <RacingTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: isLight ? theme.colors.accent : theme.colors.background },
        headerTintColor: isLight ? theme.colors.white : theme.colors.text,
        headerTitleStyle: { fontFamily: theme.fontFamily.regular },
        headerLeft: () => <MenuHeaderButton />,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarLabel: 'Home' }} />
      <Tabs.Screen
        name="selections"
        options={{ title: 'My selections', tabBarLabel: 'Selections' }}
      />
      <Tabs.Screen
        name="competitions"
        options={{ title: 'My Competitions', tabBarLabel: 'Competitions' }}
      />
      <Tabs.Screen name="leaderboard" options={{ href: null }} />
      <Tabs.Screen name="competition/[competitionId]" options={{ href: null, title: 'Competition' }} />
      <Tabs.Screen name="participant-selections" options={{ href: null }} />
      <Tabs.Screen name="rules" options={{ title: 'Rules', href: null }} />
      <Tabs.Screen name="points" options={{ title: 'Points system', href: null }} />
      <Tabs.Screen name="results" options={{ title: 'Results', tabBarLabel: 'Results' }} />
      <Tabs.Screen name="account" options={{ href: null }} />
      <Tabs.Screen name="change-password" options={{ title: 'Change password', href: null }} />
      <Tabs.Screen name="reminders" options={{ title: 'Reminders', href: null }} />
      <Tabs.Screen name="tutorial-sandbox" options={{ title: 'Tutorial', href: null }} />
    </Tabs>
  );
}

function AppLayoutContent() {
  const { session } = useAuth();
  const { isLocked } = useAppLock();
  const baseTheme = useTheme();
  const racingTheme = useMemo(() => withRacingAccent(baseTheme), [baseTheme]);

  useEffect(() => {
    if (session) void setLastRoute('/(app)');
  }, [session?.user?.id]);

  return (
    <NestedThemeProvider theme={racingTheme}>
      <ForceRefreshProvider>
        <SidebarProvider initialVariant="racing">
          {session && isLocked ? (
            <AppUnlockScreen />
          ) : (
            <>
              <AppTabs />
              <AppSidebar />
            </>
          )}
        </SidebarProvider>
      </ForceRefreshProvider>
    </NestedThemeProvider>
  );
}

export function AppLayoutWithLock() {
  return (
    <AppLockProvider>
      <AppLayoutContent />
    </AppLockProvider>
  );
}

export default AppLayoutWithLock;
