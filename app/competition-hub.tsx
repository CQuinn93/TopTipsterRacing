import { useEffect, useMemo, useState, type ReactNode, cloneElement, isValidElement, type ReactElement } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Platform,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { wcHref } from '@/features/wc2026/utils/href';
import { setLastRoute } from '@/lib/lastRoute';

const DESKTOP_BREAKPOINT = 768;

const TERMS_OF_USE_URL =
  'https://doc-hosting.flycricket.io/top-tipster-racing-terms-of-use/bf206b6c-02a2-4394-aedc-dbf95f95d955/terms';
const PRIVACY_POLICY_URL =
  'https://doc-hosting.flycricket.io/top-tipster-racing-fantasy-sports-privacy-policy/98fbb3c4-4795-4774-bba7-c2ebb872eb92/privacy';

function iconWithColor(icon: ReactNode, color: string) {
  if (isValidElement(icon)) {
    return cloneElement(icon as ReactElement<{ color?: string }>, { color });
  }
  return icon;
}

type SportIconTileProps = {
  title: string;
  /** Uppercase sport line (replaces “SPORTS” in the mini wordmark) */
  sportWordmark: string;
  icon: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
  isDesktop: boolean;
  isNativeMobile: boolean;
};

function SportIconTile({
  title,
  sportWordmark,
  icon,
  onPress,
  disabled,
  comingSoon,
  isDesktop,
  isNativeMobile,
}: SportIconTileProps) {
  const theme = useTheme();
  const isWeb = Platform.OS === 'web';
  const brandOnWhite = theme.colors.black;
  const mutedIcon = iconWithColor(icon, theme.colors.textMuted);
  const sportLetterSpacing = sportWordmark.length > 6 ? (isNativeMobile ? 4 : 3.5) : isNativeMobile ? 6 : 5.5;
  const sportFontSize = isNativeMobile ? 14 : isDesktop ? 13 : 13;

  const s = useMemo(
    () =>
      StyleSheet.create({
        col: {
          width: '100%' as const,
          alignItems: 'center' as const,
        },
        colDisabled: { opacity: 0.72 },
        /** Active sport: white tile, green border */
        cardFace: {
          width: '100%' as const,
          borderRadius: 14,
          backgroundColor: theme.colors.white,
          borderWidth: 2,
          borderColor: theme.colors.accent,
          paddingHorizontal: 0,
          paddingTop: isDesktop ? 5 : 4,
          paddingBottom: isDesktop ? 6 : 5,
          alignItems: 'center' as const,
          justifyContent: 'flex-start' as const,
          ...(isWeb && {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 6,
            elevation: 2,
          }),
        },
        cardIconWrap: {
          width: '100%' as const,
          paddingHorizontal: 0,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          paddingBottom: isDesktop ? 7 : 6,
        },
        cardTextPad: {
          width: '100%' as const,
          paddingHorizontal: isDesktop ? 8 : 6,
          paddingBottom: 2,
        },
        cardBrand: {
          fontFamily: theme.fontFamily.swish,
          fontSize: isDesktop ? 35 : isNativeMobile ? 30 : 25,
          /** Must be ≥ fontSize or Swish ascenders clip (RN uses lineHeight as the line box height). */
          lineHeight: isDesktop ? 44 : isNativeMobile ? 38 : 32,
          color: brandOnWhite,
          textAlign: 'center' as const,
          letterSpacing: isNativeMobile ? 0.9 : 0.75,
        },
        cardSportTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: sportFontSize,
          fontWeight: '800',
          color: theme.colors.accent,
          textAlign: 'center' as const,
          letterSpacing: sportLetterSpacing,
          textTransform: 'uppercase' as const,
          marginTop: isNativeMobile ? 4 : 3,
        },
        /** Golf: same white tile + ribbon; content greyed */
        soonCard: {
          width: '100%' as const,
          borderRadius: 14,
          backgroundColor: theme.colors.white,
          borderWidth: 2,
          borderColor: theme.colors.accent,
          overflow: 'hidden' as const,
          position: 'relative' as const,
          ...(isWeb && {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.08,
            shadowRadius: 6,
            elevation: 2,
          }),
        },
        soonInner: {
          paddingHorizontal: 0,
          paddingTop: isDesktop ? 5 : 4,
          paddingBottom: isDesktop ? 6 : 5,
          alignItems: 'center' as const,
          justifyContent: 'flex-start' as const,
          opacity: 0.5,
        },
        soonIconWrap: {
          width: '100%' as const,
          paddingHorizontal: 0,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          paddingBottom: isDesktop ? 7 : 6,
        },
        soonTextPad: {
          width: '100%' as const,
          paddingHorizontal: isDesktop ? 8 : 6,
          paddingBottom: 2,
        },
        soonBrand: {
          fontFamily: theme.fontFamily.swish,
          fontSize: isDesktop ? 17 : isNativeMobile ? 16 : 15,
          lineHeight: isDesktop ? 22 : 20,
          color: theme.colors.textMuted,
          textAlign: 'center' as const,
          letterSpacing: isNativeMobile ? 0.9 : 0.75,
        },
        soonSportTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: sportFontSize,
          fontWeight: '800',
          color: theme.colors.accent,
          textAlign: 'center' as const,
          letterSpacing: sportLetterSpacing,
          textTransform: 'uppercase' as const,
          marginTop: isNativeMobile ? 4 : 3,
        },
        soonRibbon: {
          position: 'absolute' as const,
          left: -28,
          right: -28,
          top: '40%',
          backgroundColor: theme.colors.accent,
          paddingVertical: isDesktop ? 9 : 8,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          transform: [{ rotate: '-14deg' }],
        },
        soonRibbonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isDesktop ? 11 : 10,
          fontWeight: '800',
          color: theme.colors.white,
          letterSpacing: 2,
        },
      }),
    [theme, isDesktop, isWeb, isNativeMobile, brandOnWhite, sportLetterSpacing, sportFontSize]
  );

  if (comingSoon) {
    return (
      <View style={s.col} accessibilityState={{ disabled: true }} accessibilityLabel={`${title}, coming soon`}>
        <View style={s.soonCard}>
          <View style={s.soonInner}>
            <View style={s.soonIconWrap}>{mutedIcon}</View>
            <View style={s.soonTextPad}>
              <Text style={s.soonBrand} numberOfLines={2}>
                Top Tipster
              </Text>
              <Text style={s.soonSportTitle}>{sportWordmark}</Text>
            </View>
          </View>
          <View style={s.soonRibbon} pointerEvents="none">
            <Text style={s.soonRibbonText}>COMING SOON</Text>
          </View>
        </View>
      </View>
    );
  }

  const cardInner = (
    <View style={s.cardFace}>
      <View style={s.cardIconWrap}>{icon}</View>
      <View style={s.cardTextPad}>
        <Text style={s.cardBrand} numberOfLines={4}>
          Top Tipster
        </Text>
        <Text style={s.cardSportTitle}>{sportWordmark}</Text>
      </View>
    </View>
  );

  if (disabled || !onPress) {
    return (
      <View style={[s.col, disabled && s.colDisabled]}>
        {cardInner}
      </View>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88} style={s.col} accessibilityRole="button">
      {cardInner}
    </TouchableOpacity>
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
        },
        welcomeSection: {
          width: '100%' as const,
          paddingBottom: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        sportSection: {
          width: '100%' as const,
        },
        headline: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isDesktop ? 24 : 20,
          fontWeight: '700',
          color: theme.colors.text,
          textAlign: 'center',
          marginBottom: theme.spacing.md,
          letterSpacing: -0.3,
        },
        sportIconGrid: {
          width: '100%' as const,
          flexDirection: 'row' as const,
          flexWrap: 'wrap' as const,
          justifyContent: 'center' as const,
        },
        legalRow: {
          flexDirection: 'row' as const,
          justifyContent: 'center' as const,
          alignItems: 'center' as const,
          flexWrap: 'wrap' as const,
          gap: theme.spacing.md,
          marginBottom: theme.spacing.md,
        },
        legalLink: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
          textDecorationLine: 'underline' as const,
        },
        bottomBar: {
          zIndex: 1,
          alignItems: 'center' as const,
          paddingTop: theme.spacing.md,
          paddingHorizontal: horizontalPad,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          maxWidth: maxHubWidth,
          width: '100%' as const,
          alignSelf: 'center' as const,
        },
        bottomBarTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '700',
          color: theme.colors.text,
          letterSpacing: -0.2,
          textAlign: 'center' as const,
        },
        bottomBarSub: {
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.textSecondary,
          marginTop: 4,
          lineHeight: 18,
          textAlign: 'center' as const,
        },
      }),
    [theme, isDesktop, isNativeMobile, isWeb, horizontalPad, maxHubWidth]
  );

  const sportTileGap = theme.spacing.md;
  const sportTileWidth = (hubColumnWidth - sportTileGap) / 2;

  const cardSlots = useMemo(() => {
    const iconSz = isDesktop ? 56 : isNativeMobile ? 52 : 54;
    const iconColor = theme.colors.accent;
    return [
      {
        title: 'Football',
        sportWordmark: 'FOOTBALL',
        icon: <Ionicons name="football-outline" size={iconSz} color={iconColor} />,
        onPress: () => {
          void setLastRoute('/(wc2026)/(tabs)');
          router.replace(wcHref('/(wc2026)/(tabs)'));
        },
        disabled: false,
        comingSoon: false,
      },
      {
        title: 'Racing',
        sportWordmark: 'RACING',
        icon: <MaterialCommunityIcons name="horse-variant" size={iconSz} color={iconColor} />,
        onPress: () => {
          void setLastRoute('/(app)');
          router.replace('/(app)');
        },
        disabled: false,
        comingSoon: false,
      },
      {
        title: 'Golf',
        sportWordmark: 'GOLF',
        icon: <Ionicons name="flag-outline" size={iconSz} color={iconColor} />,
        onPress: undefined,
        disabled: true,
        comingSoon: true,
      },
    ];
  }, [isDesktop, isNativeMobile, theme.colors.accent]);

  const accentRgb = theme.colors.accent;

  const scrollPaddingTop = isWeb
    ? theme.spacing.lg + 8
    : insets.top + theme.spacing.lg + 20;
  /** Space so content clears the fixed bottom bar (legal links + tagline + safe area) */
  const bottomBarReserve =
    theme.spacing.md +
    36 +
    theme.spacing.md +
    52 +
    theme.spacing.sm +
    Math.max(insets.bottom, theme.spacing.md);
  const scrollPaddingBottom = theme.spacing.lg + bottomBarReserve;

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

          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeLabel}>Welcome back</Text>
            <Text style={styles.welcomeName}>{displayName || 'there'}</Text>
          </View>

          <View style={styles.sportSection}>
            <Text style={styles.headline}>Choose a sport</Text>

            <View style={[styles.sportIconGrid, { gap: sportTileGap }]}>
              {cardSlots.map((c) => (
                <View key={c.title} style={{ width: sportTileWidth }}>
                  <SportIconTile
                    title={c.title}
                    sportWordmark={c.sportWordmark}
                    icon={c.icon}
                    onPress={c.onPress}
                    disabled={c.disabled}
                    comingSoon={c.comingSoon}
                    isDesktop={isDesktop}
                    isNativeMobile={isNativeMobile}
                  />
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, theme.spacing.md) },
        ]}
      >
        <View style={styles.legalRow}>
          <TouchableOpacity
            onPress={() => {
              void Linking.openURL(TERMS_OF_USE_URL);
            }}
            accessibilityRole="link"
          >
            <Text style={styles.legalLink}>Terms & conditions</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              void Linking.openURL(PRIVACY_POLICY_URL);
            }}
            accessibilityRole="link"
          >
            <Text style={styles.legalLink}>Privacy policy</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.bottomBarTitle}>One account. Every sport.</Text>
        <Text style={styles.bottomBarSub}>Track, tip and compete — all in one place.</Text>
      </View>
    </View>
  );
}
