import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export default function ChangePasswordScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const email = session?.user?.email ?? '';
  const hasEmailPasswordIdentity =
    session?.user?.identities?.some((i) => i.provider === 'email') ?? false;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        scroll: { flex: 1 },
        content: {
          padding: theme.spacing.md,
          paddingBottom: theme.spacing.xxl,
          paddingTop: theme.spacing.sm,
        },
        backRow: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: theme.spacing.md,
          gap: theme.spacing.xs,
        },
        backText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.accent,
          fontWeight: '600',
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 22,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: theme.spacing.xs,
        },
        subtitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textMuted,
          lineHeight: 20,
          marginBottom: theme.spacing.lg,
        },
        label: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.xs,
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
          fontSize: 16,
          fontWeight: '600',
          color: theme.colors.black,
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

  const onSubmit = async () => {
    if (!email) {
      showMessage('Error', 'No email on your session. Please sign in again.');
      return;
    }
    if (next.length < 6) {
      showMessage('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (next !== confirm) {
      showMessage('Mismatch', 'New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      if (hasEmailPasswordIdentity) {
        if (!current) {
          showMessage('Required', 'Enter your current password.');
          setLoading(false);
          return;
        }
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email,
          password: current,
        });
        if (signErr) {
          showMessage('Wrong password', 'Current password is incorrect.');
          return;
        }
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) throw updateErr;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Your password has been updated.');
      } else {
        Alert.alert('Password updated', 'Your password has been changed.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
        setLoading(false);
        return;
      }
      router.back();
    } catch (e: unknown) {
      showMessage('Error', e instanceof Error ? e.message : 'Could not update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, theme.spacing.md) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.backRow}
          onPress={() => router.back()}
          hitSlop={12}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Change password</Text>
        <Text style={styles.subtitle}>
          {hasEmailPasswordIdentity
            ? 'Enter your current password, then choose a new one.'
            : 'Add a password so you can sign in with email as well as any linked provider.'}
        </Text>

        {hasEmailPasswordIdentity && (
          <>
            <Text style={styles.label}>Current password</Text>
            <TextInput
              style={styles.input}
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
              placeholder="Current password"
              placeholderTextColor={theme.colors.textMuted}
            />
          </>
        )}

        <Text style={styles.label}>New password</Text>
        <TextInput
          style={styles.input}
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          editable={!loading}
          placeholder="At least 6 characters"
          placeholderTextColor={theme.colors.textMuted}
        />

        <Text style={styles.label}>Confirm new password</Text>
        <TextInput
          style={styles.input}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password-new"
          editable={!loading}
          placeholder="Repeat new password"
          placeholderTextColor={theme.colors.textMuted}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => void onSubmit()}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={theme.colors.black} />
          ) : (
            <Text style={styles.buttonText}>Update password</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
