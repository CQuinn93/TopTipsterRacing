import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { joinCompetitionWithAccessCode } from '@/lib/joinCompetitionWithAccessCode';

export default function AccessCodeScreen() {
  const theme = useTheme();
  const { userId } = useAuth();
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase.from('profiles').select('username').eq('id', userId).maybeSingle().then(({ data }) => {
      setProfileUsername(data?.username ?? null);
      if (data?.username) setDisplayName(data.username);
    });
  }, [userId]);

  const displayNameToUse = profileUsername?.length ? profileUsername : displayName.trim();

  const handleSubmit = async () => {
    if (!userId) {
      Alert.alert('Error', 'You must be signed in.');
      return;
    }
    setLoading(true);
    try {
      const outcome = await joinCompetitionWithAccessCode({
        userId,
        code: code,
        displayNameToUse,
      });
      if (outcome.kind === 'error') {
        Alert.alert('Error', outcome.message);
        return;
      }
      if (outcome.kind === 'invalid_code') {
        Alert.alert('Invalid code', 'This access code is not recognised.');
        return;
      }
      if (outcome.kind === 'already_in') {
        Alert.alert('Already in', `You're already in "${outcome.competitionName}".`);
        router.replace('/(app)');
        return;
      }
      Alert.alert(
        'Request sent',
        `Your request to join "${outcome.competitionName}" has been sent. An admin will approve you soon.`
      );
      router.replace('/(app)');
    } finally {
      setLoading(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.background,
          justifyContent: 'center',
          padding: theme.spacing.lg,
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 24,
          color: theme.colors.text,
          textAlign: 'center',
          marginBottom: theme.spacing.xs,
        },
        subtitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
          textAlign: 'center',
          marginBottom: theme.spacing.xl,
        },
        displayNameLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.md,
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
          marginBottom: theme.spacing.md,
        },
        buttonDisabled: { opacity: 0.7 },
        buttonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          color: theme.colors.black,
          fontWeight: '600',
        },
        backText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
      }),
    [theme]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter competition</Text>
      <Text style={styles.subtitle}>Use the access code you were given</Text>

      <TextInput
        style={styles.input}
        placeholder="Access code"
        placeholderTextColor={theme.colors.textMuted}
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!loading}
      />
      {profileUsername ? (
        <Text style={styles.displayNameLabel}>You'll appear on the leaderboard as: {profileUsername}</Text>
      ) : (
        <TextInput
          style={styles.input}
          placeholder="Display name (for leaderboard)"
          placeholderTextColor={theme.colors.textMuted}
          value={displayName}
          onChangeText={setDisplayName}
          editable={!loading}
        />
      )}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={theme.colors.black} />
        ) : (
          <Text style={styles.buttonText}>Join competition</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()} disabled={loading}>
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}

