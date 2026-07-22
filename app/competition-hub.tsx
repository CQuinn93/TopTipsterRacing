import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Platform,
  Linking,
  ImageBackground,
  useColorScheme,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { setLastRoute } from '@/lib/lastRoute';

const DESKTOP_BREAKPOINT = 768;
const HUB_BACKGROUND = require('../assets/Background.png');
const GOLD_BORDER = '#D4AF37';
const GOLD_BORDER_MUTED = 'rgba(212, 175, 55, 0.45)';

const TERMS_OF_USE_URL =
  'https://doc-hosting.flycricket.io/top-tipster-racing-terms-of-use/bf206b6c-02a2-4394-aedc-dbf95f95d955/terms';
const PRIVACY_POLICY_URL =
  'https://doc-hosting.flycricket.io/top-tipster-racing-fantasy-sports-privacy-policy/98fbb3c4-4795-4774-bba7-c2ebb872eb92/privacy';

type SportRowProps = {
  label: string;
  description?: string;
  icon: ReactNode;
  onPress?: () => void;
  unavailable?: boolean;
  isLast?: boolean;
};

function SportRow({ label, description, icon, onPress, unavailable, isLast }: SportRowProps) {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const rowStyles = useMemo(
    () =>
      StyleSheet.create({
        capsule: {
          borderRadius: theme.radius.full,
          borderWidth: 2,
          borderColor: unavailable ? GOLD_BORDER_MUTED : GOLD_BORDER,
          backgroundColor: isDark ? 'rgba(20, 20, 20, 0.9)' : 'rgba(255, 255, 255, 0.92)',
          marginBottom: isLast ? 0 : theme.spacing.md,
          overflow: 'hidden' as const,
          ...(Platform.OS === 'web'
            ? { boxShadow: '0 4px 14px rgba(0,0,0,0.12)' }
            : {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: isDark ? 0.35 : 0.1,
                shadowRadius: 8,
                elevation: 4,
              }),
        },
        row: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          paddingVertical: theme.spacing.md + 2,
          paddingHorizontal: theme.spacing.lg,
          gap: theme.spacing.md,
        },
        rowUnavailable: {
          opacity: 0.5,
        },
        iconWrap: {
          width: 44,
          height: 44,
          borderRadius: theme.radius.full,
          backgroundColor: theme.colors.accentMuted,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
        iconWrapMuted: {
          backgroundColor: theme.colors.surfaceElevated,
        },
        textBlock: {
          flex: 1,
          minWidth: 0,
        },
        label: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 17,
          fontWeight: '600',
          color: theme.colors.text,
          letterSpacing: -0.2,
        },
        labelMuted: {
          color: theme.colors.textSecondary,
        },
        description: {
          fontFamily: theme.fontFamily.light,
          fontSize: 13,
          color: theme.colors.textMuted,
          marginTop: 2,
        },
        trailing: {
          marginLeft: theme.spacing.xs,
        },
      }),
    [theme, isLast, isDark]
  );

  const content = (
    <View style={[rowStyles.row, unavailable && rowStyles.rowUnavailable]}>
      <View style={[rowStyles.iconWrap, unavailable && rowStyles.iconWrapMuted]}>{icon}</View>
      <View style={rowStyles.textBlock}>
        <Text style={[rowStyles.label, unavailable && rowStyles.labelMuted]}>{label}</Text>
        {description ? <Text style={rowStyles.description}>{description}</Text> : null}
      </View>
      {!unavailable ? (
        <Ionicons
          name="chevron-forward"
          size={20}
          color={GOLD_BORDER}
          style={rowStyles.trailing}
        />
      ) : null}
    </View>
  );

  if (unavailable || !onPress) {
    return (
      <View
        style={rowStyles.capsule}
        accessibilityState={{ disabled: true }}
        accessibilityLabel={label}
      >
        {content}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={rowStyles.capsule}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {content}
    </TouchableOpacity>
  );
}

