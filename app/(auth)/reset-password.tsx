import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.background,
          justifyContent: 'center',
          padding: theme.spacing.lg,
        },
        content: {
          maxWidth: 420,
          width: '100%',
          alignSelf: 'center',
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 26,
          color: theme.colors.text,
          textAlign: 'center',
          marginBottom: theme.spacing.xs,
        },
        subtitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textMuted,
          textAlign: 'center',
          marginBottom: theme.spacing.xl,
        },
        input: {
          fontFamily: theme.fontFamily.input,
          fontSize: 16,
          color: theme.colors.text,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          marginBottom: theme.spacing.md,
        },
        button: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.md,
          alignItems: 'center',
          marginTop: theme.spacing.sm,
        },
        buttonDisabled: {
          opacity: 0.7,
        },
        buttonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 17,
          color: theme.colors.white,
          fontWeight: '600',
        },
        helper: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          textAlign: 'center',
          marginTop: theme.spacing.md,
        },
      }),
    [theme]
  );

  const showMessage = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleReset = async () => {
    const next = password.trim();
    if (next.length < 6) {
      showMessage('Password too short', 'Please use at least 6 characters.');
      return;
    }
    if (next !== confirmPassword.trim()) {
      showMessage('Passwords do not match', 'Please ensure both password fields match.');
      return;
    }

    setSaving(true);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      if (!sessionRes?.session) {
        showMessage('Reset link expired', 'Open the latest reset email and try again.');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;

      await supabase.auth.signOut();
      showMessage('Password updated', 'Your password has been reset. Please sign in with your new password.');
      router.replace('/(auth)/login');
    } catch (e: unknown) {
      showMessage('Error', e instanceof Error ? e.message : 'Could not reset password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>Enter your new password below.</Text>
        <TextInput
          style={styles.input}
          placeholder="New password"
          placeholderTextColor={theme.colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!saving}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm new password"
          placeholderTextColor={theme.colors.textMuted}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          editable={!saving}
        />
        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleReset}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.buttonText}>Save new password</Text>}
        </TouchableOpacity>
        <Text style={styles.helper}>If this page says your link expired, request a new reset email from sign in.</Text>
      </View>
    </View>
  );
}
