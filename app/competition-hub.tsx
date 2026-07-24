import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
  Platform,
  Animated,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { setLastRoute } from '@/lib/lastRoute';
import { getOrCreateTabletCode, clearTabletCodeCache } from '@/lib/tabletCode';
import { getAdminAccent } from '@/constants/adminUi';

const DESKTOP_BREAKPOINT = 900;
const COMPACT_BREAKPOINT = 420;

const TERMS_OF_USE_URL =
  'https://doc-hosting.flycricket.io/top-tipster-racing-terms-of-use/bf206b6c-02a2-4394-aedc-dbf95f95d955/terms';
const PRIVACY_POLICY_URL =
  'https://doc-hosting.flycricket.io/top-tipster-racing-fantasy-sports-privacy-policy/98fbb3c4-4795-4774-bba7-c2ebb872eb92/privacy';

type HubTab = 'football' | 'racing' | 'admin';

type ModeItem = {
  key: string;
  title: string;
  status?: string;
  unavailable?: boolean;
  onPress?: () => void;
};

type ModeTileProps = {
  item: ModeItem;
  accent: string;
};

function ModeTile({ item, accent }: ModeTileProps) {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        tile: {
          width: '47%',
          flexGrow: 0,
          flexBasis: '47%',
          maxWidth: '48.5%',
          minHeight: 88,
          paddingVertical: 16,
          paddingHorizontal: 14,
          borderRadius: theme.radius.md,
          borderWidth: 1.5,
          borderColor: item.unavailable ? theme.colors.border : `${accent}66`,
          backgroundColor: item.unavailable
            ? theme.colors.surface
            : theme.colors.surfaceElevated,
          justifyContent: 'center',
          gap: 6,
        },
        pressed: {
          opacity: 0.75,
          transform: [{ scale: 0.98 }],
        },
        unavailable: {
          opacity: 0.48,
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '700',
          color: theme.colors.text,
          letterSpacing: -0.2,
          lineHeight: 20,
        },
        status: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: item.unavailable ? theme.colors.textMuted : accent,
        },
      }),
    [theme, accent, item.unavailable]
  );

  const body = (
    <>
      <Text style={styles.title}>{item.title}</Text>
      {item.status ? <Text style={styles.status}>{item.status}</Text> : null}
    </>
  );

  if (item.unavailable || !item.onPress) {
    return (
      <View
        style={[styles.tile, styles.unavailable]}
        accessibilityState={{ disabled: true }}
        accessibilityLabel={`${item.title}, ${item.status ?? 'unavailable'}`}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

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
              opacity: 0.5,
            }}
          />
        ))}
      </View>
    </View>
  );
}

