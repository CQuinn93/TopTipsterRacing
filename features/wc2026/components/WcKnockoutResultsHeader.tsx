import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/contexts/ThemeContext';

type WcKnockoutResultsHeaderProps = {
  subtitle: string;
  onBack: () => void;
  /** Optional e.g. "3 of 16 matches completed" (prediction screens). */
  progressText?: string;
};

/** Shared header for WC knockout flows — Swish “Top Tipster” + optional progress. */
export function WcKnockoutResultsHeader({ subtitle, onBack, progressText }: WcKnockoutResultsHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
        back: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          minWidth: 76,
          paddingVertical: theme.spacing.xs,
        },
        backText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          color: theme.colors.accent,
        },
        titleCol: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.xs,
        },
        brand: {
          fontFamily: theme.fontFamily.swish,
          fontSize: 22,
          lineHeight: 28,
          color: theme.colors.text,
          textAlign: 'center',
          letterSpacing: 0.5,
        },
        sportLine: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '800',
          color: theme.colors.accent,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          marginTop: 2,
        },
        subtitle: {
          marginTop: 6,
          fontFamily: theme.fontFamily.light,
          fontSize: 13,
          lineHeight: 18,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
        progressText: {
          marginTop: 6,
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          color: theme.colors.accent,
          textAlign: 'center',
          paddingHorizontal: theme.spacing.sm,
        },
        headerSpacer: { minWidth: 76 },
      }),
    [theme]
  );

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity style={styles.back} onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
      <View style={styles.titleCol} pointerEvents="none">
        <Text style={styles.brand}>Top Tipster</Text>
        <Text style={styles.sportLine}>Football</Text>
        <Text style={styles.subtitle} numberOfLines={3}>
          {subtitle}
        </Text>
        {progressText ? (
          <Text style={styles.progressText} numberOfLines={1}>
            {progressText}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerSpacer} />
    </View>
  );
}
