import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
  Platform,
  Linking,
  useColorScheme,
  Animated,
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
const COMPACT_BREAKPOINT = 400;

const TERMS_OF_USE_URL =
  'https://doc-hosting.flycricket.io/top-tipster-racing-terms-of-use/bf206b6c-02a2-4394-aedc-dbf95f95d955/terms';
const PRIVACY_POLICY_URL =
  'https://doc-hosting.flycricket.io/top-tipster-racing-fantasy-sports-privacy-policy/98fbb3c4-4795-4774-bba7-c2ebb872eb92/privacy';

type SportRowProps = {
  label: string;
  description: string;
  icon: ReactNode;
  onPress?: () => void;
  unavailable?: boolean;
  featured?: boolean;
};

function SportRow({ label, description, icon, onPress, unavailable, featured }: SportRowProps) {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingVertical: featured ? theme.spacing.md + 4 : theme.spacing.md,
          paddingHorizontal: theme.spacing.md + 2,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: featured
            ? isDark
              ? 'rgba(21, 128, 61, 0.55)'
              : 'rgba(21, 128, 61, 0.35)'
            : theme.colors.border,
          backgroundColor: featured
            ? isDark
              ? 'rgba(21, 128, 61, 0.14)'
              : 'rgba(21, 128, 61, 0.08)'
            : isDark
              ? 'rgba(20, 20, 20, 0.72)'
              : 'rgba(255, 255, 255, 0.78)',
        },
        rowPressed: {
          opacity: 0.88,
          transform: [{ scale: 0.985 }],
        },
        rowUnavailable: {
          opacity: 0.55,
        },
        iconWrap: {
          width: featured ? 48 : 42,
          height: featured ? 48 : 42,
          borderRadius: theme.radius.md,
          backgroundColor: featured ? theme.colors.accent : theme.colors.surfaceElevated,
          alignItems: 'center',
          justifyContent: 'center',
        },
        textBlock: {
          flex: 1,
          minWidth: 0,
        },
        labelRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        },
        label: {
          fontFamily: theme.fontFamily.regular,
          fontSize: featured ? 18 : 16,
          fontWeight: '700',
          color: theme.colors.text,
          letterSpacing: -0.3,
        },
        badge: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: theme.radius.sm,
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        },
        badgeText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '600',
          color: theme.colors.textMuted,
          letterSpacing: 0.2,
        },
        description: {
          fontFamily: theme.fontFamily.light,
          fontSize: 13,
          color: theme.colors.textSecondary,
          marginTop: 3,
          lineHeight: 18,
        },
      }),
    [theme, featured, isDark]
  );

  const content = (
    <>
      <View style={styles.iconWrap}>{icon}</View>
      <View style={styles.textBlock}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {unavailable ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Soon</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.description}>{description}</Text>
      </View>
      {!unavailable ? (
        <Ionicons name="arrow-forward" size={18} color={theme.colors.accent} />
      ) : null}
    </>
  );

  if (unavailable || !onPress) {
    return (
      <View
        style={[styles.row, styles.rowUnavailable]}
        accessibilityState={{ disabled: true }}
        accessibilityLabel={`${label}, coming soon`}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

export default function CompetitionHubScreen() {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();
  const { session, userId } = useAuth();
  const { width, height } = useWindowDimensions();
  const [displayName, setDisplayName] = useState<string>('');

  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const isCompact = width < COMPACT_BREAKPOINT || height < 640;
  const isWeb = Platform.OS === 'web';

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const riseAnim = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 420,
        useNativeDriver: true,
      }),
      Animated.timing(riseAnim, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, riseAnim]);

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

  const horizontalPad = isCompact ? theme.spacing.md : theme.spacing.lg;
  const maxHubWidth = isDesktop ? 440 : 400;
  const hubColumnWidth = Math.max(260, Math.min(maxHubWidth, width - horizontalPad * 2));
  const iconSz = isCompact ? 20 : 22;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: theme.colors.background,
        },
        ambient: {
          ...StyleSheet.absoluteFillObject,
        },
        accentGlow: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: Math.min(height * 0.55, 420),
        },
        scroll: {
          flex: 1,
        },
        scrollContent: {
          flexGrow: 1,
          paddingHorizontal: horizontalPad,
          paddingTop: isWeb
            ? Math.max(theme.spacing.lg, insets.top + theme.spacing.md)
            : insets.top + (isCompact ? theme.spacing.lg : theme.spacing.xl),
          paddingBottom: theme.spacing.md,
          alignItems: 'center',
          justifyContent: isCompact ? 'flex-start' : 'center',
        },
        inner: {
          width: hubColumnWidth,
          alignSelf: 'center',
        },
        wordmarkBlock: {
          alignItems: 'center',
          marginBottom: isCompact ? theme.spacing.lg : theme.spacing.xl,
        },
        wordmarkTop: {
          fontFamily: theme.fontFamily.swish,
          fontSize: isCompact ? 36 : isDesktop ? 48 : 42,
          color: theme.colors.text,
          textAlign: 'center',
          letterSpacing: 1.1,
        },
        wordmarkSub: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isCompact ? 11 : 12,
          fontWeight: '800',
          color: theme.colors.accent,
          textAlign: 'center',
          marginTop: theme.spacing.sm,
          letterSpacing: isCompact ? 6 : 8,
        },
        welcomeBlock: {
          marginBottom: isCompact ? theme.spacing.lg : theme.spacing.xl,
          alignItems: 'center',
        },
        welcomeName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isCompact ? 20 : 24,
          fontWeight: '700',
          color: theme.colors.text,
          textAlign: 'center',
          letterSpacing: -0.4,
        },
        welcomeSub: {
          fontFamily: theme.fontFamily.light,
          fontSize: isCompact ? 14 : 15,
          color: theme.colors.textSecondary,
          textAlign: 'center',
          marginTop: theme.spacing.sm,
          lineHeight: 21,
          maxWidth: 320,
        },
        sportList: {
          width: '100%',
          gap: theme.spacing.sm + 2,
        },
        sectionLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '700',
          color: theme.colors.textMuted,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          marginBottom: theme.spacing.sm,
          marginTop: theme.spacing.md,
        },
        footer: {
          paddingTop: theme.spacing.md,
          paddingBottom: Math.max(insets.bottom, theme.spacing.md),
          paddingHorizontal: horizontalPad,
          alignItems: 'center',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          backgroundColor: isDark ? 'rgba(10, 10, 10, 0.72)' : 'rgba(250, 250, 250, 0.82)',
        },
        legalRow: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: theme.spacing.md,
        },
        legalLink: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        legalDot: {
          width: 3,
          height: 3,
          borderRadius: 2,
          backgroundColor: theme.colors.textMuted,
          opacity: 0.5,
        },
      }),
    [
      theme,
      isCompact,
      isDesktop,
      isWeb,
      isDark,
      horizontalPad,
      hubColumnWidth,
      insets.top,
      insets.bottom,
      height,
    ]
  );

  const bgGradient = isDark
    ? (['#0a0a0a', '#0f1410', '#0a0a0a'] as const)
    : (['#f7faf7', '#eef5f0', '#fafafa'] as const);

  const glowGradient = isDark
    ? (['rgba(21, 128, 61, 0.22)', 'rgba(21, 128, 61, 0.06)', 'transparent'] as const)
    : (['rgba(21, 128, 61, 0.14)', 'rgba(21, 128, 61, 0.04)', 'transparent'] as const);

  const sportRows = useMemo(
    () => [
      {
        key: 'racing',
        label: 'Racing',
        description: 'Daily picks, competitions and leaderboards',
        icon: (
          <MaterialCommunityIcons name="horse-variant" size={iconSz} color={theme.colors.white} />
        ),
        onPress: () => {
          void setLastRoute('/(app)');
          router.replace('/(app)');
        },
        unavailable: false,
        featured: true,
      },
      {
        key: 'football',
        label: 'Football',
        description: 'Coming in a future update',
        icon: <Ionicons name="football-outline" size={iconSz} color={theme.colors.textMuted} />,
        onPress: undefined,
        unavailable: true,
        featured: false,
      },
      {
        key: 'golf',
        label: 'Golf',
        description: 'Coming in a future update',
        icon: <Ionicons name="flag-outline" size={iconSz} color={theme.colors.textMuted} />,
        onPress: undefined,
        unavailable: true,
        featured: false,
      },
    ],
    [iconSz, theme.colors.textMuted, theme.colors.white]
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...bgGradient]} locations={[0, 0.45, 1]} style={styles.ambient} />
      <LinearGradient
        colors={[...glowGradient]}
        locations={[0, 0.45, 1]}
        style={styles.accentGlow}
        pointerEvents="none"
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View
          style={[
            styles.inner,
            {
              opacity: fadeAnim,
              transform: [{ translateY: riseAnim }],
            },
          ]}
        >
          <View style={styles.wordmarkBlock}>
            <Text style={styles.wordmarkTop} accessibilityRole="header">
              Top Tipster
            </Text>
            <Text style={styles.wordmarkSub}>SPORTS</Text>
          </View>

          <View style={styles.welcomeBlock}>
            <Text style={styles.welcomeName}>
              Hi{displayName ? `, ${displayName}` : ''}
            </Text>
            <Text style={styles.welcomeSub}>Choose a sport to continue</Text>
          </View>

          <Text style={styles.sectionLabel}>Available now</Text>
          <View style={styles.sportList}>
            {sportRows
              .filter((row) => !row.unavailable)
              .map((row) => (
                <SportRow
                  key={row.key}
                  label={row.label}
                  description={row.description}
                  icon={row.icon}
                  onPress={row.onPress}
                  unavailable={row.unavailable}
                  featured={row.featured}
                />
              ))}
          </View>

          <Text style={styles.sectionLabel}>Coming soon</Text>
          <View style={styles.sportList}>
            {sportRows
              .filter((row) => row.unavailable)
              .map((row) => (
                <SportRow
                  key={row.key}
                  label={row.label}
                  description={row.description}
                  icon={row.icon}
                  onPress={row.onPress}
                  unavailable={row.unavailable}
                  featured={row.featured}
                />
              ))}
          </View>
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.legalRow}>
          <Pressable
            onPress={() => {
              void Linking.openURL(TERMS_OF_USE_URL);
            }}
            accessibilityRole="link"
            hitSlop={8}
          >
            <Text style={styles.legalLink}>Terms</Text>
          </Pressable>
          <View style={styles.legalDot} />
          <Pressable
            onPress={() => {
              void Linking.openURL(PRIVACY_POLICY_URL);
            }}
            accessibilityRole="link"
            hitSlop={8}
          >
            <Text style={styles.legalLink}>Privacy</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
