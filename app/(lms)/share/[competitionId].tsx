import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  Linking,
  Share,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import {
  lmsCanManageCompetition,
  lmsGetCompetition,
  lmsGetCompetitionCurrentGameweek,
  lmsGetCompetitionJoinCodes,
} from '@/lib/lms/api';

function ContourDecor({ color, compact }: { color: string; compact: boolean }) {
  const rings = compact ? [140, 210, 280] : [200, 300, 400, 520];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={{
          position: 'absolute',
          right: compact ? -100 : -160,
          top: compact ? -30 : -60,
          width: compact ? 340 : 580,
          height: compact ? 340 : 580,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {rings.map((size) => (
          <View
            key={size}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: color,
              opacity: 0.55,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function formatStartDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export default function LmsShareInviteScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isCompact = width < 420 || height < 680;
  const params = useLocalSearchParams<{ competitionId: string }>();
  const competitionId = String(params.competitionId ?? '');

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [entry, setEntry] = useState<string | null>(null);
  const [extraLives, setExtraLives] = useState(0);
  const [startGwNumber, setStartGwNumber] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loginBg = ['#0a0a0a', '#111111', '#0a0a0a'] as const;
  const startDateLabel = formatStartDate(startsAt);
  const entryLabel = entry?.trim() || 'Set by the organiser';
  const startLabel =
    startGwNumber != null
      ? startDateLabel
        ? `GW${startGwNumber} · ${startDateLabel}`
        : `GW${startGwNumber}`
      : startDateLabel ?? 'Set by the organiser';

  const livesLabel =
    extraLives <= 0
      ? '0 extra — lose a pick and you are out'
      : extraLives === 1
        ? '1 extra — survive one loss'
        : `${extraLives} extra — survive ${extraLives} losses`;

  const shareText = useMemo(() => {
    const lines = [
      `Last Man Standing — ${name || 'Competition'}`,
      joinCode ? `Join code: ${joinCode}` : 'Join code: ask the organiser',
      `Lives: ${livesLabel}`,
      `Starts: ${startLabel}`,
      `Entry: ${entryLabel}`,
      'Sign up: https://www.toptipster.ie',
      'Hosted on TopTipster Sports',
    ];
    return lines.join('\n');
  }, [name, joinCode, livesLabel, startLabel, entryLabel]);

  const load = useCallback(async () => {
    if (!competitionId) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    try {
      const manage = await lmsCanManageCompetition(competitionId);
      if (!manage.can_handle_joins) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      const [comp, codes, gwInfo] = await Promise.all([
        lmsGetCompetition(competitionId),
        lmsGetCompetitionJoinCodes(competitionId),
        lmsGetCompetitionCurrentGameweek(competitionId),
      ]);
      setName(comp?.name ?? 'Competition');
      setEntry(comp?.entry ?? null);
      setExtraLives(comp?.extra_lives ?? 0);
      setJoinCode(codes.join_code);
      setStartGwNumber(gwInfo.startGameweekNumber);
      setStartsAt(gwInfo.startsAt);
    } catch {
      setForbidden(true);
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const showCopied = (msg: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
    else Alert.alert('Copied', msg);
  };

  const copyJoinCode = async () => {
    if (!joinCode) {
      Alert.alert('No join code', 'This competition does not have a join code yet.');
      return;
    }
    try {
      await Clipboard.setStringAsync(joinCode);
      showCopied(`Join code ${joinCode} copied.`);
    } catch {
      Alert.alert('Copy failed', 'Could not copy the join code.');
    }
  };

  const copyDetails = async () => {
    setBusy(true);
    try {
      await Clipboard.setStringAsync(shareText);
      showCopied('Invite details copied.');
    } catch {
      Alert.alert('Copy failed', 'Could not copy the invite details.');
    } finally {
      setBusy(false);
    }
  };

  const onShare = async () => {
    setBusy(true);
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `Last Man Standing — ${name}`,
          text: shareText,
        });
        return;
      }
      await Share.share({ message: shareText, title: `Last Man Standing — ${name}` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/abort|cancel/i.test(msg)) return;
      await copyDetails();
    } finally {
      setBusy(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        bg: {
          flex: 1,
          backgroundColor: '#0a0a0a',
        },
        bgGradient: {
          ...StyleSheet.absoluteFillObject,
        },
        close: {
          position: 'absolute',
          top: Math.max(theme.spacing.md, insets.top + 6),
          left: theme.spacing.lg,
          zIndex: 2,
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
        },
        scroll: {
          flexGrow: 1,
          padding: theme.spacing.lg,
          paddingTop: Math.max(theme.spacing.xl, insets.top + 48),
          paddingBottom: Math.max(theme.spacing.lg, insets.bottom + theme.spacing.sm),
        },
        content: {
          flexGrow: 1,
          maxWidth: 400,
          width: '100%',
          alignSelf: 'center',
          justifyContent: 'center',
        },
        wordmarkBlock: {
          alignItems: 'center',
          marginBottom: theme.spacing.lg,
        },
        wordmarkTop: {
          fontFamily: theme.fontFamily.swish,
          fontSize: isCompact ? 32 : Platform.OS === 'web' ? 36 : 42,
          color: '#fafafa',
          textAlign: 'center',
          marginBottom: theme.spacing.xs,
          letterSpacing: Platform.OS === 'web' ? 0.6 : 1,
        },
        wordmarkSub: {
          fontFamily: theme.fontFamily.regular,
          fontSize: Platform.OS === 'web' ? 14 : 15,
          fontWeight: '700',
          color: theme.colors.accent,
          textAlign: 'center',
          marginTop: 8,
          letterSpacing: Platform.OS === 'web' ? 6 : 7,
        },
        compName: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 20,
          color: '#fafafa',
          textAlign: 'center',
          marginBottom: theme.spacing.lg,
        },
        codeBlock: {
          alignItems: 'center',
          marginBottom: theme.spacing.lg,
          gap: 6,
        },
        codeLabel: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: '#a3a3a3',
          textTransform: 'uppercase',
          letterSpacing: 1.2,
        },
        codeValue: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 32,
          letterSpacing: 6,
          color: '#fafafa',
        },
        codeHint: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: '#737373',
        },
        rules: {
          gap: 10,
          marginBottom: theme.spacing.lg,
        },
        ruleRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: '#2a2a2a',
          paddingBottom: 8,
        },
        ruleLabel: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
          color: '#a3a3a3',
        },
        ruleValue: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: '#fafafa',
          flexShrink: 1,
          textAlign: 'right',
        },
        signup: {
          alignItems: 'center',
          marginBottom: theme.spacing.lg,
          gap: 4,
        },
        signupLabel: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: '#a3a3a3',
        },
        signupLink: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 16,
          color: theme.colors.accent,
          textDecorationLine: 'underline',
        },
        actions: {
          gap: 10,
          marginBottom: theme.spacing.xl,
        },
        button: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.md,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
        },
        buttonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          color: theme.colors.white,
          fontWeight: '600',
        },
        secondaryBtn: {
          alignItems: 'center',
          paddingVertical: 8,
        },
        secondaryText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.accent,
        },
        footer: {
          marginTop: 'auto' as const,
          paddingTop: theme.spacing.lg,
        },
        footerText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: '#737373',
          textAlign: 'center',
        },
        muted: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 14,
          color: '#a3a3a3',
          textAlign: 'center',
        },
      }),
    [theme, insets.top, insets.bottom, isCompact]
  );

  return (
    <View style={styles.bg}>
      <LinearGradient
        colors={[...loginBg]}
        locations={[0, 0.45, 1]}
        style={styles.bgGradient}
        pointerEvents="none"
      />
      <ContourDecor color="rgba(250, 250, 250, 0.16)" compact={isCompact} />
      <Pressable
        style={styles.close}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={24} color="#fafafa" />
      </Pressable>
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading ? (
          <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 80 }} />
        ) : forbidden ? (
          <Text style={styles.muted}>You do not have access to share this competition.</Text>
        ) : (
          <View style={styles.content}>
            <View style={styles.wordmarkBlock}>
              <Text style={styles.wordmarkTop} accessibilityRole="header">
                Last Man Standing
              </Text>
              <Text style={styles.wordmarkSub}>SPORTS</Text>
            </View>
            <Text style={styles.compName}>{name}</Text>
            <Pressable
              style={styles.codeBlock}
              onPress={() => void copyJoinCode()}
              accessibilityRole="button"
              accessibilityLabel={joinCode ? `Copy join code ${joinCode}` : 'No join code'}
            >
              <Text style={styles.codeLabel}>Join code</Text>
              <Text style={styles.codeValue}>{joinCode ?? '————'}</Text>
              <Text style={styles.codeHint}>
                {joinCode ? 'Tap to copy' : 'No join code yet'}
              </Text>
            </Pressable>
            <View style={styles.rules}>
              <View style={styles.ruleRow}>
                <Text style={styles.ruleLabel}>Lives</Text>
                <Text style={styles.ruleValue}>{livesLabel}</Text>
              </View>
              <View style={styles.ruleRow}>
                <Text style={styles.ruleLabel}>Starts</Text>
                <Text style={styles.ruleValue}>{startLabel}</Text>
              </View>
              <View style={styles.ruleRow}>
                <Text style={styles.ruleLabel}>Entry</Text>
                <Text style={styles.ruleValue}>{entryLabel}</Text>
              </View>
            </View>
            <View style={styles.signup}>
              <Text style={styles.signupLabel}>Sign up at</Text>
              <Pressable
                onPress={() => void Linking.openURL('https://www.toptipster.ie')}
                accessibilityRole="link"
                accessibilityLabel="Open www.toptipster.ie"
              >
                <Text style={styles.signupLink}>www.toptipster.ie</Text>
              </Pressable>
            </View>
            <View style={styles.actions}>
              <Pressable
                style={styles.button}
                onPress={() => void onShare()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Share invite"
              >
                {busy ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <>
                    <Ionicons name="share-outline" size={18} color={theme.colors.white} />
                    <Text style={styles.buttonText}>Share</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => void copyDetails()}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Copy invite details"
              >
                <Text style={styles.secondaryText}>Copy details</Text>
              </Pressable>
            </View>
            <View style={styles.footer}>
              <Text style={styles.footerText}>Hosted on TopTipster Sports</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
