import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAppLock } from '@/contexts/AppLockContext';

export function AppUnlockScreen() {
  const theme = useTheme();
  const { unlock } = useAppLock();
  const [unlocking, setUnlocking] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing.lg,
          backgroundColor: theme.colors.background,
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 24,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
          textAlign: 'center',
        },
        subtitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.lg,
          textAlign: 'center',
          maxWidth: 320,
        },
        button: {
          minWidth: 220,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.accent,
          alignItems: 'center',
        },
        buttonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '600',
          color: theme.colors.black,
        },
      }),
    [theme]
  );

  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      await unlock();
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>
        {Platform.OS === 'web'
          ? 'Tap below to continue to your account.'
          : 'Use Face ID, Touch ID, or your device passcode to unlock your account.'}
      </Text>
      <TouchableOpacity style={styles.button} onPress={handleUnlock} disabled={unlocking} activeOpacity={0.8}>
        {unlocking ? (
          <ActivityIndicator color={theme.colors.black} />
        ) : (
          <Text style={styles.buttonText}>{Platform.OS === 'web' ? 'Continue' : 'Unlock account'}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
