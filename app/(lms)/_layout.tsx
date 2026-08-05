import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { setLastRoute } from '@/lib/lastRoute';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { AppSidebar } from '@/components/AppSidebar';

export default function LmsLayout() {
  useEffect(() => {
    void setLastRoute('/(lms)');
  }, []);

  return (
    <SidebarProvider initialVariant="lms">
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="[competitionId]" />
        <Stack.Screen name="rules" />
        <Stack.Screen name="how-it-works" />
        <Stack.Screen name="table" />
      </Stack>
      <AppSidebar />
    </SidebarProvider>
  );
}
