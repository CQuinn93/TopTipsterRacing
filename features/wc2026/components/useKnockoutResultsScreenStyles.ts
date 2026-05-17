import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import {
  ANTE_POST_WEB_MAX_WIDTH,
  useAntePostWebLayout,
} from '@/features/wc2026/utils/ante-post-web-layout';

/** Standings / advancing-teams screens after each knockout stage (and group → R32). */
export function useKnockoutResultsScreenStyles() {
  const theme = useTheme();
  const { isWeb, isWebGrid, isWeb3Col } = useAntePostWebLayout();
  const badgeWidth = isWeb3Col ? '23%' : isWebGrid ? '31%' : '30%';

  return useMemo(
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
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
        },
        loadingText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
        scrollView: { flex: 1 },
        scrollContent: {
          padding: theme.spacing.md,
          paddingBottom: theme.spacing.xl,
          width: '100%',
          ...(isWeb
            ? {
                maxWidth: ANTE_POST_WEB_MAX_WIDTH,
                alignSelf: 'center',
              }
            : {}),
        },
        headerSection: {
          marginBottom: theme.spacing.lg,
        },
        sectionTitle: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 22,
          fontWeight: '700',
          marginBottom: theme.spacing.sm,
          textAlign: isWeb ? 'center' : 'left',
        },
        description: {
          fontFamily: theme.fontFamily.light,
          color: theme.colors.textSecondary,
          fontSize: 14,
          lineHeight: 22,
          textAlign: 'center',
          marginBottom: theme.spacing.sm,
        },
        groupContainer: {
          marginBottom: theme.spacing.lg,
          width: '100%',
        },
        groupTitle: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 18,
          fontWeight: '700',
          marginBottom: theme.spacing.sm,
        },
        tableWrapper: {
          position: 'relative',
          width: '100%',
        },
        section: {
          marginBottom: theme.spacing.xl,
          width: '100%',
        },
        sectionHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.md,
        },
        sectionHeaderIndicator: {
          width: 4,
          height: 24,
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.sm,
        },
        sectionHeaderIndicatorRed: {
          backgroundColor: theme.colors.error,
        },
        sectionHeaderTitle: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 18,
          fontWeight: '700',
          flex: 1,
        },
        teamsGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
          justifyContent: isWeb ? 'center' : 'flex-start',
        },
        teamBadge: {
          width: badgeWidth,
          minWidth: isWeb ? 140 : 100,
          maxWidth: isWeb ? 220 : undefined,
          alignItems: 'center',
          padding: theme.spacing.sm,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.accentMuted,
          borderWidth: 1,
          borderColor: theme.colors.accent,
        },
        teamBadgeKnockedOut: {
          backgroundColor: `${theme.colors.error}18`,
          borderColor: theme.colors.error,
          opacity: 0.85,
        },
        teamBadgeName: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 12,
          fontWeight: '600',
          textAlign: 'center',
          marginTop: theme.spacing.sm,
        },
        teamBadgeNameKnockedOut: {
          opacity: 0.9,
        },
        matchCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          width: '100%',
          ...(isWeb ? { maxWidth: 480, alignSelf: 'center' } : {}),
        },
        matchNumber: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.accent,
          fontSize: 12,
          fontWeight: '600',
          marginBottom: theme.spacing.sm,
          textAlign: 'center',
        },
        matchContent: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.sm,
        },
        teamSection: {
          flex: 1,
          alignItems: 'center',
          minWidth: 0,
          gap: theme.spacing.sm,
          padding: theme.spacing.sm,
          borderRadius: theme.radius.md,
        },
        teamName: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 13,
          fontWeight: '600',
          textAlign: 'center',
          marginTop: theme.spacing.xs,
        },
        scoreText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 22,
          fontWeight: '700',
          color: theme.colors.text,
        },
        vsText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.textMuted,
          fontSize: 14,
          fontWeight: '700',
          flexShrink: 0,
        },
        continueButton: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          alignItems: 'center',
          marginTop: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
          width: '100%',
          ...(isWeb ? { maxWidth: 420, alignSelf: 'center' } : {}),
        },
        continueButtonText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.white,
          fontSize: 17,
          fontWeight: '700',
        },
        matchesResultsGrid: {
          width: '100%',
          gap: theme.spacing.md,
          ...(isWebGrid
            ? {
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }
            : {}),
        },
        matchCardInGrid: {
          width: isWebGrid ? (isWeb3Col ? '31.5%' : '48%') : '100%',
          minWidth: isWebGrid ? 300 : undefined,
        },
        winnerTeam: {
          backgroundColor: theme.colors.accentMuted,
          borderWidth: 1,
          borderColor: theme.colors.accent,
        },
        loserTeam: {
          backgroundColor: `${theme.colors.error}14`,
          opacity: 0.75,
        },
        teamSource: {
          fontFamily: theme.fontFamily.light,
          color: theme.colors.textMuted,
          fontSize: 11,
          textAlign: 'center',
          maxWidth: 120,
        },
        score: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 24,
          fontWeight: '700',
        },
        advanceText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.accent,
          fontSize: 10,
          fontWeight: '600',
          marginTop: 4,
        },
        bronzeText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.statusAccent,
          fontSize: 10,
          fontWeight: '600',
          marginTop: 4,
        },
      }),
    [theme, isWeb, isWebGrid, isWeb3Col, badgeWidth]
  );
}
