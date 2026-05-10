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
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { wcHref } from '@/features/wc2026/utils/href';

const LOGO_LIGHT = require('../assets/Light Theme Logo.png');
const LOGO_DARK = require('../assets/Dark Theme Logo.png');

const COLOR_FOOTBALL = '#2e3192';
const COLOR_RACING = '#006838';
const COLOR_GOLF = '#8dc63f';

type SportCardProps = {
  title: string;
  subtitle: string;
  brandColor: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
};

function SportCard({ title, subtitle, brandColor, icon, onPress, disabled, comingSoon }: SportCardProps) {
  const theme = useTheme();
  const isLight = String(theme.colors.background) === String(lightTheme.colors.background);
  const tintBg = `${brandColor}14`;

  const cardStyles = useMemo(
    () =>
      StyleSheet.create({
        sportCardOuter: { width: '100%' as const },
        sportCardInner: {
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: theme.radius.md,
          borderWidth: 1,
          paddingVertical: 12,
          paddingRight: theme.spacing.sm,
          paddingLeft: 0,
          overflow: 'hidden',
          borderColor: theme.colors.border,
          backgroundColor: isLight ? theme.colors.surface : theme.colors.surfaceElevated,
        },
        sportCardDisabled: { opacity: 0.72 },
        sportAccent: { width: 4, alignSelf: 'stretch' as const, marginRight: 10 },
        sportIconWrap: {
          width: 40,
          height: 40,
          borderRadius: theme.radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: theme.spacing.sm,
        },
        sportTextCol: { flex: 1, minWidth: 0 },
        sportTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
        sportTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '700',
          flexShrink: 1,
          color: theme.colors.text,
        },
        sportSubtitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          marginTop: 2,
          lineHeight: 16,
          color: theme.colors.textSecondary,
        },
        pill: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: theme.radius.full,
          borderWidth: 1,
        },
        pillText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 10,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        },
      }),
    [theme, isLight]
  );

  const content = (
    <View style={[cardStyles.sportCardInner, disabled && cardStyles.sportCardDisabled]}>
      <View style={[cardStyles.sportAccent, { backgroundColor: brandColor }]} />
      <View style={[cardStyles.sportIconWrap, { backgroundColor: tintBg }]}>
        <Ionicons name={icon} size={22} color={brandColor} />
      </View>
      <View style={cardStyles.sportTextCol}>
        <View style={cardStyles.sportTitleRow}>
          <Text style={cardStyles.sportTitle} numberOfLines={1}>
            {title}
          </Text>
          {comingSoon ? (
            <View style={[cardStyles.pill, { borderColor: brandColor }]}>
              <Text style={[cardStyles.pillText, { color: brandColor }]}>Coming soon</Text>
            </View>
          ) : null}
        </View>
        <Text style={cardStyles.sportSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      {!disabled ? (
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      ) : (
        <View style={{ width: 20 }} />
      )}
    </View>
  );

  if (disabled || !onPress) {
    return <View style={cardStyles.sportCardOuter}>{content}</View>;
  }

  return (
    <TouchableOpacity style={cardStyles.sportCardOuter} onPress={onPress} activeOpacity={0.82}>
      {content}
    </TouchableOpacity>
  );
}

export default function CompetitionHubScreen() {
  const theme = useTheme();
  const { session, userId } = useAuth();
  const { width } = useWindowDimensions();
  const isLight = String(theme.colors.background) === String(lightTheme.colors.background);
  const [displayName, setDisplayName] = useState<string>('');

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

  const maxContentWidth = Math.min(440, width - theme.spacing.md * 2);
  const logoSource = isLight ? LOGO_LIGHT : LOGO_DARK;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: theme.colors.background,
        },
        scroll: {
          flex: 1,
        },
        scrollContent: {
          flexGrow: 1,
          paddingHorizontal: theme.spacing.md,
          paddingTop: Platform.OS === 'web' ? theme.spacing.xl : theme.spacing.lg,
          paddingBottom: theme.spacing.xxl,
          alignItems: 'center',
        },
        inner: {
          width: '100%' as const,
          maxWidth: 440,
        },
        logoWrap: {
          alignItems: 'center',
          marginBottom: theme.spacing.xl,
        },
        logo: {
          width: Math.min(320, maxContentWidth),
          height: 104,
        },
        welcomeLabel: {
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.textMuted,
          textAlign: 'center',
          letterSpacing: 0.3,
          marginBottom: theme.spacing.md,
        },
        welcomeName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '600',
          color: theme.colors.text,
          textAlign: 'center',
          lineHeight: 20,
          marginTop: 0,
          marginBottom: theme.spacing.md,
        },
        headline: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.textSecondary,
          textAlign: 'center',
          marginBottom: theme.spacing.lg,
          lineHeight: 22,
        },
        sectionLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '600',
          color: theme.colors.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginBottom: theme.spacing.sm,
          alignSelf: 'flex-start',
        },
        stack: {
          gap: theme.spacing.sm,
          width: '100%' as const,
        },
      }),
    [theme, maxContentWidth]
  );

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { maxWidth: maxContentWidth + theme.spacing.md * 2 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.inner, { maxWidth: maxContentWidth }]}>
          <View style={styles.logoWrap}>
            <Image source={logoSource} style={styles.logo} contentFit="contain" accessibilityLabel="Top Tipster" />
          </View>

          <Text style={styles.welcomeLabel}>Welcome back</Text>
          <Text style={styles.welcomeName}>{displayName || 'there'}</Text>
          <Text style={styles.headline}>Choose a sport to continue with the same account everywhere.</Text>

          <Text style={styles.sectionLabel}>Sports</Text>
          <View style={styles.stack}>
            <SportCard
              title="Football"
              subtitle="World Cup 2026 — predictions and fixtures"
              brandColor={COLOR_FOOTBALL}
              icon="football-outline"
              onPress={() => router.replace(wcHref('/(wc2026)/(tabs)'))}
            />
            <SportCard
              title="Racing"
              subtitle="Horse racing competitions and daily selections"
              brandColor={COLOR_RACING}
              icon="trophy-outline"
              onPress={() => router.replace('/(app)')}
            />
            <SportCard
              title="Golf"
              subtitle="Fantasy golf — launching here soon"
              brandColor={COLOR_GOLF}
              icon="flag-outline"
              disabled
              comingSoon
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
