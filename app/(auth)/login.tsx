import { useState, useMemo, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
  ImageBackground,
  useColorScheme,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LOGIN_BACKGROUND = require('../../assets/Background.png');

export default function LoginScreen() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        bg: {
          flex: 1,
        },
        bgGradient: {
          ...StyleSheet.absoluteFillObject,
        },
        container: {
          flex: 1,
          padding: theme.spacing.lg,
          paddingTop: Math.max(theme.spacing.lg, insets.top + theme.spacing.sm),
          paddingBottom: Math.max(theme.spacing.lg, insets.bottom + theme.spacing.sm),
        },
        content: {
          flex: 1,
          maxWidth: 400,
          width: '100%',
          alignSelf: 'center',
        },
        formArea: {
          marginTop: 'auto',
        },
        wordmarkBlock: {
          alignItems: 'center',
          marginBottom: theme.spacing.xl,
        },
        wordmarkTop: {
          fontFamily: theme.fontFamily.swish,
          fontSize: Platform.OS === 'web' ? 40 : 48,
          color: theme.colors.text,
          textAlign: 'center',
          marginBottom: theme.spacing.xs,
          letterSpacing: Platform.OS === 'web' ? 1 : 1.2,
          textShadowColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 6,
        },
        wordmarkSub: {
          fontFamily: theme.fontFamily.regular,
          fontSize: Platform.OS === 'web' ? 14 : 15,
          fontWeight: '700',
          color: theme.colors.accent,
          textAlign: 'center',
          marginTop: 8,
          letterSpacing: Platform.OS === 'web' ? 6 : 7,
          textShadowColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.75)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        },
        input: {
          fontFamily: theme.fontFamily.input,
          /* ≥16px avoids iOS Safari auto-zoom on focus; web also enforced in global.css */
          fontSize: 16,
          color: theme.colors.text,
          backgroundColor: isDark ? 'rgba(20, 20, 20, 0.92)' : 'rgba(255, 255, 255, 0.94)',
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          marginBottom: theme.spacing.md,
        },
        passwordField: {
          position: 'relative' as const,
          marginBottom: theme.spacing.md,
        },
        passwordInput: {
          marginBottom: 0,
          paddingRight: 48,
        },
        passwordToggle: {
          position: 'absolute' as const,
          right: 4,
          top: 0,
          bottom: 0,
          width: 44,
          justifyContent: 'center',
          alignItems: 'center',
        },
        button: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.md,
          alignItems: 'center',
          marginTop: theme.spacing.sm,
          marginBottom: theme.spacing.md,
        },
        buttonDisabled: {
          opacity: 0.7,
        },
        buttonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          color: theme.colors.white,
          fontWeight: '600',
        },
        switchText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.accent,
          textAlign: 'center',
        },
        switchTextWrap: {
          marginTop: theme.spacing.lg,
        },
        forgotPasswordText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textSecondary,
          textAlign: 'center',
          textDecorationLine: 'underline',
          marginTop: theme.spacing.sm,
        },
        policyRow: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginTop: theme.spacing.lg,
          marginBottom: theme.spacing.sm,
        },
        policyLink: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
          textDecorationLine: 'underline',
        },
        tabletModeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        },
        quickAccessCard: {
          marginTop: 'auto',
          marginBottom: Math.max(theme.spacing.sm, insets.bottom),
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.accentDim,
        },
        tabletModeButton: {
          flex: 1,
          backgroundColor: 'rgba(255, 255, 255, 0.16)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.35)',
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabletModeButtonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.white,
        },
        tabletModeInfoHit: {
          padding: theme.spacing.xs,
        },
        quickAccessTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: 'rgba(255,255,255,0.85)',
          marginBottom: theme.spacing.sm,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        },
      }),
    [theme, insets.bottom, insets.top, isDark]
  );

  const bgGradientColors = isDark
    ? (['rgba(10, 10, 10, 0.42)', 'rgba(10, 10, 10, 0.72)', 'rgba(10, 10, 10, 0.9)'] as const)
    : (['rgba(250, 250, 250, 0.5)', 'rgba(250, 250, 250, 0.78)', 'rgba(250, 250, 250, 0.92)'] as const);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
      const id = requestAnimationFrame(() => {
        window.scrollTo(0, 0);
      });
      return () => cancelAnimationFrame(id);
    }, [])
  );

  const WEB_VIEWPORT =
    'width=device-width, initial-scale=1, minimum-scale=1, shrink-to-fit=no, viewport-fit=cover';

  /** On refresh / direct load, re-apply viewport + scroll top so mobile browsers don’t stay at a stale zoom. */
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined') return;
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.setAttribute('content', WEB_VIEWPORT);
    }
    window.scrollTo(0, 0);
  }, []);

  const resetWebZoomChrome = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const el = document.activeElement;
    if (el && 'blur' in el && typeof (el as HTMLElement).blur === 'function') {
      (el as HTMLElement).blur();
    }
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  };

  const handleAuth = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }
    if (isSignUp && !username.trim()) {
      Alert.alert('Error', 'Please choose a username for the leaderboard.');
      return;
    }
    const trimmedUsername = username.trim().toLowerCase().replace(/\s+/g, '');
    if (isSignUp && trimmedUsername.length < 2) {
      Alert.alert('Error', 'Username must be at least 2 characters.');
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { data: signUpData, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (signUpData.user) {
          const profilePayload = {
            id: signUpData.user.id,
            username: trimmedUsername,
            updated_at: new Date().toISOString(),
          };
          const { error: profileError } = await supabase
            .from('profiles')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client infers insert as never when Database generic is used
            .insert(profilePayload as any);
          if (profileError) {
            if (profileError.code === '23505') {
              Alert.alert('Username taken', 'That username is already in use. Please choose another.');
            } else {
              throw profileError;
            }
            setLoading(false);
            return;
          }
        }
        Alert.alert('You\'re in', 'Account created. Sign in to continue.');
        setIsSignUp(false);
        setUsername('');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        resetWebZoomChrome();
        router.replace('/competition-hub');
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (title: string, message: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();
    router.push({
      pathname: '/(auth)/forgot-password',
      params: trimmedEmail ? { email: trimmedEmail } : undefined,
    });
  };

  return (
    <ImageBackground source={LOGIN_BACKGROUND} style={styles.bg} resizeMode="cover">
      <LinearGradient
        colors={[...bgGradientColors]}
        locations={[0, 0.42, 1]}
        style={styles.bgGradient}
        pointerEvents="none"
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View style={styles.content}>
        <View style={styles.formArea}>
          <View style={styles.wordmarkBlock}>
            <Text style={styles.wordmarkTop} accessibilityRole="header">
              Top Tipster
            </Text>
            <Text style={styles.wordmarkSub}>SPORTS</Text>
          </View>

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
          <View style={styles.passwordField}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor={theme.colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!passwordVisible}
              editable={!loading}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              autoComplete="password"
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setPasswordVisible((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={theme.colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          {isSignUp && (
            <TextInput
              style={styles.input}
              placeholder="Username (for leaderboard)"
              placeholderTextColor={theme.colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={theme.colors.white} />
            ) : (
              <Text style={styles.buttonText}>{isSignUp ? 'Sign up' : 'Sign in'}</Text>
            )}
          </TouchableOpacity>

          {!isSignUp && (
            <TouchableOpacity onPress={handleForgotPassword} disabled={loading || resetLoading}>
              <Text style={styles.forgotPasswordText}>{resetLoading ? 'Sending reset email...' : 'Forgot password?'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.switchTextWrap} onPress={() => setIsSignUp(!isSignUp)} disabled={loading}>
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.policyRow}>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://doc-hosting.flycricket.io/top-tipster-racing-fantasy-sports-privacy-policy/98fbb3c4-4795-4774-bba7-c2ebb872eb92/privacy')}
            disabled={loading}
          >
            <Text style={styles.policyLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://doc-hosting.flycricket.io/top-tipster-racing-terms-of-use/bf206b6c-02a2-4394-aedc-dbf95f95d955/terms')}
            disabled={loading}
          >
            <Text style={styles.policyLink}>Terms of Use</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.quickAccessCard}>
          <Text style={styles.quickAccessTitle}>Quick access</Text>
          <View style={styles.tabletModeRow}>
          <TouchableOpacity
            style={styles.tabletModeButton}
            onPress={() => router.push('/(auth)/tablet-mode')}
            disabled={loading}
          >
            <Text style={styles.tabletModeButtonText}>Quick access</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tabletModeInfoHit}
            onPress={() =>
              Alert.alert(
                'Quick access',
                "You'll need your 6-digit quick access code on the next screen.\n\nYou must have an account to use this feature.",
                [{ text: 'OK' }]
              )
            }
            disabled={loading}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="information-circle-outline" size={24} color={theme.colors.white} />
          </TouchableOpacity>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

