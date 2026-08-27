import { useEffect, useMemo } from 'react';
import { TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, NestedThemeProvider } from '@/contexts/ThemeContext';
import { withRacingUi } from '@/constants/sportThemes';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar, SidebarProvider } from '@/contexts/SidebarContext';
import { AppSidebar } from '@/components/AppSidebar';
import { AppUnlockScreen } from '@/components/AppUnlockScreen';
import { setLastRoute } from '@/lib/lastRoute';
import { ForceRefreshProvider } from '@/contexts/ForceRefreshContext';
import { AppLockProvider, useAppLock } from '@/contexts/AppLockContext';

function MenuHeaderButton() {
  const theme = useTheme();
  const { openSidebar } = useSidebar();
  return (
    <TouchableOpacity onPress={openSidebar} style={{ marginLeft: 12 }} hitSlop={12}>
      <Ionicons name="menu" size={24} color={theme.colors.text} />
    </TouchableOpacity>
  );
}

function AppStack() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontFamily: theme.fontFamily.baiBold, fontSize: 17 },
        headerShadowVisible: false,
        headerLeft: () => <MenuHeaderButton />,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="selections" options={{ title: 'Selections' }} />
      <Stack.Screen name="competitions" options={{ title: 'Competitions' }} />
      <Stack.Screen name="results" options={{ title: 'Results' }} />
      <Stack.Screen name="leaderboard" options={{ title: 'Leaderboard' }} />
      <Stack.Screen name="competition/[competitionId]" options={{ title: 'Competition' }} />
      <Stack.Screen name="participant-selections" options={{ title: 'Selections' }} />
      <Stack.Screen name="rules" options={{ title: 'Rules' }} />
      <Stack.Screen name="points" options={{ title: 'Points system' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="change-password" options={{ title: 'Change password' }} />
      <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
      <Stack.Screen name="tutorial-sandbox" options={{ title: 'Tutorial' }} />
    </Stack>
  );
}

function AppLayoutContent() {
  const { session } = useAuth();
  const { isLocked } = useAppLock();
  const baseTheme = useTheme();
  const racingTheme = useMemo(() => withRacingUi(baseTheme), [baseTheme]);

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
              <AppStack />
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
