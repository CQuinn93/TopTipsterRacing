import { useMemo } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import {
  ANTE_POST_WEB_MAX_WIDTH,
  ANTE_POST_WEB_SINGLE_CARD_MAX,
  useAntePostWebLayout,
} from '@/features/wc2026/utils/ante-post-web-layout';

type KnockoutScreenStyleOptions = {
  /** One-match stages (Final, Bronze): centred card instead of multi-column grid. */
  compactSingleMatch?: boolean;
};

/**
 * Shared layout/colors for WC knockout score prediction screens (R32 → Final).
 * Matches app ThemeContext (Laraz + green accent, light/dark surfaces).
 */
export function useKnockoutPredictionsScreenStyles(options?: KnockoutScreenStyleOptions) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isSmall = width < 375;
  const { isWeb, isWebGrid, gridCardWidth } = useAntePostWebLayout();
  const useMatchGrid = isWebGrid && !options?.compactSingleMatch;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.background,
        },
        loadingContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
        },
        loadingText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '600',
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
        keyboardAvoidingView: {
          flex: 1,
          margin: 0,
          padding: 0,
        },
        scrollView: {
          flex: 1,
        },
        scrollContent: {
          padding: isSmall ? theme.spacing.sm + 2 : theme.spacing.sm + 6,
          paddingBottom: isSmall ? 24 : theme.spacing.lg,
          width: '100%',
          ...(isWeb
            ? {
                maxWidth: ANTE_POST_WEB_MAX_WIDTH,
                alignSelf: 'center',
              }
            : {}),
        },
        headerSection: {
          marginBottom: theme.spacing.sm + 4,
        },
        description: {
          fontFamily: theme.fontFamily.light,
          color: theme.colors.textSecondary,
          fontSize: isSmall ? 12 : 13,
          marginBottom: theme.spacing.xs + 2,
          textAlign: 'center',
          lineHeight: isSmall ? 17 : 19,
        },
        matchesGrid: {
          width: '100%',
          ...(useMatchGrid
            ? {
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: theme.spacing.md,
                justifyContent: 'flex-start',
              }
            : {
                gap: theme.spacing.sm + 2,
                ...(options?.compactSingleMatch && isWeb
                  ? { alignItems: 'center' as const }
                  : {}),
              }),
        },
        matchCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          padding: theme.spacing.sm,
          borderWidth: 2,
          borderColor: 'transparent',
          width: useMatchGrid ? gridCardWidth : '100%',
          marginBottom: useMatchGrid ? 0 : theme.spacing.sm + 2,
          minWidth: useMatchGrid ? 300 : undefined,
          ...(options?.compactSingleMatch && isWeb
            ? {
                maxWidth: ANTE_POST_WEB_SINGLE_CARD_MAX,
                alignSelf: 'center',
              }
            : {}),
        },
        matchCardFilled: {
          borderColor: theme.colors.accent,
        },
        matchNumber: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.accent,
          fontSize: 11,
          fontWeight: '600',
          marginBottom: theme.spacing.xs + 2,
          textAlign: 'center',
        },
        matchScoreRowWrap: {
          marginBottom: theme.spacing.xs + 2,
        },
        advanceSection: {
          marginTop: theme.spacing.sm + 2,
          marginBottom: theme.spacing.sm,
          paddingTop: theme.spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
        },
        advanceTitle: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 13,
          fontWeight: '700',
          marginBottom: theme.spacing.sm,
        },
        advanceButtons: {
          flexDirection: 'row',
          gap: theme.spacing.sm,
          justifyContent: 'space-around',
        },
        advanceButton: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.xs + 4,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.sm + 4,
          borderRadius: theme.radius.md,
          borderWidth: 2,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
        advanceButtonSelected: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        advanceButtonText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 13,
          fontWeight: '600',
          textAlign: 'center',
        },
        advanceButtonTextSelected: {
          color: theme.colors.accent,
          fontWeight: '700',
        },
        winnerSection: {
          marginTop: theme.spacing.xs + 2,
          marginBottom: theme.spacing.xs + 2,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.sm + 4,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.accentMuted,
        },
        winnerText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.accent,
          fontSize: 13,
          fontWeight: '700',
          textAlign: 'center',
        },
        winnerSectionLocked: {
          backgroundColor: theme.colors.surfaceElevated,
        },
        winnerTextLocked: {
          color: theme.colors.text,
        },
        winnersHeader: {
          backgroundColor: theme.colors.surface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          paddingVertical: theme.spacing.sm + 4,
          paddingHorizontal: theme.spacing.sm,
          width: '100%',
          ...(isWeb
            ? {
                maxWidth: ANTE_POST_WEB_MAX_WIDTH,
                alignSelf: 'center',
              }
            : {}),
        },
        winnersHeaderTitle: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.textSecondary,
          fontSize: 12,
          fontWeight: '600',
          textAlign: 'center',
          marginBottom: theme.spacing.sm,
        },
        winnersContainer: {
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.xs,
        },
        winnerBadge: {
          alignItems: 'center',
          marginHorizontal: theme.spacing.xs,
          minWidth: 60,
          maxWidth: 80,
        },
        winnersStripText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 10,
          fontWeight: '600',
          textAlign: 'center',
          marginTop: theme.spacing.xs,
          maxWidth: 80,
        },
        saveButton: {
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.accent,
          paddingVertical: isSmall ? 14 : theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          alignItems: 'center',
          marginTop: theme.spacing.md,
          width: useMatchGrid ? '100%' : undefined,
        },
        saveButtonDisabled: {
          opacity: 0.45,
        },
        saveButtonText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.accent,
          fontSize: isSmall ? 16 : 17,
          fontWeight: '700',
        },
        lockedMessage: {
          backgroundColor: theme.colors.surface,
          padding: theme.spacing.md,
          borderRadius: theme.radius.md,
          marginBottom: theme.spacing.md,
          borderLeftWidth: 4,
          borderLeftColor: theme.colors.accent,
          width: '100%',
        },
        lockedMessageText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 14,
          fontWeight: '600',
          textAlign: 'center',
        },
        advanceButtonDisabled: {
          opacity: 0.5,
        },
        continueButton: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: isSmall ? 14 : theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          alignItems: 'center',
          marginTop: theme.spacing.sm + 4,
          marginBottom: theme.spacing.lg,
          width: useMatchGrid ? '100%' : undefined,
        },
        continueButtonDisabled: {
          opacity: 0.35,
        },
        continueButtonText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.white,
          fontSize: isSmall ? 16 : 17,
          fontWeight: '700',
        },
      }),
    [theme, isSmall, isWeb, isWebGrid, useMatchGrid, gridCardWidth, options?.compactSingleMatch]
  );

  return { styles, useMatchGrid };
}

