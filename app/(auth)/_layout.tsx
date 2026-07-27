import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="admin-lms" />
      <Stack.Screen name="admin-edit-selection" />
      <Stack.Screen name="owner" />
    </Stack>
  );
}
