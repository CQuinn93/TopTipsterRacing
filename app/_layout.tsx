import '../global.css';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { darkTheme } from '@/constants/theme';
import { setNotificationHandler } from '@/lib/selectionReminderNotifications';

SplashScreen.preventAutoHideAsync();

setNotificationHandler();

function RootLayoutContent() {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.colors.background === darkTheme.colors.background ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Laraz-Regular': require('../assets/fonts/LARAZ Regular.ttf'),
    'Laraz-Light': require('../assets/fonts/LARAZ Light.ttf'),
    'Polygon-Regular': require('../assets/fonts/Polygon-Regular.otf'),
    'Polygon-Italic': require('../assets/fonts/Polygon-Italic.otf'),
  });

  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (isWeb || fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [isWeb, fontsLoaded, fontError]);

  const ready = isWeb || fontsLoaded || fontError;
  if (!ready) {
    return null;
  }

  return (
    <AuthProvider>
      <ThemeProvider>
        <RootLayoutContent />
      </ThemeProvider>
    </AuthProvider>
  );
}
