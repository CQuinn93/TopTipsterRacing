import { useEffect } from 'react';
import { Stack } from 'expo-router';

import { WcShellProvider } from '@/contexts/WcShellContext';
import { setLastRoute } from '@/lib/lastRoute';

export default function WorldCup2026Layout() {
  useEffect(() => {
    void setLastRoute('/(wc2026)/(tabs)');
  }, []);
  return (
    <WcShellProvider>
      <Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false }} />
    </WcShellProvider>
  );
}
