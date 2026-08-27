import { View, StyleSheet, useWindowDimensions, Platform, type ViewStyle, type DimensionValue } from 'react-native';
import { useMemo } from 'react';
import { Slot } from 'expo-router';
import { useTheme, NestedThemeProvider } from '@/contexts/ThemeContext';
import { withRacingUi } from '@/constants/sportThemes';
import { useAuth } from '@/contexts/AuthContext';
import { AppLockProvider, useAppLock } from '@/contexts/AppLockContext';
import { ForceRefreshProvider } from '@/contexts/ForceRefreshContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { AppSidebar } from '@/components/AppSidebar';
import { AppUnlockScreen } from '@/components/AppUnlockScreen';

/**
 * Web racing shell — LMS-style: no top tab strip.
 * Home owns the Top Tipster Racing header; other screens use Stack headers from native layout
 * via the shared Slot. Burger menu covers Results / Rules / etc.
 */
function WebShell() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const webShell: ViewStyle | undefined =
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
      ...(isWide
        ? {
            paddingHorizontal: 24,
            paddingTop: 20,
            paddingBottom: 20,
          }
        : null),
    },
    content: {
      flex: 1,
      minHeight: 0,
      width: '100%',
      ...(isWide ? { maxWidth: 960, alignSelf: 'center' as const } : null),
    },
  });

  return (
    <View style={[styles.wrapper, webShell]}>
      <View style={styles.content}>
        <Slot />
      </View>
      <AppSidebar />
    </View>
  );
}

function AppLayoutWebContent() {
  const { session } = useAuth();
  const { isLocked } = useAppLock();
  const baseTheme = useTheme();
  const racingTheme = useMemo(() => withRacingUi(baseTheme), [baseTheme]);

  return (
    <NestedThemeProvider theme={racingTheme}>
      <ForceRefreshProvider>
        <SidebarProvider initialVariant="racing">
          {session && isLocked ? <AppUnlockScreen /> : <WebShell />}
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