export default function CompetitionHubScreen() {
  const theme = useTheme();
  const isDark = true;
  const insets = useSafeAreaInsets();
  const { userId, signOut } = useAuth();
  const { width, height } = useWindowDimensions();
  const [displayName, setDisplayName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCode, setAdminCode] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [tab, setTab] = useState<HubTab>('football');

  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const isCompact = width < COMPACT_BREAKPOINT || height < 640;
  const isWeb = Platform.OS === 'web';
  /** Phones/tablets: pin main body to the top; desktops keep vertical centre. */
  const pinBodyTop = !isDesktop;

  const sportProgress = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentShift = useRef(new Animated.Value(0)).current;
  const enterOpacity = useRef(new Animated.Value(0)).current;
  const enterRise = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    if (!isAdmin && tab === 'admin') setTab('football');
  }, [isAdmin, tab]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enterOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(enterRise, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [enterOpacity, enterRise]);

  useEffect(() => {
    if (!userId) {
      setDisplayName('');
      setIsAdmin(false);
      setAdminCode(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        // profiles.role is used in DB but missing from generated Database types
        const db = supabase as any;
        const { data, error } = await db
          .from('profiles')
          .select('username, role')
          .eq('id', userId)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.warn('[competition-hub] profile load failed', error.message);
          setDisplayName('');
          setIsAdmin(false);
          setAdminCode(null);
          return;
        }

        const profile = data as { username?: string | null; role?: string | null } | null;
        const username = profile?.username?.trim() || '';
        setDisplayName(username);
        const admin = profile?.role === 'Admin';
        setIsAdmin(admin);

        if (admin) {
          const code = await getOrCreateTabletCode(userId).catch(() => null);
          if (!cancelled) setAdminCode(code);
        } else {
          setAdminCode(null);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[competition-hub] profile load error', e);
          setDisplayName('');
          setIsAdmin(false);
          setAdminCode(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const openLmsAdmin = () => {
    if (!adminCode) {
      Alert.alert('Admin tools unavailable', 'Your admin access code is not ready yet. Try again in a moment.');
      return;
    }
    router.push({
      pathname: '/(auth)/admin-lms',
      params: { code: adminCode, returnTo: '/competition-hub' },
    } as any);
  };

  const openAdminPanel = () => {
    if (!adminCode) {
      Alert.alert('Admin tools unavailable', 'Your admin access code is not ready yet. Try again in a moment.');
      return;
    }
    router.push({
      pathname: '/(auth)/admin',
      params: { code: adminCode, returnTo: '/competition-hub' },
    } as any);
  };

  const handleSignOut = () => {
    const confirmed =
      Platform.OS === 'web'
        ? typeof window !== 'undefined' && window.confirm('Are you sure you want to sign out?')
        : null;

    const runSignOut = async () => {
      setSigningOut(true);
      try {
        await clearTabletCodeCache();
        await signOut();
        router.replace('/(auth)/login');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not sign out';
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
        else Alert.alert('Error', msg);
      } finally {
        setSigningOut(false);
      }
    };

    if (Platform.OS === 'web') {
      if (confirmed) void runSignOut();
      return;
    }

    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void runSignOut();
        },
      },
    ]);
  };

  const selectTab = (next: HubTab) => {
    if (next === tab) return;
    setTab(next);

    contentOpacity.setValue(0);
    contentShift.setValue(next === 'racing' ? 12 : next === 'admin' ? 8 : -12);

    const animations = [
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(contentShift, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ];

    if (next === 'football' || next === 'racing') {
      animations.unshift(
        Animated.timing(sportProgress, {
          toValue: next === 'racing' ? 1 : 0,
          duration: 380,
          useNativeDriver: false,
        })
      );
    }

    Animated.parallel(animations).start();
  };

  const horizontalPad = isCompact ? theme.spacing.md : isDesktop ? theme.spacing.xxl : theme.spacing.lg;
  const contentMax = isDesktop ? 1080 : 640;

  const footballAccent = theme.colors.accent;
  const racingAccent = isDark ? '#c4a35a' : '#9a7b2f';
  const adminPalette = getAdminAccent(isDark);
  const adminAccent = adminPalette.accent;
  const activeAccent =
    tab === 'racing' ? racingAccent : tab === 'admin' ? adminAccent : footballAccent;

  const footballBg = useMemo(
    () =>
      isDark
        ? (['#050805', '#0a120e', '#070a08'] as const)
        : (['#f4faf5', '#e8f2ea', '#f7faf7'] as const),
    [isDark]
  );
  const racingBg = useMemo(
    () =>
      isDark
        ? (['#0a0805', '#14100a', '#090806'] as const)
        : (['#faf7f1', '#f3ecdf', '#faf8f4'] as const),
    [isDark]
  );

  const footballOpacity = sportProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const racingOpacity = sportProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const modes: ModeItem[] =
    tab === 'football'
      ? [
          {
            key: 'lms',
            title: 'Last Man Standing',
            status: 'Open',
            onPress: () => {
              void setLastRoute('/(lms)');
              router.push('/(lms)' as any);
            },
          },
          {
            key: 'first2-twenty',
            title: 'First2 Twenty',
            status: 'Coming soon',
            unavailable: true,
          },
          {
            key: 'first2-6',
            title: 'First2 6',
            status: 'Coming soon',
            unavailable: true,
          },
        ]
      : tab === 'racing'
        ? [
            {
              key: 'pat-nutter',
              title: 'The Pat Nutter',
              status: 'Season ended',
              unavailable: true,
            },
          ]
        : [
            {
              key: 'racing-admin',
              title: 'Racing',
              status: 'Open',
              onPress: openAdminPanel,
            },
            {
              key: 'football-admin',
              title: 'Football',
              status: 'Open',
              onPress: openLmsAdmin,
            },
          ];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: theme.colors.background,
        },
        layer: {
          ...StyleSheet.absoluteFillObject,
        },
        header: {
          paddingTop: isWeb
            ? Math.max(theme.spacing.md, insets.top + 6)
            : insets.top + theme.spacing.sm,
          paddingHorizontal: horizontalPad,
          paddingBottom: theme.spacing.sm,
          zIndex: 2,
        },
        headerInner: {
          width: '100%',
          maxWidth: contentMax,
          alignSelf: 'center',
          flexDirection: isDesktop ? 'row' : 'column',
          alignItems: isDesktop ? 'center' : 'stretch',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
        },
        brandTitle: {
          fontFamily: theme.fontFamily.swish,
          fontSize: isCompact ? 24 : 28,
          color: theme.colors.text,
          letterSpacing: 0.6,
        },
        brandSub: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 10,
          fontWeight: '700',
          color: activeAccent,
          letterSpacing: 4.5,
          marginTop: 2,
        },
        headerRight: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          flexWrap: 'wrap',
          justifyContent: isDesktop ? 'flex-end' : 'space-between',
        },
        signOutBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        signOutText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.textSecondary,
        },
        tabRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.lg,
          alignSelf: isDesktop ? 'auto' : 'flex-start',
        },
        tab: {
          paddingVertical: 8,
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        tabActive: {
          borderBottomColor: activeAccent,
        },
        tabLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          letterSpacing: 0.4,
          color: theme.colors.textMuted,
        },
        tabLabelActive: {
          color: activeAccent,
        },
        greetingWrap: {
          paddingHorizontal: horizontalPad,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.xs,
          zIndex: 2,
        },
        greetingInner: {
          width: '100%',
          maxWidth: contentMax,
          alignSelf: 'center',
          alignItems: 'center',
        },
        hello: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isCompact ? 14 : 15,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
        adminBadge: {
          marginTop: 6,
          alignSelf: 'center',
          paddingHorizontal: 10,
          paddingVertical: 3,
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: adminAccent,
          backgroundColor: adminPalette.accentMuted,
        },
        adminBadgeText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          color: adminAccent,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
        },
        scroll: {
          flex: 1,
          zIndex: 1,
        },
        scrollContent: {
          flexGrow: 1,
          paddingHorizontal: horizontalPad,
          paddingTop: pinBodyTop ? theme.spacing.md : theme.spacing.lg,
          paddingBottom: theme.spacing.xl,
          justifyContent: pinBodyTop ? 'flex-start' : 'center',
          alignItems: 'center',
        },
        contentInner: {
          width: '100%',
          maxWidth: isDesktop ? 560 : 480,
          alignSelf: 'center',
        },
        sectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: isCompact ? 28 : 32,
          fontWeight: '700',
          color: activeAccent,
          letterSpacing: -0.5,
          marginBottom: theme.spacing.lg,
          textAlign: 'center',
        },
        panel: {
          width: '100%',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: isDark ? `${activeAccent}40` : `${activeAccent}33`,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.md,
        },
        panelLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          color: activeAccent,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
          marginBottom: theme.spacing.md,
        },
        modeGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
        },
        footer: {
          paddingTop: theme.spacing.sm,
          paddingBottom: Math.max(insets.bottom, theme.spacing.md),
          paddingHorizontal: horizontalPad,
          alignItems: 'center',
          zIndex: 2,
        },
        legalRow: {
          flexDirection: 'row',
          alignItems: 'center',
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
          opacity: 0.45,
        },
      }),
    [
      theme,
      isCompact,
      isDesktop,
      pinBodyTop,
      isWeb,
      isDark,
      horizontalPad,
      contentMax,
      insets.top,
      insets.bottom,
      activeAccent,
      adminAccent,
      adminPalette.accentMuted,
    ]
  );

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.layer, { opacity: footballOpacity }]} pointerEvents="none">
        <LinearGradient colors={[...footballBg]} style={StyleSheet.absoluteFill} />
        <ContourDecor color={isDark ? 'rgba(34,197,94,0.35)' : 'rgba(21,128,61,0.22)'} compact={isCompact} />
      </Animated.View>
      <Animated.View style={[styles.layer, { opacity: racingOpacity }]} pointerEvents="none">
        <LinearGradient colors={[...racingBg]} style={StyleSheet.absoluteFill} />
        <ContourDecor color={isDark ? 'rgba(196,163,90,0.32)' : 'rgba(154,123,47,0.22)'} compact={isCompact} />
      </Animated.View>
      {tab === 'admin' ? (
        <View style={styles.layer} pointerEvents="none">
          <LinearGradient colors={[...adminPalette.bg]} style={StyleSheet.absoluteFill} />
          <ContourDecor color={adminPalette.decor} compact={isCompact} />
        </View>
      ) : null}

      <Animated.View
        style={[styles.header, { opacity: enterOpacity, transform: [{ translateY: enterRise }] }]}
      >
        <View style={styles.headerInner}>
          <View>
            <Text style={styles.brandTitle}>Top Tipster</Text>
            <Text style={styles.brandSub}>SPORTS</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.tabRow} accessibilityRole="tablist">
              {([
                { key: 'football' as const, label: 'Football' },
                { key: 'racing' as const, label: 'Racing' },
                ...(isAdmin ? [{ key: 'admin' as const, label: 'Admin' }] : []),
              ]).map((item) => {
                const active = tab === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => selectTab(item.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={[styles.tab, active && styles.tabActive]}
                    hitSlop={6}
                  >
                    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={styles.signOutBtn}
              onPress={handleSignOut}
              disabled={signingOut}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              {signingOut ? (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
              ) : (
                <>
                  <Ionicons name="log-out-outline" size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.signOutText}>Sign out</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.greetingWrap,
          { opacity: enterOpacity, transform: [{ translateY: enterRise }] },
        ]}
      >
        <View style={styles.greetingInner}>
          <Text style={styles.hello}>Hi{displayName ? `, ${displayName}` : ''}</Text>
          {isAdmin ? (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          ) : null}
        </View>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <Animated.View
          style={[
            styles.contentInner,
            { opacity: enterOpacity, transform: [{ translateY: enterRise }] },
          ]}
        >
          <Animated.View
            style={{ opacity: contentOpacity, transform: [{ translateY: contentShift }] }}
          >
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {tab === 'football' ? 'Football' : tab === 'racing' ? 'Racing' : 'Admin'}
            </Text>

            <View style={styles.panel}>
              <Text style={styles.panelLabel}>
                {tab === 'admin' ? 'Choose a sport' : 'Select a mode'}
              </Text>
              <View style={styles.modeGrid}>
                {modes.map((item) => (
                  <ModeTile key={item.key} item={item} accent={activeAccent} />
                ))}
              </View>
            </View>
          </Animated.View>
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
