import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { isDesktopWebForOwnerTools } from '@/lib/clubLogoStorage';
import { GamemasterCustomPricingPanel } from '@/components/GamemasterCustomPricingPanel';
import { ownerRegisterGamemaster, type OwnerUserRow } from '@/lib/ownerApi';
import type { LeagueBillInput, LeagueBillQuote } from '@/lib/gamemasterCustomPricing';

type Props = {
  users: OwnerUserRow[];
  usersLoading?: boolean;
  accent?: string;
  onRegistered?: () => void;
};

export function OwnerGamemasterOnboardingPanel({
  users,
  usersLoading,
  accent,
  onRegistered,
}: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const desktopOk = isDesktopWebForOwnerTools(width);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [licenses, setLicenses] = useState('1');
  const [attachedQuote, setAttachedQuote] = useState<LeagueBillQuote | null>(null);
  const [attachedQuoteInput, setAttachedQuoteInput] = useState<LeagueBillInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const candidates = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users
      .filter((u) => u.role !== 'Owner')
      .filter((u) => {
        if (!q) return true;
        return (
          (u.username ?? '').toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 40);
  }, [users, userQuery]);

  const selected = users.find((u) => u.id === selectedUserId) ?? null;

  if (!desktopOk) {
    return (
      <View style={styles.gateCard}>
        <Text style={styles.gateTitle}>Desktop only</Text>
        <Text style={styles.gateBody}>
          Promoting a user to Gamemaster is only available on a laptop or desktop browser.
          The club contact finishes branding on any device after they sign in.
        </Text>
      </View>
    );
  }

  const onSubmit = async () => {
    if (!selectedUserId) {
      setError('Select a registered user to promote.');
      return;
    }
    if (!attachedQuote || !attachedQuoteInput || attachedQuoteInput.competitions.length < 1) {
      setError('Add at least 1 competition to attach an onboarding quote.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await ownerRegisterGamemaster({
        userId: selectedUserId,
        kioskLicenses: Math.max(1, parseInt(licenses, 10) || 1),
        quote: {
          payload: attachedQuoteInput,
          season_total: attachedQuote.seasonTotal,
          hub_deposit_total: attachedQuote.hubDepositTotal,
          hub_monthly_total: attachedQuote.hubMonthlyTotal,
          due_today: attachedQuote.dueToday,
          assumed_season_weeks: attachedQuote.assumedSeasonWeeks,
        },
      });
      if (!res.success) {
        setError(
          res.error === 'cannot_convert_owner'
            ? 'Cannot convert an Owner account.'
            : res.error ?? 'Could not promote user'
        );
        return;
      }
      setMessage(
        `${selected?.username || selected?.email || 'User'} is now a Gamemaster. When they sign in they’ll finish club setup.`
      );
      onRegistered?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not promote user');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Promote to Gamemaster</Text>
      <Text style={styles.hint}>
        Choose an existing free account. After promotion they sign in on any device, see the
        Gamemaster welcome screen, then enter club name, logo, and optional payment link.
      </Text>

      <Text style={styles.label}>Find user</Text>
      <TextInput
        style={styles.input}
        value={userQuery}
        onChangeText={setUserQuery}
        placeholder="Search username or email"
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        editable={!busy}
      />

      {usersLoading ? (
        <ActivityIndicator color={accent ?? theme.colors.accent} style={{ marginVertical: 8 }} />
      ) : (
        <View style={styles.userList}>
          {candidates.map((u) => {
            const active = u.id === selectedUserId;
            return (
              <Pressable
                key={u.id}
                style={[styles.userRow, active && styles.userRowActive]}
                onPress={() => setSelectedUserId(u.id)}
              >
                <Text style={styles.userName} numberOfLines={1}>
                  {u.username?.trim() || 'User'}
                </Text>
                <Text style={styles.userMeta} numberOfLines={1}>
                  {u.role}
                  {u.email ? ` · ${u.email}` : ''}
                </Text>
              </Pressable>
            );
          })}
          {candidates.length === 0 ? <Text style={styles.hint}>No matching users.</Text> : null}
        </View>
      )}

      <Text style={styles.label}>Competition hub licences</Text>
      <TextInput
        style={styles.input}
        value={licenses}
        onChangeText={(t) => setLicenses(t.replace(/\D/g, '').slice(0, 3))}
        keyboardType="number-pad"
        placeholder="1"
        placeholderTextColor={theme.colors.textMuted}
        editable={!busy}
      />

      <Text style={styles.label}>Attach onboarding quote</Text>
      <GamemasterCustomPricingPanel
        accent={accent ?? theme.colors.accent}
        onQuoteChange={(q, i) => {
          setAttachedQuote(q);
          setAttachedQuoteInput(i);
        }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}

      <Pressable
        style={[styles.primaryBtn, (busy || !selectedUserId) && styles.disabled]}
        disabled={busy || !selectedUserId}
        onPress={() => void onSubmit()}
      >
        {busy ? (
          <ActivityIndicator color={theme.colors.white} />
        ) : (
          <Text style={styles.primaryBtnText}>Promote to Gamemaster</Text>
        )}
      </Pressable>
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>, accent?: string) {
  const accentColor = accent ?? theme.colors.accent;
  return StyleSheet.create({
    gateCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: 8,
    },
    gateTitle: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 18,
      color: theme.colors.text,
    },
    gateBody: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 14,
      lineHeight: 21,
      color: theme.colors.textSecondary,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: 8,
    },
    title: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 18,
      color: theme.colors.text,
    },
    hint: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 13,
      lineHeight: 19,
      color: theme.colors.textMuted,
    },
    label: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 12,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
      marginTop: 8,
    },
    input: {
      backgroundColor: theme.colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: Platform.OS === 'web' ? 12 : 11,
      fontFamily: theme.fontFamily.input,
      fontSize: 16,
      color: theme.colors.text,
    },
    userList: { maxHeight: 220, gap: 6, overflow: 'hidden' },
    userRow: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    userRowActive: {
      borderColor: accentColor,
      backgroundColor: theme.colors.accentMuted,
    },
    userName: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 15,
      color: theme.colors.text,
    },
    userMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    primaryBtn: {
      marginTop: 10,
      backgroundColor: accentColor,
      borderRadius: theme.radius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnText: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 16,
      color: theme.colors.white,
    },
    disabled: { opacity: 0.55 },
    error: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: theme.colors.error,
    },
    success: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 14,
      color: accentColor,
    },
  });
}
