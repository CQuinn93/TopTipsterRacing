import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { supabase } from '@/lib/supabase';
import { setGuidedTourCompleted } from '@/lib/onboardingStorage';

type TutorialRace = {
  id: string;
  sortOrder: number;
  raceName: string;
  startsAfterMinutes: number;
  runners?: Array<{ id: string; name: string }>;
};

type TutorialData = {
  success?: boolean;
  meeting?: {
    id: string;
    slug: string;
    title: string;
    subtitle?: string;
    demoAccessCode?: string;
  };
  races?: TutorialRace[];
};

const FALLBACK_DEMO_CODE = '654321';

export default function TutorialSandboxScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { openSidebar } = useSidebar();
  const { userId, session } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TutorialData | null>(null);
  const [step, setStep] = useState(0);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState(false);

  const demoCode = (data?.meeting?.demoAccessCode ?? FALLBACK_DEMO_CODE).replace(/\D/g, '').slice(0, 6);
  const firstRace = data?.races?.[0];
  const runnerCount = firstRace?.runners?.length ?? 0;

  const meetingStart = useMemo(() => {
    const d = new Date();
    d.setHours(14, 0, 0, 0);
    return d.getTime();
  }, []);

  const firstRaceTime = useMemo(() => {
    if (!firstRace) return null;
    const t = new Date(meetingStart + firstRace.startsAfterMinutes * 60 * 1000);
    return {
      dateStr: t.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      timeStr: t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    };
  }, [firstRace, meetingStart]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data: profile } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
        if (cancelled) return;
        const name = (profile as { username?: string } | null)?.username;
        setDisplayName(name ?? session?.user?.email?.split('@')[0] ?? 'there');
      } catch {
        if (!cancelled) setDisplayName(session?.user?.email?.split('@')[0] ?? 'there');
      }
    })();
    return () => { cancelled = true; };
  }, [userId, session?.user?.email]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const { data: res } = await supabase.rpc('tutorial_get_data', { p_slug: 'starter-tour' });
        if (!cancelled && res && (res as TutorialData).success) setData(res as TutorialData);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const finishTour = useCallback(async () => {
    if (userId) await setGuidedTourCompleted(userId);
    router.back();
  }, [userId]);

  const coachSteps = useMemo(
    () => [
      {
        message:
          'This is a practice Home screen. Nothing you do here changes your real competitions. Use Next to continue.',
        primaryLabel: 'Next',
        onPrimary: () => setStep(1),
      },
      {
        message:
          'When you have no competitions yet, you join with an access code from your organiser. Tap the green button below (or Next).',
        primaryLabel: 'Next',
        onPrimary: () => setStep(2),
      },
      {
        message: `Enter the practice code **${demoCode}** — it is only for this tutorial, not a real meeting.`,
        primaryLabel: 'Submit code',
        onPrimary: () => {
          const entered = codeInput.replace(/\D/g, '');
          if (entered !== demoCode) {
            setCodeError(true);
            if (Platform.OS === 'web') window.alert(`Try the practice code: ${demoCode}`);
            else Alert.alert('Not quite', `Enter the practice code: ${demoCode}`);
            return;
          }
          setCodeError(false);
          setStep(3);
        },
      },
      {
        message:
          'You are now “in” the sample meeting. The Next race card shows how a live day looks. In the real app it opens My selections.',
        primaryLabel: 'Next',
        onPrimary: () => setStep(4),
      },
      {
        message:
          'Open **My selections** from the tab bar to pick horses, save, and lock in when you are ready. Locked picks let you see others’ selections.',
        primaryLabel: 'Open My selections',
        onPrimary: () => {
          router.push('/(app)/selections?tutorial=1');
          setStep(5);
        },
      },
      {
        message:
          '**My Competitions** lists meetings you have joined. Open the **practice Leaderboard** to compare points with the sample bots (save and lock in picks on practice My selections first).',
        primaryLabel: 'Open practice Leaderboard',
        onPrimary: () => {
          router.push('/(app)/leaderboard?tutorial=1');
          setStep(6);
        },
      },
      {
        message:
          '**Results** shows race outcomes. Open **practice Results** to tap a horse and see position vs bonus points. Check **Rules** and **Points** in the menu on the real app.',
        primaryLabel: 'Open practice Results',
        onPrimary: () => {
          router.push('/(app)/results?tutorial=1');
          setStep(7);
        },
      },
      {
        message:
          'Use the **menu** (profile icon) for account, admin requests, privacy links, and more.',
        primaryLabel: 'Open menu',
        onPrimary: () => {
          openSidebar();
          setStep(8);
        },
      },
      {
        message: 'You are ready to use Top Tipster Racing with your real access code. Tap Done to return to Home.',
        primaryLabel: 'Done',
        onPrimary: () => finishTour(),
      },
    ],
    [demoCode, codeInput, openSidebar, finishTour]
  );

  const coach = coachSteps[Math.min(step, coachSteps.length - 1)];

  const isWeb = Platform.OS === 'web';
  const isLight = String(theme.colors.background) === String(lightTheme.colors.background);
  const cardBorder = isLight ? theme.colors.white : theme.colors.border;
  const cardBorderWidth = isLight ? 2 : 1;
  const webCard = isWeb ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 } : {};

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        banner: {
          backgroundColor: theme.colors.accentMuted,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.accent,
        },
        bannerText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.accent,
          textAlign: 'center',
        },
        scroll: { flex: 1 },
        content: { padding: theme.spacing.md, paddingBottom: 160 },
        headerStrip: {
          marginHorizontal: -theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        },
        headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        headerWelcome: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        headerHello: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 22,
          fontWeight: '700',
          color: theme.colors.text,
        },
        nextRaceCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: isWeb ? 16 : theme.radius.lg,
          padding: isWeb ? 24 : theme.spacing.md,
          marginBottom: theme.spacing.md,
          borderWidth: 2,
          borderColor: theme.colors.accent,
          ...webCard,
        },
        nextRaceTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 10,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.xs,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        },
        nextRaceEmpty: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.md,
        },
        primaryBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs,
          backgroundColor: theme.colors.accent,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.sm,
        },
        primaryBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: theme.colors.black,
        },
        codeField: {
          fontFamily: theme.fontFamily.input,
          fontSize: 22,
          letterSpacing: 8,
          textAlign: 'center',
          color: theme.colors.text,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: codeError ? theme.colors.error : theme.colors.border,
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        },
        codeHint: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.md,
        },
        sectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '700',
          color: theme.colors.text,
          marginTop: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        },
        compCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: 14,
          padding: theme.spacing.md,
          borderWidth: cardBorderWidth,
          borderColor: cardBorder,
          marginBottom: theme.spacing.sm,
          ...webCard,
        },
        compName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
        },
        compMeta: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginTop: 4,
        },
        coachBar: {
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.md,
          paddingBottom: Math.max(theme.spacing.md, insets.bottom),
        },
        coachText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          lineHeight: 20,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.md,
        },
        coachActions: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' },
        coachBtn: {
          flex: 1,
          paddingVertical: theme.spacing.sm,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
        },
        coachBtnPrimary: {
          backgroundColor: theme.colors.accent,
          borderColor: theme.colors.accent,
        },
        coachBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '600',
          color: theme.colors.text,
        },
        coachBtnTextPrimary: { color: theme.colors.black },
        closeHeaderBtn: { padding: theme.spacing.xs },
      }),
    [theme, isWeb, webCard, cardBorder, cardBorderWidth, codeError, insets.bottom]
  );

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  const showJoined = step >= 3;
  const showCodeEntry = step === 2;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>Practice mode — sample data only</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.closeHeaderBtn} onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={28} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 13, fontWeight: '600', color: theme.colors.textMuted }}>
            Tutorial home
          </Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.headerStrip}>
          <Text style={styles.headerWelcome}>Top Tipster Racing</Text>
          <Text style={styles.headerHello}>Hello {displayName}</Text>
        </View>

        <View style={styles.nextRaceCard}>
          <Text style={styles.nextRaceTitle}>Next race</Text>
          {!showJoined ? (
            <>
              <Text style={styles.nextRaceEmpty}>
                You have no upcoming competitions or races. Join one now.
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => {
                  if (step < 2) setStep(2);
                }}
                activeOpacity={0.85}
                disabled={step > 2}
              >
                <Text style={styles.primaryBtnText}>Enter competition (access code)</Text>
                <Ionicons name="arrow-forward" size={16} color={theme.colors.black} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.nextRaceTitle} />
              <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: 4 }}>
                {firstRace?.raceName ?? 'Sample race'}
              </Text>
              <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }}>
                {data?.meeting?.title ?? 'Tutorial meeting'}
                {firstRaceTime ? ` · ${firstRaceTime.dateStr}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
                <Ionicons name="time-outline" size={16} color={theme.colors.textMuted} />
                <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.text }}>
                  {firstRaceTime?.timeStr ?? '—'}
                </Text>
                {runnerCount > 0 ? (
                  <>
                    <Ionicons name="people-outline" size={16} color={theme.colors.textMuted} />
                    <Text style={{ fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.text }}>
                      {runnerCount} runners
                    </Text>
                  </>
                ) : null}
              </View>
            </>
          )}
        </View>

        {showCodeEntry && (
          <View style={{ marginBottom: theme.spacing.lg }}>
            <Text style={styles.sectionTitle}>Practice access code</Text>
            <TextInput
              style={styles.codeField}
              value={codeInput}
              onChangeText={(t) => {
                setCodeInput(t.replace(/\D/g, '').slice(0, 6));
                setCodeError(false);
              }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="6 digits"
              placeholderTextColor={theme.colors.textMuted}
            />
            <Text style={styles.codeHint}>Demo code for this tutorial: {demoCode}</Text>
          </View>
        )}

        {showJoined && (
          <>
            <Text style={styles.sectionTitle}>Your competitions</Text>
            <View style={styles.compCard}>
              <Text style={styles.compName}>{data?.meeting?.title ?? 'Tutorial meeting'}</Text>
              <Text style={styles.compMeta}>1 day · Practice only</Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.coachBar}>
        <Text style={styles.coachText}>
          {coach.message.split('**').map((part, i) =>
            i % 2 === 1 ? (
              <Text key={i} style={{ fontWeight: '700', color: theme.colors.text }}>
                {part}
              </Text>
            ) : (
              part
            )
          )}
        </Text>
        <View style={styles.coachActions}>
          {step > 0 && step < 8 && (
            <TouchableOpacity style={styles.coachBtn} onPress={() => setStep((s) => Math.max(0, s - 1))}>
              <Text style={styles.coachBtnText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.coachBtn, styles.coachBtnPrimary, step === 0 && { flex: 1 }]}
            onPress={() => coach.onPrimary()}
            activeOpacity={0.85}
          >
            <Text style={[styles.coachBtnText, styles.coachBtnTextPrimary]}>{coach.primaryLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
