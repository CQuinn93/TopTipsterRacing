import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { wcHref } from '@/features/wc2026/utils/href';
import { setLastRoute } from '@/lib/lastRoute';

const DESKTOP_BREAKPOINT = 768;

type SportCardProps = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
  isDesktop: boolean;
};

function SportCard({ title, subtitle, icon, onPress, disabled, comingSoon, isDesktop }: SportCardProps) {
  const theme = useTheme();
  const isLight = String(theme.colors.background) === String(lightTheme.colors.background);
  const accent = theme.colors.accent;
  const surface = isLight ? theme.colors.surface : theme.colors.surfaceElevated;
  const isWeb = Platform.OS === 'web';

  const s = useMemo(
    () =>
      StyleSheet.create({
        outer: {
          width: '100%' as const,
          borderRadius: 20,
          overflow: 'hidden',
          flexDirection: 'row' as const,
          minHeight: isDesktop ? 96 : 80,
          backgroundColor: surface,
          borderWidth: 1,
          borderColor: isLight ? `${accent}22` : theme.colors.border,
          ...(isWeb && {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.14,
            shadowRadius: 16,
            elevation: 4,
          }),
        },
        outerDisabled: { opacity: 0.88 },
        accentRail: {
          width: 4,
          backgroundColor: accent,
        },
        body: {
          flex: 1,
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          paddingVertical: 14,
          paddingLeft: 14,
          paddingRight: 16,
          gap: 14,
        },
        ringOuter: {
          width: 54,
          height: 54,
          borderRadius: 27,
          backgroundColor: `${accent}14`,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
        ringInner: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: `${accent}22`,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
        textCol: { flex: 1, minWidth: 0 },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isDesktop ? 17 : 16,
          fontWeight: '700',
          color: theme.colors.text,
          letterSpacing: -0.2,
        },
        subtitle: {
          fontFamily: theme.fontFamily.light,
          fontSize: 13,
          lineHeight: 18,
          color: theme.colors.textSecondary,
          marginTop: 4,
        },
        chevronCircle: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: `${accent}18`,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
        comingSoonPill: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: `${accent}16`,
          borderWidth: 1,
          borderColor: `${accent}55`,
        },
        comingSoonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 10,
          fontWeight: '800',
          color: accent,
          letterSpacing: 1,
        },
      }),
    [theme, isLight, surface, accent, isDesktop, isWeb]
  );

  const inner = (
    <View style={[s.outer, disabled && s.outerDisabled]}>
      <View style={s.accentRail} />
      <View style={s.body}>
        <View style={s.ringOuter}>
          <View style={s.ringInner}>
            <Ionicons name={icon} size={24} color={accent} />
          </View>
        </View>
        <View style={s.textCol}>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        {comingSoon ? (
          <View style={s.comingSoonPill}>
            <Text style={s.comingSoonText}>COMING SOON</Text>
          </View>
        ) : (
          <View style={s.chevronCircle}>
            <Ionicons name="chevron-forward" size={22} color={accent} />
          </View>
        )}
      </View>
    </View>
  );

  if (disabled || !onPress) {
    return inner;
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88}>
      {inner}
    </TouchableOpacity>
  );
}

function SubHeadline() {
  const theme = useTheme();
  const base = {
    fontFamily: theme.fontFamily.light,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center' as const,
    color: theme.colors.textSecondary,
  };
  const green = { color: theme.colors.accent, fontFamily: theme.fontFamily.regular, fontWeight: '600' as const };
  return (
    <Text style={base}>
      Same account everywhere — pick <Text style={green}>Football</Text>, <Text style={green}>Racing</Text>, or{' '}
      <Text style={green}>Golf</Text> (soon).
    </Text>
  );
}

