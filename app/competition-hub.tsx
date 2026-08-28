import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, getSupabaseUrl } from '@/lib/supabase';
import { setLastRoute } from '@/lib/lastRoute';
import { getAdminAccent } from '@/constants/adminUi';
import { isStaffRole, isOwnerRole, type ProfileRole } from '@/lib/adminSession';
import { isCurrentUserBanned } from '@/lib/ownerApi';
import {
  DEFAULT_HUB_GAME_MODES,
  getHubGameModes,
  HUB_GAME_MODE_LABELS,
  ownerSetHubGameModes,
  type HubGameModeKey,
  type HubGameModes,
} from '@/lib/hubGameModes';
import {
  ownerListFootballPlayersFplAlerts,
  ownerSetFootballPlayerFlagged,
} from '@/lib/f2t/api';
import { FootballPlayerFlagCard } from '@/components/f2t/FootballPlayerFlagCard';

const DESKTOP_BREAKPOINT = 900;
const COMPACT_BREAKPOINT = 420;

const TERMS_OF_USE_URL =
  'https://doc-hosting.flycricket.io/top-tipster-racing-terms-of-use/bf206b6c-02a2-4394-aedc-dbf95f95d955/terms';
const PRIVACY_POLICY_URL =
  'https://doc-hosting.flycricket.io/top-tipster-racing-fantasy-sports-privacy-policy/98fbb3c4-4795-4774-bba7-c2ebb872eb92/privacy';

type HubTab = 'football' | 'racing' | 'admin' | 'account';

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

