import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  kioskCanSetup,
  kioskListMyCompetitions,
  kioskSetFundraiserPaymentUrl,
  type KioskCompetitionOption,
} from '@/lib/kioskApi';
import {
  hashKioskPin,
  saveKioskDeviceConfig,
  sportLabel,
  type KioskSport,
} from '@/lib/kioskSession';
import { pickClubLogoImage, uploadClubLogo } from '@/lib/clubLogoStorage';

/**
 * Staff-only Hub login: Gamemaster / Owner signs in here, picks a competition,
 * sets an exit PIN, then this tablet enters always-on kiosk mode.
 */
export default function HubLoginSetupScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { userId, signOut, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [comps, setComps] = useState<KioskCompetitionOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [staffUsername, setStaffUsername] = useState<string | null>(null);
  const [clubName, setClubName] = useState<string | null>(null);
  const [clubLogoUrl, setClubLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const styles = useMemo(() => makeStyles(theme, insets), [theme, insets]);

  const selected = useMemo(
    () => comps.find((c) => c.id === selectedId) ?? null,
    [comps, selectedId]
  );

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setGateError(null);
    try {
      const [{ data: profile }, gate, list] = await Promise.all([
        supabase
          .from('profiles')
          .select('username, club_name, club_logo_url')
          .eq('id', userId)
          .maybeSingle(),
        kioskCanSetup(),
        kioskListMyCompetitions().catch(() => [] as KioskCompetitionOption[]),
      ]);
      const p = profile as {
        username?: string | null;
        club_name?: string | null;
        club_logo_url?: string | null;
      } | null;
      setStaffUsername(p?.username ?? null);
      setClubName(p?.club_name ?? null);
      setClubLogoUrl(p?.club_logo_url ?? null);
      if (!gate.success) {
        setGateError(
          gate.message ??
            'Competition Hub kiosk requires a Gamemaster plan (or Owner).'
        );
        setComps([]);
        return;
      }
      setComps(list);
      if (list.length === 1) {
        setSelectedId(list[0].id);
        setPaymentUrl(list[0].fundraiser_payment_url ?? '');
      }
    } catch (e) {
      setGateError(e instanceof Error ? e.message : 'Failed to load hub setup');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, userId, load]);

  useEffect(() => {
    if (!selected) return;
    setPaymentUrl(selected.fundraiser_payment_url ?? '');
  }, [selected?.id]);

  const onStaffSignIn = async () => {
    if (!email.trim() || !password) {
      setSignInError('Enter email and password.');
      return;
    }
    setSigningIn(true);
    setSignInError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      const { data: banned } = await (supabase as any).rpc('is_profile_banned');
      if (banned) {
        await supabase.auth.signOut();
        setSignInError('This account has been banned.');
      }
    } catch (e) {
      setSignInError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setSigningIn(false);
    }
  };

  const onUploadLogo = async () => {
    if (!userId) return;
    setUploadingLogo(true);
    try {
      const picked = await pickClubLogoImage();
      if (!picked) return;
      const url = await uploadClubLogo({
        userId,
        uri: picked.uri,
        mimeType: picked.mimeType,
        fileName: picked.fileName,
      });
      setClubLogoUrl(url);
    } catch (e) {
      Alert.alert('Logo', e instanceof Error ? e.message : 'Could not upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const onActivate = async () => {
    if (!userId || !selected) return;
    if (!selected.join_code?.trim()) {
      Alert.alert('Missing join code', 'This competition needs an active join code before hub mode.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      Alert.alert('Exit PIN', 'Choose a 4-digit PIN staff will use to leave hub mode.');
      return;
    }
    if (pin !== pinConfirm) {
      Alert.alert('Exit PIN', 'PIN confirmation does not match.');
      return;
    }

    setSaving(true);
    try {
      const urlTrim = paymentUrl.trim();
      if (urlTrim) {
        const urlRes = await kioskSetFundraiserPaymentUrl(
          selected.id,
          selected.sport as KioskSport,
          urlTrim
        );
        if (!urlRes.success) {
          Alert.alert(
            'Payment link',
            urlRes.error === 'invalid_url'
              ? 'Payment URL must start with http:// or https://'
              : urlRes.error ?? 'Could not save payment link'
          );
          return;
        }
      }

      const exitPinHash = await hashKioskPin(pin);
      const clubNameTrim = (clubName ?? '').trim() || null;
      const clubLogoTrim = (clubLogoUrl ?? '').trim() || null;

      await (supabase.from('profiles') as any)
        .update({
          club_name: clubNameTrim,
          club_logo_url: clubLogoTrim,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      await saveKioskDeviceConfig({
        version: 1,
        competitionId: selected.id,
        sport: selected.sport as KioskSport,
        competitionName: selected.name,
        joinCode: selected.join_code.trim().toUpperCase(),
        entryNote: selected.entry,
        fundraiserPaymentUrl: urlTrim || selected.fundraiser_payment_url,
        exitPinHash,
        staffUserId: userId,
        staffUsername,
        clubName: clubNameTrim,
        clubLogoUrl: clubLogoTrim,
        activatedAt: new Date().toISOString(),
      });

      await signOut();
      router.replace('/kiosk' as any);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not start hub mode');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || (loading && userId)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Competition Hub</Text>
        <Text style={styles.title}>{userId ? 'Set up this tablet' : 'Hub login'}</Text>
        <Text style={styles.intro}>
          {userId
            ? 'Lock this device to one of your competitions. Patrons will sign up or log in as themselves — your organiser account leaves the tablet after setup.'
            : 'Sign in with a Gamemaster or Owner account to lock this tablet to a competition for venue use.'}
        </Text>

        <Pressable
          style={styles.backLink}
          onPress={() => router.replace('/(auth)/login')}
          accessibilityRole="button"
          accessibilityLabel="Back to user login"
        >
          <Text style={styles.backLinkText}>← Back to user login</Text>
        </Pressable>

        {!userId ? (
          <View style={{ gap: 10 }}>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={theme.colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!signingIn}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={theme.colors.textMuted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!signingIn}
            />
            {signInError ? <Text style={styles.errorBody}>{signInError}</Text> : null}
            <Pressable
              style={[styles.primaryBtn, signingIn && styles.primaryBtnDisabled]}
              disabled={signingIn}
              onPress={() => void onStaffSignIn()}
            >
              {signingIn ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Sign in to hub</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {userId && gateError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Hub access required</Text>
            <Text style={styles.errorBody}>{gateError}</Text>
          </View>
        ) : null}

        {userId && !gateError && comps.length === 0 ? (
          <Text style={styles.muted}>
            No open competitions found under this account. Create an LMS, F2T, or Racing
            competition first, then return here.
          </Text>
        ) : null}

        {userId && !gateError && comps.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Choose competition</Text>
            {comps.map((c) => {
              const active = c.id === selectedId;
              return (
                <Pressable
                  key={`${c.sport}-${c.id}`}
                  style={[styles.compCard, active && styles.compCardActive]}
                  onPress={() => setSelectedId(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={styles.compName}>{c.name}</Text>
                  <Text style={styles.compMeta}>
                    {sportLabel(c.sport as KioskSport)} · {c.status}
                    {c.join_code ? ` · code ${c.join_code}` : ' · no join code'}
                  </Text>
                  {c.entry ? <Text style={styles.compEntry}>Entry: {c.entry}</Text> : null}
                </Pressable>
              );
            })}

            <Text style={styles.sectionLabel}>Club branding</Text>
            <Text style={styles.hint}>
              Shown on the hub header (logo on both sides). Owners can leave the club name
              blank to show “Top Tipster”.
            </Text>
            <TextInput
              style={styles.input}
              value={clubName ?? ''}
              onChangeText={setClubName}
              placeholder="Club name"
              placeholderTextColor={theme.colors.textMuted}
              editable={!saving && !uploadingLogo}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {clubLogoUrl ? (
                <Image
                  source={{ uri: clubLogoUrl }}
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    backgroundColor: theme.colors.surface,
                  }}
                  resizeMode="contain"
                />
              ) : (
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 12,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: theme.colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={styles.hint}>No logo</Text>
                </View>
              )}
              <Pressable
                style={[styles.secondaryBtn, (saving || uploadingLogo) && styles.primaryBtnDisabled]}
                disabled={saving || uploadingLogo || !userId}
                onPress={() => void onUploadLogo()}
              >
                {uploadingLogo ? (
                  <ActivityIndicator color={theme.colors.accent} />
                ) : (
                  <Text style={styles.secondaryBtnText}>
                    {clubLogoUrl ? 'Replace logo' : 'Upload logo'}
                  </Text>
                )}
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>Online payment link (optional)</Text>
            <Text style={styles.hint}>
              Club charity or payment page. Shown as a link / QR step when patrons choose
              “Pay online”.
            </Text>
            <TextInput
              style={styles.input}
              value={paymentUrl}
              onChangeText={setPaymentUrl}
              placeholder="https://…"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!saving}
            />

            <Text style={styles.sectionLabel}>Staff exit PIN</Text>
            <Text style={styles.hint}>4 digits. Needed to leave hub mode on this tablet.</Text>
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              editable={!saving}
            />
            <TextInput
              style={styles.input}
              value={pinConfirm}
              onChangeText={(t) => setPinConfirm(t.replace(/\D/g, '').slice(0, 4))}
              placeholder="Confirm PIN"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              editable={!saving}
            />

            <Pressable
              style={[styles.primaryBtn, (!selected || saving) && styles.primaryBtnDisabled]}
              disabled={!selected || saving}
              onPress={() => void onActivate()}
            >
              {saving ? (
                <ActivityIndicator color={theme.colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Start hub mode</Text>
              )}
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function makeStyles(
  theme: ReturnType<typeof useTheme>,
  insets: { top: number; bottom: number }
) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.background,
    },
    content: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: insets.top + theme.spacing.lg,
      paddingBottom: insets.bottom + theme.spacing.xl,
      gap: theme.spacing.sm,
      maxWidth: 560,
      width: '100%',
      alignSelf: 'center',
    },
    eyebrow: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 12,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: theme.colors.accent,
    },
    title: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 28,
      color: theme.colors.text,
      marginBottom: 4,
    },
    intro: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 15,
      lineHeight: 22,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
    backLink: {
      alignSelf: 'flex-start',
      paddingVertical: 6,
      marginBottom: theme.spacing.sm,
    },
    backLinkText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.accent,
    },
    errorCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.error,
      padding: theme.spacing.md,
      gap: 6,
    },
    errorTitle: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 15,
      color: theme.colors.error,
    },
    errorBody: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 14,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    muted: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 14,
      color: theme.colors.textMuted,
      lineHeight: 20,
    },
    sectionLabel: {
      marginTop: theme.spacing.md,
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 12,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
    },
    hint: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 18,
      marginBottom: 4,
    },
    compCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: 4,
    },
    compCardActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentMuted,
    },
    compName: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 17,
      color: theme.colors.text,
    },
    compMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 13,
      color: theme.colors.textMuted,
    },
    compEntry: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    input: {
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: Platform.OS === 'web' ? 14 : 12,
      fontFamily: theme.fontFamily.input,
      fontSize: 16,
      color: theme.colors.text,
    },
    primaryBtn: {
      marginTop: theme.spacing.md,
      backgroundColor: theme.colors.accent,
      borderRadius: theme.radius.md,
      paddingVertical: 16,
      alignItems: 'center',
    },
    primaryBtnDisabled: {
      opacity: 0.5,
    },
    primaryBtnText: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 16,
      color: theme.colors.white,
    },
    secondaryBtn: {
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 120,
    },
    secondaryBtnText: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
  });
}