/** Extra chrome for the single-match Final screen (trophy block, gold border, submit row). */
export function useFinalPredictionExtrasStyles() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const isSmall = width < 375;
  const { isWeb } = useAntePostWebLayout();

  return useMemo(
    () =>
      StyleSheet.create({
        matchCardWrapper: {
          width: '100%',
          marginBottom: theme.spacing.md,
          alignItems: 'stretch',
          ...(isWeb
            ? {
                maxWidth: ANTE_POST_WEB_SINGLE_CARD_MAX,
                alignSelf: 'center',
              }
            : {}),
        },
        finaleText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.accent,
          fontSize: isSmall ? 22 : 26,
          fontWeight: '800',
          textAlign: 'center',
          alignSelf: 'center',
          marginBottom: theme.spacing.sm,
        },
        matchCardGold: {
          borderWidth: 3,
          borderColor: theme.colors.statusAccent,
          shadowColor: theme.colors.statusAccent,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.35,
          shadowRadius: 8,
          elevation: 6,
        },
        championSection: {
          marginTop: theme.spacing.md,
          paddingTop: theme.spacing.md,
          borderTopWidth: 2,
          borderTopColor: theme.colors.statusAccent,
          alignItems: 'center',
        },
        winnerChampionBlock: {
          alignItems: 'center',
          gap: theme.spacing.sm,
        },
        championName: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: isSmall ? 16 : 18,
          fontWeight: '700',
          textAlign: 'center',
        },
        winnerSubtitle: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.accent,
          fontSize: isSmall ? 14 : 15,
          fontWeight: '700',
          textAlign: 'center',
        },
        buttonColumn: {
          gap: theme.spacing.sm + 4,
          marginTop: theme.spacing.lg,
          width: '100%',
          ...(isWeb
            ? {
                maxWidth: ANTE_POST_WEB_SINGLE_CARD_MAX,
                alignSelf: 'center',
              }
            : {}),
        },
        submitCTA: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: isSmall ? 14 : theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          alignItems: 'center',
        },
        submitCTAText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.white,
          fontSize: isSmall ? 16 : 17,
          fontWeight: '700',
        },
        mutedButton: {
          opacity: 0.5,
        },
        lockedStack: {
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.lg,
          gap: theme.spacing.sm + 4,
        },
        lockedCaption: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.textSecondary,
          fontSize: isSmall ? 14 : 16,
          fontWeight: '600',
          textAlign: 'center',
        },
      }),
    [theme, isSmall, isWeb]
  );
}
