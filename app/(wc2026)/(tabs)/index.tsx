import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { WorldCupHomeScreen } from '@/features/wc2026/screens/WorldCupHomeScreen';

export default function WorldCupIndexRoute() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/(auth)/login" />;
  return <WorldCupHomeScreen />;
}
