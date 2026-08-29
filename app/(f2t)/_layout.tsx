import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { AppSidebar } from '@/components/AppSidebar';
import { setLastRoute } from '@/lib/lastRoute';
import { GameModeGate } from '@/lib/useGameModeGuard';

export default function F2tLayout() {
  useEffect(() => {
    void setLastRoute('/(f2t)');
  }, []);

  return (
    <GameModeGate mode="f2t">
      <SidebarProvider initialVariant="f2t">
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="[competitionId]" />
          <Stack.Screen name="share/[competitionId]" />
          <Stack.Screen name="rules" />
          <Stack.Screen name="how-it-works" />
        </Stack>
        <AppSidebar />
      </SidebarProvider>
    </GameModeGate>
  );
}
