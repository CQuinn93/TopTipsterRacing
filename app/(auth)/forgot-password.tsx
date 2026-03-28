import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { getSupabaseUrl, supabase } from '@/lib/supabase';

type RequestResetResponse = {
  success?: boolean;
  error?: string;
};

type ConfirmResetResponse = {
  success?: boolean;
  error?: string;
};

async function callResetFunction<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${getSupabaseUrl()}/functions/v1/${path}`;
  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const err = (data as { error?: string })?.error ?? 'Request failed';
    throw new Error(err);
  }
  return data;
}

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(String(params.email ?? ''));
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [loading, setLoading] = useState(false);

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
        buttonDisabled: { opacity: 0.7 },
        buttonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 17,
          color: theme.colors.white,
          fontWeight: '600',
        },
        linkText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.accent,
          textAlign: 'center',
          marginTop: theme.spacing.md,
          textDecorationLine: 'underline',
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

  const requestCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      showMessage('Email required', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const data = await callResetFunction<RequestResetResponse>('request-reset-code', { email: trimmedEmail });
      if (!data?.success) {
        throw new Error(data?.error ?? 'Could not send reset code.');
      }
      setStep('verify');
      showMessage('Code sent', 'If this email exists, a reset code has been sent.');
    } catch (e: unknown) {
      showMessage('Error', e instanceof Error ? e.message : 'Could not send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();
    if (!trimmedEmail) {
      showMessage('Email required', 'Please enter your email address.');
      return;
    }
    if (trimmedCode.length < 6) {
      showMessage('Code required', 'Please enter the 6-digit reset code.');
      return;
    }
    if (newPassword.trim().length < 6) {
      showMessage('Password too short', 'Please use at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage('Passwords do not match', 'Please ensure both password fields match.');
      return;
    }

    setLoading(true);
    try {
      const data = await callResetFunction<ConfirmResetResponse>('confirm-reset-code', {
        email: trimmedEmail,
        code: trimmedCode,
        newPassword: newPassword.trim(),
      });
      if (!data?.success) {
        throw new Error(data?.error ?? 'Could not reset password.');
      }
      await supabase.auth.signOut();
      showMessage('Password updated', 'Your password has been reset. Please sign in with your new password.');
      router.replace('/(auth)/login');
    } catch (e: unknown) {
      showMessage('Error', e instanceof Error ? e.message : 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Forgot password</Text>
        <Text style={styles.subtitle}>
          {step === 'request'
            ? 'Enter your email and we will send a reset code.'
            : 'Enter the code from your email and choose a new password.'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={theme.colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />

        {step === 'verify' && (
          <>
            <TextInput
              style={styles.input}
              placeholder="6-digit code"
              placeholderTextColor={theme.colors.textMuted}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoCapitalize="none"
              editable={!loading}
              maxLength={6}
            />
            <TextInput
              style={styles.input}
              placeholder="New password"
              placeholderTextColor={theme.colors.textMuted}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor={theme.colors.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!loading}
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          disabled={loading}
          onPress={step === 'request' ? requestCode : confirmReset}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.white} />
          ) : (
            <Text style={styles.buttonText}>
              {step === 'request' ? 'Send reset code' : 'Verify code & reset password'}
            </Text>
          )}
        </TouchableOpacity>

        {step === 'verify' && (
          <TouchableOpacity disabled={loading} onPress={requestCode}>
            <Text style={styles.linkText}>Resend code</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity disabled={loading} onPress={() => router.replace('/(auth)/login')}>
          <Text style={styles.linkText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
