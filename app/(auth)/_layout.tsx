import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="access-code" />
      <Stack.Screen name="tablet-mode" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="admin-edit-selection" />
    </Stack>
  );
}
