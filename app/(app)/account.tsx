import { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
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

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.email} numberOfLines={1}>{session?.user?.email ?? '—'}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.label}>Tablet mode code</Text>
        <Text style={styles.hint}>Use this code on a shared device to make selections without logging in. Hold Sign in for 7s on the login screen to open tablet mode.</Text>
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
    </View>
  );
}