export default function CompetitionHubScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session, userId } = useAuth();
  const { width } = useWindowDimensions();
  const [displayName, setDisplayName] = useState<string>('');
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const isWeb = Platform.OS === 'web';
  const isNativeMobile = !isWeb && !isDesktop;

  useEffect(() => {
    if (!userId) {
      setDisplayName(session?.user?.email?.split('@')[0] ?? '');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', userId)
          .maybeSingle();
        if (cancelled) return;
        const name = (data as { username?: string } | null)?.username;
        if (name) setDisplayName(name);
        else setDisplayName(session?.user?.email?.split('@')[0] ?? 'there');
      } catch {
        if (!cancelled) setDisplayName(session?.user?.email?.split('@')[0] ?? 'there');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, session?.user?.email]);

  const horizontalPad = theme.spacing.md;
  const maxHubWidth = isDesktop ? 680 : 420;
  /** Explicit width fixes RN Web: `width: '100%'` + maxWidth still stretches full viewport. */
  const hubColumnWidth = Math.max(280, Math.min(maxHubWidth, width - horizontalPad * 2));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: theme.colors.background,
        },
        meshTop: {
          position: 'absolute' as const,
          top: 0,
          left: 0,
          right: 0,
          height: 220,
          zIndex: 0,
        },
        mesh: {
          position: 'absolute' as const,
          bottom: 0,
          left: 0,
          right: 0,
          height: 180,
          zIndex: 0,
        },
        scroll: {
          flex: 1,
          zIndex: 1,
        },
        scrollContent: {
          flexGrow: 1,
          paddingHorizontal: horizontalPad,
          paddingBottom: theme.spacing.xxl + 32,
          alignItems: 'center' as const,
          width: '100%' as const,
        },
        inner: {
          alignSelf: 'center' as const,
        },
        wordmarkBlock: {
          alignItems: 'center',
          marginBottom: theme.spacing.lg,
        },
        wordmarkTop: {
          fontFamily: theme.fontFamily.swish,
          fontSize: isNativeMobile ? 42 : isDesktop ? 44 : isWeb ? 38 : 40,
          color: theme.colors.text,
          textAlign: 'center',
          letterSpacing: isNativeMobile ? 1.2 : 1.1,
        },
        wordmarkSub: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isNativeMobile ? 15 : isDesktop ? 12 : isWeb ? 13 : 13,
          fontWeight: '800',
          color: theme.colors.accent,
          textAlign: 'center',
          marginTop: isNativeMobile ? 10 : 8,
          letterSpacing: isNativeMobile ? 8 : 7,
        },
        welcomeLabel: {
          fontFamily: theme.fontFamily.light,
          fontSize: 13,
          color: theme.colors.textMuted,
          textAlign: 'center',
          marginBottom: 6,
          letterSpacing: 0.3,
        },
        welcomeName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isDesktop ? 22 : 19,
          fontWeight: '700',
          color: theme.colors.text,
          textAlign: 'center',
          marginBottom: theme.spacing.lg,
        },
        headline: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isDesktop ? 24 : 20,
          fontWeight: '700',
          color: theme.colors.text,
          textAlign: 'center',
          marginBottom: 10,
          letterSpacing: -0.3,
        },
        subHeadlineWrap: {
          marginBottom: theme.spacing.lg + 6,
          paddingHorizontal: theme.spacing.xs,
        },
        cardRow: {
          width: '100%' as const,
          gap: isDesktop ? 14 : 12,
        },
        cardRowDesktop: {
          flexDirection: 'row' as const,
          flexWrap: 'wrap' as const,
          justifyContent: 'center' as const,
          gap: 14,
        },
        cardRowMobile: {
          flexDirection: 'column' as const,
        },
        cardSlotDesktop: {
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 0,
          minWidth: 0,
        },
        cardSlotMobile: {
          width: '100%' as const,
        },
        cardSlotFullRow: {
          width: '100%' as const,
          flexBasis: '100%' as const,
        },
        footer: {
          marginTop: theme.spacing.xl,
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: 14,
          paddingVertical: 18,
          paddingHorizontal: 18,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
          ...(isWeb && {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.12,
            shadowRadius: 24,
            elevation: 6,
          }),
        },
        footerTexts: { flex: 1, minWidth: 0 },
        footerTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
          letterSpacing: -0.2,
        },
        footerSub: {
          fontFamily: theme.fontFamily.light,
          fontSize: 13,
          color: theme.colors.textSecondary,
          marginTop: 4,
          lineHeight: 19,
        },
      }),
    [theme, isDesktop, isNativeMobile, isWeb, horizontalPad]
  );

  const cardSlots = [
    {
      title: 'Football',
      subtitle: 'World Cup 2026 — predictions and fixtures',
      icon: 'football-outline' as const,
      onPress: () => {
        void setLastRoute('/(wc2026)/(tabs)');
        router.replace(wcHref('/(wc2026)/(tabs)'));
      },
      disabled: false,
      comingSoon: false,
    },
    {
      title: 'Racing',
      subtitle: 'Horse racing competitions and daily selections',
      icon: 'trophy-outline' as const,
      onPress: () => {
        void setLastRoute('/(app)');
        router.replace('/(app)');
      },
      disabled: false,
      comingSoon: false,
    },
    {
      title: 'Golf',
      subtitle: 'Fantasy golf — launching here soon',
      icon: 'flag-outline' as const,
      onPress: undefined,
      disabled: true,
      comingSoon: true,
    },
  ];

  const accentRgb = theme.colors.accent;

  const scrollPaddingTop = isWeb
    ? theme.spacing.lg + 8
    : insets.top + theme.spacing.lg + 20;
  const scrollPaddingBottom = isWeb
    ? theme.spacing.xxl + 24
    : theme.spacing.xxl + 24 + Math.max(insets.bottom, theme.spacing.sm);

  return (
    <View style={styles.root}>
      <LinearGradient
        style={styles.meshTop}
        colors={[`${accentRgb}10`, 'transparent']}
        locations={[0, 1]}
        pointerEvents="none"
      />
      <LinearGradient
        style={styles.mesh}
        colors={['transparent', `${accentRgb}0f`, `${accentRgb}16`]}
        locations={[0, 0.5, 1]}
        pointerEvents="none"
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: scrollPaddingTop,
            paddingBottom: scrollPaddingBottom,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.inner, { width: hubColumnWidth }]}>
          <View style={[styles.wordmarkBlock, !isWeb && { paddingTop: theme.spacing.sm }]}>
            <Text style={styles.wordmarkTop} accessibilityRole="header">
              Top Tipster
            </Text>
            <Text style={styles.wordmarkSub}>SPORTS</Text>
          </View>

          <Text style={styles.welcomeLabel}>Welcome back</Text>
          <Text style={styles.welcomeName}>{displayName || 'there'}</Text>

          <Text style={styles.headline}>Choose a sport</Text>
          <View style={styles.subHeadlineWrap}>
            <SubHeadline />
          </View>

          <View
            style={[
              styles.cardRow,
              isDesktop ? styles.cardRowDesktop : styles.cardRowMobile,
            ]}
          >
            {cardSlots.map((c, index) => (
              <View
                key={c.title}
                style={
                  isDesktop
                    ? index === 2
                      ? styles.cardSlotFullRow
                      : styles.cardSlotDesktop
                    : styles.cardSlotMobile
                }
              >
                <SportCard
                  title={c.title}
                  subtitle={c.subtitle}
                  icon={c.icon}
                  onPress={c.onPress}
                  disabled={c.disabled}
                  comingSoon={c.comingSoon}
                  isDesktop={isDesktop}
                />
              </View>
            ))}
          </View>

          <View style={styles.footer}>
            <Ionicons name="shield-checkmark" size={28} color={theme.colors.accent} />
            <View style={styles.footerTexts}>
              <Text style={styles.footerTitle}>One account. Every sport.</Text>
              <Text style={styles.footerSub}>Track, tip and compete — all in one place.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
