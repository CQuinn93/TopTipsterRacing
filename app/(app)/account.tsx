import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase, getSupabaseUrl } from '@/lib/supabase';
import { getOrCreateTabletCode, clearTabletCodeCache } from '@/lib/tabletCode';
import { clearAvailableRacesCache } from '@/lib/availableRacesCache';
import { clearLatestResultsCache } from '@/lib/latestResultsCache';
import { clearSelectionsBulkCache } from '@/lib/selectionsBulkCache';

async function doSignOut(signOut: () => Promise<void>, userId: string | null) {
  await clearTabletCodeCache();
  if (userId) {
    await clearAvailableRacesCache(userId);
    await clearLatestResultsCache(userId);
    await clearSelectionsBulkCache(userId);
  }
  await signOut();
  router.replace('/(auth)/login');
}

export default function AccountScreen() {
  const theme = useTheme();
  const { session, signOut } = useAuth();
  const userId = session?.user?.id ?? null;
  const [tabletCode, setTabletCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(true);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg },
        section: { marginBottom: theme.spacing.xl },
        label: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 },
        email: { fontFamily: theme.fontFamily.input, fontSize: 16, color: theme.colors.text },
        hint: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
        codeLoader: { marginVertical: theme.spacing.sm },
        tabletCode: { fontFamily: theme.fontFamily.input, fontSize: 28, letterSpacing: 6, color: theme.colors.accent },
        muted: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.textMuted },
        button: {
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.md,
          alignItems: 'center',
        },
        buttonText: { fontFamily: theme.fontFamily.regular, fontSize: 16, color: theme.colors.text },
        bottomSpacer: { flex: 1, minHeight: theme.spacing.lg },
        deleteTextButton: {
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: 0,
          alignSelf: 'center',
        },
        deleteButtonText: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.error },
      }),
    [theme]
  );

  useEffect(() => {
    if (!session?.user?.id) return;
    getOrCreateTabletCode(session.user.id)
      .then(setTabletCode)
      .catch(() => setTabletCode(null))
      .finally(() => setCodeLoading(false));
  }, [session?.user?.id]);

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) {
        doSignOut(signOut, userId);
      }
      return;
    }
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => doSignOut(signOut, userId),
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This will permanently delete your account and all your data (selections, competition entries). You will not be able to sign in again with this email. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete my account',
          style: 'destructive',
          onPress: async () => {
            setDeleteAccountLoading(true);
            try {
              const { data: { session: s } } = await supabase.auth.getSession();
              const token = s?.access_token;
              if (!token) {
                Alert.alert('Error', 'Not signed in.');
                return;
              }
              const url = `${getSupabaseUrl()}/functions/v1/delete-account`;
              const res = await fetch(url, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });
              const body = await res.json().catch(() => ({}));
              if (!res.ok) {
                Alert.alert('Error', (body as { error?: string })?.error ?? 'Could not delete account. Try again later.');
                return;
              }
              await doSignOut(signOut, userId);
              if (Platform.OS !== 'web') {
                Alert.alert('Account deleted', 'Your account has been permanently deleted.');
              }
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong.');
            } finally {
              setDeleteAccountLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.email} numberOfLines={1}>{session?.user?.email ?? '—'}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Quick access code</Text>
        <Text style={styles.hint}>Use this code on a shared device to make selections without logging in.</Text>
        {codeLoading ? (
          <ActivityIndicator size="small" color={theme.colors.accent} style={styles.codeLoader} />
        ) : tabletCode ? (
          <Text style={styles.tabletCode}>{tabletCode}</Text>
        ) : (
          <Text style={styles.muted}>Unable to load code</Text>
        )}
      </View>
      <TouchableOpacity style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </TouchableOpacity>
      <View style={styles.bottomSpacer} />
      <TouchableOpacity
        style={styles.deleteTextButton}
        onPress={handleDeleteAccount}
        disabled={deleteAccountLoading}
      >
        {deleteAccountLoading ? (
          <ActivityIndicator size="small" color={theme.colors.error} />
        ) : (
          <Text style={styles.deleteButtonText}>Delete account</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
