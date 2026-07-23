import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { setLastRoute } from '@/lib/lastRoute';

export default function LmsLayout() {
  useEffect(() => {
    void setLastRoute('/(lms)');
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[competitionId]" />
    </Stack>
  );
}