function buildHubModeItem(
  key: string,
  title: string,
  modeKey: HubGameModeKey,
  modes: HubGameModes,
  isOwner: boolean,
  onPress: (() => void) | undefined
): ModeItem {
  if (!onPress) {
    return { key, title, status: 'Coming soon', unavailable: true };
  }
  const openForUsers = modes[modeKey];
  if (isOwner) {
    return {
      key,
      title,
      status: openForUsers ? 'Open' : 'Owner access',
      onPress,
    };
  }
  if (!openForUsers) {
    return { key, title, status: 'Coming soon', unavailable: true };
  }
  return { key, title, status: 'Open', onPress };
}

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
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 15,
          color: theme.colors.text,
          letterSpacing: -0.2,
          lineHeight: 20,
        },
        status: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
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
  const { userId, signOut, signOutAllDevices } = useAuth();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [displayName, setDisplayName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [hubModes, setHubModes] = useState<HubGameModes>(DEFAULT_HUB_GAME_MODES);
  const [hubModesSaving, setHubModesSaving] = useState(false);
  const [fplAlertPlayers, setFplAlertPlayers] = useState<Array<Record<string, unknown>>>([]);
  const [fplAlertsLoading, setFplAlertsLoading] = useState(false);
  const [fplBusyPlayerId, setFplBusyPlayerId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const initialTab = String(params.tab ?? '').trim();
  const [tab, setTab] = useState<HubTab>(
    initialTab === 'admin' || initialTab === 'racing' || initialTab === 'account'
      ? (initialTab as HubTab)
      : 'football'
  );

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
    if (!isOwner && tab === 'admin') setTab('football');
  }, [isOwner, tab]);

  useEffect(() => {
    const next = String(params.tab ?? '').trim();
    if (next === 'admin' || next === 'racing' || next === 'account' || next === 'football') {
      setTab(next);
    }
  }, [params.tab]);

  const loadHubModes = () => {
    void getHubGameModes()
      .then(setHubModes)
      .catch(() => setHubModes(DEFAULT_HUB_GAME_MODES));
  };

  const loadFplAlerts = useCallback(async () => {
    if (!isOwner) return;
    setFplAlertsLoading(true);
    try {
      const list = await ownerListFootballPlayersFplAlerts();
      setFplAlertPlayers(list);
    } catch (e) {
      console.warn('[competition-hub] FPL alerts load failed', e);
      setFplAlertPlayers([]);
    } finally {
      setFplAlertsLoading(false);
    }
  }, [isOwner]);

  const toggleFplPlayerFlag = async (playerId: string, flagged: boolean) => {
    setFplBusyPlayerId(playerId);
    try {
      const res = await ownerSetFootballPlayerFlagged(playerId, flagged);
      if (!res.success) {
        Alert.alert('Error', res.error ?? 'Could not update player');
        return;
      }
      setFplAlertPlayers((prev) =>
        prev.map((p) =>
          String(p.id) === playerId ? { ...p, owner_flagged: flagged } : p
        )
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update player');
    } finally {
      setFplBusyPlayerId(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadHubModes();
      if (tab === 'admin' && isOwner) {
        void loadFplAlerts();
      }
    }, [tab, isOwner, loadFplAlerts])
  );

  useEffect(() => {
    if (tab === 'admin' && isOwner) {
      void loadFplAlerts();
    }
  }, [tab, isOwner, loadFplAlerts]);

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
      setIsOwner(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (await isCurrentUserBanned()) {
          if (cancelled) return;
          Alert.alert('Account banned', 'This account has been banned and cannot continue.');
          await signOut();
          router.replace('/(auth)/login');
          return;
        }

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
          setIsOwner(false);
          return;
        }

        const profile = data as { username?: string | null; role?: string | null } | null;
        const username = profile?.username?.trim() || '';
        const role = (profile?.role ?? 'User') as ProfileRole;
        setDisplayName(username);
        setIsAdmin(isStaffRole(role));
        setIsOwner(isOwnerRole(role));
      } catch (e) {
        if (!cancelled) {
          console.warn('[competition-hub] profile load error', e);
          setDisplayName('');
          setIsAdmin(false);
          setIsOwner(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, signOut]);

  const openLmsAdmin = () => {
    // Day-to-day LMS admin lives in-mode; Owners use the owner console.
    router.push({
      pathname: '/(auth)/owner',
      params: { returnTo: '/competition-hub?tab=admin' },
    } as any);
  };

  const openAdminPanel = () => {
    router.push({
      pathname: '/(auth)/owner',
      params: { returnTo: '/competition-hub?tab=admin' },
    } as any);
  };

  const openOwnerPanel = () => {
    router.push({
      pathname: '/(auth)/owner',
      params: { returnTo: '/competition-hub?tab=admin' },
    } as any);
  };

  const openOwnerGameModes = () => {
    router.push({
      pathname: '/(auth)/owner',
      params: { returnTo: '/competition-hub?tab=admin', ownerTab: 'game_modes' },
    } as any);
  };

  const saveHubMode = async (key: HubGameModeKey, open: boolean) => {
    const next = { ...hubModes, [key]: open };
    setHubModes(next);
    setHubModesSaving(true);
    try {
      const res = await ownerSetHubGameModes(next);
      if (!res.success) {
        Alert.alert('Error', res.error ?? 'Could not update game mode');
        const fresh = await getHubGameModes();
        setHubModes(fresh);
        return;
      }
      if (res.modes) setHubModes(res.modes);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update game mode');
      try {
        setHubModes(await getHubGameModes());
      } catch {
        setHubModes(DEFAULT_HUB_GAME_MODES);
      }
    } finally {
      setHubModesSaving(false);
    }
  };

  const handleSignOut = () => {
    const confirmed =
      Platform.OS === 'web'
        ? typeof window !== 'undefined' && window.confirm('Are you sure you want to sign out?')
        : null;

    const runSignOut = async () => {
      setSigningOut(true);
      try {
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

  const handleSignOutAllDevices = () => {
    const message =
      'This signs you out everywhere (phones, tablets, browsers) and stops notifications on those devices. Continue?';
    const confirmed =
      Platform.OS === 'web' ? typeof window !== 'undefined' && window.confirm(message) : null;

    const run = async () => {
      setSigningOutAll(true);
      try {
        await signOutAllDevices();
        router.replace('/(auth)/login');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not sign out of all devices';
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
        else Alert.alert('Error', msg);
      } finally {
        setSigningOutAll(false);
      }
    };

    if (Platform.OS === 'web') {
      if (confirmed) void run();
      return;
    }

    Alert.alert('Sign out of all devices', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out everywhere',
        style: 'destructive',
        onPress: () => {
          void run();
        },
      },
    ]);
  };

  const runDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      const token = s?.access_token;
      if (!token) {
        const msg = 'Not signed in.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
        else Alert.alert('Error', msg);
        return;
      }
      const url = `${getSupabaseUrl()}/functions/v1/delete-account`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          (body as { error?: string })?.error ?? 'Could not delete account. Try again later.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
        else Alert.alert('Error', msg);
        return;
      }
      await signOut();
      router.replace('/(auth)/login');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Your account has been permanently deleted.');
      } else {
        Alert.alert('Account deleted', 'Your account has been permanently deleted.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleDeleteAccount = () => {
    const warning =
      'This will permanently delete your account and all your data (selections, competition entries). You will not be able to sign in again with this email. This cannot be undone.';

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${warning} Are you sure?`)) {
        void runDeleteAccount();
      }
      return;
    }

    Alert.alert('Delete account', warning, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account',
        style: 'destructive',
        onPress: () => {
          void runDeleteAccount();
        },
      },
    ]);
  };

  const selectTab = (next: HubTab) => {
    if (next === tab) return;
    setTab(next);

    contentOpacity.setValue(0);
    contentShift.setValue(
      next === 'racing' ? 12 : next === 'admin' ? 8 : next === 'account' ? 6 : -12
    );

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
  const accountAccent = theme.colors.textSecondary;
  const activeAccent =
    tab === 'racing'
      ? racingAccent
      : tab === 'admin'
        ? adminAccent
        : tab === 'account'
          ? accountAccent
          : footballAccent;

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
          buildHubModeItem(
            'lms',
            'Last Man Standing',
            'lms',
            hubModes,
            isOwner,
            () => {
              void setLastRoute('/(lms)');
              router.replace('/(lms)' as any);
            }
          ),
          buildHubModeItem(
            'first2-twenty',
            'First2 Twenty',
            'f2t',
            hubModes,
            isOwner,
            () => {
              void setLastRoute('/(f2t)');
              router.replace('/(f2t)' as any);
            }
          ),
          buildHubModeItem('first2-6', 'First2 6', 'f2t6', hubModes, isOwner, undefined),
        ]
      : tab === 'racing'
        ? [
            buildHubModeItem(
              'top-tipster-racing',
              'Top Tipster Racing',
              'racing',
              hubModes,
              isOwner,
              () => {
                void setLastRoute('/(app)');
                router.replace('/(app)' as any);
              }
            ),
          ]
        : tab === 'admin'
          ? [
              {
                key: 'owner-console',
                title: 'Owner console',
                status: 'Users · competitions · exclusions',
                onPress: openOwnerPanel,
              },
              {
                key: 'owner-game-modes',
                title: 'Game modes (full panel)',
                status: 'Open / close modes for all users',
                onPress: openOwnerGameModes,
              },
            ]
          : [];

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
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
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
          fontFamily: theme.fontFamily.baiLight,
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
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
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
          fontFamily: theme.fontFamily.baiBold,
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
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
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
        gameModesCard: {
          width: '100%',
          marginBottom: theme.spacing.md,
          padding: theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          gap: theme.spacing.sm,
        },
        gameModesHint: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textSecondary,
          lineHeight: 18,
        },
        gameModeRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
          paddingVertical: 8,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        gameModeLabel: {
          flex: 1,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 14,
          color: theme.colors.text,
        },
        gameModeStatus: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        accountCard: {
          width: '100%',
          paddingVertical: theme.spacing.lg,
          paddingHorizontal: theme.spacing.md,
          gap: theme.spacing.md,
        },
        accountBlurb: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
          lineHeight: 20,
          textAlign: 'center',
        },
        deleteBtn: {
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 12,
          paddingHorizontal: 18,
          borderRadius: theme.radius.md,
          borderWidth: 1.5,
          borderColor: theme.colors.error,
          backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)',
        },
        deleteBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '700',
          color: theme.colors.error,
        },
        signOutAllBtn: {
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 12,
          paddingHorizontal: 18,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        signOutAllBtnText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '700',
          color: theme.colors.text,
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
                ...(isOwner ? [{ key: 'admin' as const, label: 'Admin' }] : []),
                { key: 'account' as const, label: 'Account' },
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
          {isOwner ? (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>Owner</Text>
            </View>
          ) : isAdmin ? (
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
              {tab === 'football'
                ? 'Football'
                : tab === 'racing'
                  ? 'Racing'
                  : tab === 'admin'
                    ? 'Admin'
                    : 'Account'}
            </Text>

            <View style={styles.panel}>
              {tab === 'account' ? (
                <View style={styles.accountCard}>
                  <Text style={styles.panelLabel}>Your account</Text>
                  <Text style={styles.accountBlurb}>
                    Lost a phone? Sign out of every device and stop notifications on those devices.
                    You will need to sign in again on phones you still use.
                  </Text>
                  <Pressable
                    style={styles.signOutAllBtn}
                    onPress={handleSignOutAllDevices}
                    disabled={signingOutAll || signingOut || deletingAccount}
                    accessibilityRole="button"
                    accessibilityLabel="Sign out of all devices"
                  >
                    {signingOutAll ? (
                      <ActivityIndicator size="small" color={theme.colors.text} />
                    ) : (
                      <>
                        <Ionicons name="phone-portrait-outline" size={18} color={theme.colors.text} />
                        <Text style={styles.signOutAllBtnText}>Sign out of all devices</Text>
                      </>
                    )}
                  </Pressable>
                  <Text style={styles.accountBlurb}>
                    Delete your account permanently if you no longer want to use Top Tipster. This
                    removes your profile and competition data and cannot be undone.
                  </Text>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={handleDeleteAccount}
                    disabled={deletingAccount || signingOutAll}
                    accessibilityRole="button"
                    accessibilityLabel="Delete account"
                  >
                    {deletingAccount ? (
                      <ActivityIndicator size="small" color={theme.colors.error} />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                        <Text style={styles.deleteBtnText}>Delete account</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              ) : (
                <>
                  {tab === 'admin' && isOwner ? (
                    <View style={styles.gameModesCard}>
                      <Text style={styles.panelLabel}>Game modes for users</Text>
                      <Text style={styles.gameModesHint}>
                        Toggle which modes appear open on the Football and Racing tabs. You always
                        have access to every mode.
                      </Text>
                      {(Object.keys(HUB_GAME_MODE_LABELS) as HubGameModeKey[]).map((key) => {
                        const open = hubModes[key];
                        return (
                          <View key={key} style={styles.gameModeRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.gameModeLabel}>{HUB_GAME_MODE_LABELS[key]}</Text>
                              <Text style={styles.gameModeStatus}>
                                {open ? 'Open to users' : 'Hidden from users'}
                              </Text>
                            </View>
                            {hubModesSaving ? (
                              <ActivityIndicator size="small" color={adminAccent} />
                            ) : (
                              <Switch
                                value={open}
                                onValueChange={(value) => void saveHubMode(key, value)}
                                trackColor={{
                                  false: theme.colors.border,
                                  true: adminAccent,
                                }}
                                thumbColor={theme.colors.surface}
                              />
                            )}
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                  {tab === 'admin' && isOwner ? (
                    <View style={styles.gameModesCard}>
                      <Text style={styles.panelLabel}>First2Twenty · FPL alerts</Text>
                      <Text style={styles.gameModesHint}>
                        Players with injury, doubt, suspension, or availability news from the daily
                        FPL sync. Exclude anyone who should not be pickable.
                      </Text>
                      {fplAlertsLoading ? (
                        <ActivityIndicator size="small" color={adminAccent} style={{ marginTop: 8 }} />
                      ) : fplAlertPlayers.length === 0 ? (
                        <Text style={styles.gameModesHint}>No current FPL alerts.</Text>
                      ) : (
                        fplAlertPlayers.map((p) => {
                          const id = String(p.id ?? '');
                          return (
                            <FootballPlayerFlagCard
                              key={id}
                              player={p}
                              accent={adminAccent}
                              busy={fplBusyPlayerId === id}
                              onToggleFlag={(playerId, flagged) =>
                                void toggleFplPlayerFlag(playerId, flagged)
                              }
                            />
                          );
                        })
                      )}
                    </View>
                  ) : null}
                  <Text style={styles.panelLabel}>
                    {tab === 'admin' ? 'Owner tools' : 'Select a mode'}
                  </Text>
                  <View style={styles.modeGrid}>
                    {modes.map((item) => (
                      <ModeTile key={item.key} item={item} accent={activeAccent} />
                    ))}
                  </View>
                </>
              )}
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