export default function CompetitionHubScreen() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
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
  const maxHubWidth = isDesktop ? 480 : 420;
  const hubColumnWidth = Math.max(280, Math.min(maxHubWidth, width - horizontalPad * 2));
  const iconSz = 24;
  const iconColor = theme.colors.accent;
  const iconMuted = theme.colors.textMuted;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
        },
        bgGradient: {
          ...StyleSheet.absoluteFillObject,
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
          marginBottom: theme.spacing.xl,
        },
        wordmarkTop: {
          fontFamily: theme.fontFamily.swish,
          fontSize: isNativeMobile ? 42 : isDesktop ? 44 : isWeb ? 38 : 40,
          color: theme.colors.text,
          textAlign: 'center',
          letterSpacing: isNativeMobile ? 1.2 : 1.1,
          textShadowColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.85)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 6,
        },
        wordmarkSub: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isNativeMobile ? 15 : isDesktop ? 12 : 13,
          fontWeight: '800',
          color: theme.colors.accent,
          textAlign: 'center',
          marginTop: isNativeMobile ? 10 : 8,
          letterSpacing: isNativeMobile ? 8 : 7,
          textShadowColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.75)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        },
        welcomeBlock: {
          marginBottom: theme.spacing.xl,
        },
        welcomeName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isDesktop ? 26 : 22,
          fontWeight: '700',
          color: theme.colors.text,
          textAlign: 'center',
          letterSpacing: -0.4,
          textShadowColor: isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.7)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        },
        welcomeSub: {
          fontFamily: theme.fontFamily.light,
          fontSize: 15,
          color: theme.colors.textSecondary,
          textAlign: 'center',
          marginTop: theme.spacing.sm,
          lineHeight: 22,
        },
        sportCards: {
          width: '100%' as const,
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
          borderTopWidth: 2,
          borderTopColor: GOLD_BORDER,
          backgroundColor: isDark ? 'rgba(10, 10, 10, 0.88)' : 'rgba(250, 250, 250, 0.9)',
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
    [theme, isDesktop, isNativeMobile, isWeb, horizontalPad, maxHubWidth, isDark]
  );

  const bgGradientColors = isDark
    ? (['rgba(10, 10, 10, 0.38)', 'rgba(10, 10, 10, 0.68)', 'rgba(10, 10, 10, 0.88)'] as const)
    : (['rgba(250, 250, 250, 0.48)', 'rgba(250, 250, 250, 0.76)', 'rgba(250, 250, 250, 0.9)'] as const);

  const scrollPaddingTop = isWeb
    ? theme.spacing.lg + 8
    : insets.top + theme.spacing.lg + 20;
  const bottomBarReserve =
    theme.spacing.md +
    36 +
    theme.spacing.md +
    52 +
    theme.spacing.sm +
    Math.max(insets.bottom, theme.spacing.md);
  const scrollPaddingBottom = theme.spacing.lg + bottomBarReserve;

  const sportRows = useMemo(
    () => [
      {
        key: 'racing',
        label: 'Racing',
        description: 'Daily picks & leaderboards',
        icon: <MaterialCommunityIcons name="horse-variant" size={iconSz} color={iconColor} />,
        onPress: () => {
          void setLastRoute('/(app)');
          router.replace('/(app)');
        },
        unavailable: false,
      },
      {
        key: 'football',
        label: 'Football',
        icon: <Ionicons name="football-outline" size={iconSz} color={iconMuted} />,
        onPress: undefined,
        unavailable: true,
      },
      {
        key: 'golf',
        label: 'Golf',
        icon: <Ionicons name="flag-outline" size={iconSz} color={iconMuted} />,
        onPress: undefined,
        unavailable: true,
      },
    ],
    [iconColor, iconMuted]
  );

  return (
    <ImageBackground source={HUB_BACKGROUND} style={styles.root} resizeMode="cover">
      <LinearGradient
        colors={[...bgGradientColors]}
        locations={[0, 0.4, 1]}
        style={styles.bgGradient}
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

          <View style={styles.welcomeBlock}>
            <Text style={styles.welcomeName}>
              Hi{displayName ? `, ${displayName}` : ''}
            </Text>
            <Text style={styles.welcomeSub}>Pick a sport to get started</Text>
          </View>

          <View style={styles.sportCards}>
            {sportRows.map((row, index) => (
              <SportRow
                key={row.key}
                label={row.label}
                description={row.description}
                icon={row.icon}
                onPress={row.onPress}
                unavailable={row.unavailable}
                isLast={index === sportRows.length - 1}
              />
            ))}
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
    </ImageBackground>
  );
}
