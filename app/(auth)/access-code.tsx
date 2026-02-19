import { useState, useEffect } from 'react';
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
import { theme } from '@/constants/theme';

export default function AccessCodeScreen() {
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
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter the access code.');
      return;
    }
    if (!displayNameToUse) {
      Alert.alert('Error', 'Please enter your display name for the leaderboard.');
      return;
    }
    if (!userId) {
      Alert.alert('Error', 'You must be signed in.');
      return;
    }
    setLoading(true);
    try {
      const { data: comp, error: compError } = await supabase
        .from('competitions')
        .select('id, name')
        .eq('access_code', trimmed)
        .maybeSingle();

      if (compError) throw compError;
      if (!comp) {
        Alert.alert('Invalid code', 'This access code is not recognised.');
        setLoading(false);
        return;
      }

      const { data: existing } = await supabase
        .from('competition_participants')
        .select('id')
        .eq('competition_id', comp.id)
        .eq('user_id', userId)
        .maybeSingle();
      if (existing) {
        Alert.alert('Already in', `You're already in "${comp.name}".`);
        router.replace('/(app)');
        setLoading(false);
        return;
      }

      const { error: requestError } = await supabase
        .from('competition_join_requests')
        .upsert(
          {
            competition_id: comp.id,
            user_id: userId,
            display_name: displayNameToUse,
            status: 'pending',
          },
          { onConflict: 'competition_id,user_id' }
        );

      if (requestError) throw requestError;

      Alert.alert('Request sent', `Your request to join "${comp.name}" has been sent. An admin will approve you soon.`);
      router.replace('/(app)');
    } catch (e: unknown) {
      let msg = 'Failed to join competition';
      if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
        msg = (e as { message: string }).message;
      }
      if (e && typeof e === 'object' && 'details' in e && typeof (e as { details: unknown }).details === 'string') {
        msg = `${msg} (${(e as { details: string }).details})`;
      }
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

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

const styles = StyleSheet.create({
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
});
