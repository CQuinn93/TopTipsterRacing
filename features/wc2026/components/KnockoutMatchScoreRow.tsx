import { useMemo } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { CountryFlag } from '@/features/wc2026/components/CountryFlag';
import { antePostScoreFieldPlatformStyle } from '@/features/wc2026/utils/ante-post-web-layout';
import { showAntePostFilledHighlight } from '@/features/wc2026/utils/knockout-ui';

export type KnockoutMatchTeam = {
  code: string;
  name: string;
  source: string;
};

type KnockoutMatchScoreRowProps = {
  homeTeam: KnockoutMatchTeam;
  awayTeam: KnockoutMatchTeam;
  homeScore: string;
  awayScore: string;
  onHomeScoreChange: (text: string) => void;
  onAwayScoreChange: (text: string) => void;
  disabled?: boolean;
  hasPrediction: boolean;
  /** Narrow grid cards on web — smaller flags, hide seed labels. */
  compact?: boolean;
};

export function KnockoutMatchScoreRow({
  homeTeam,
  awayTeam,
  homeScore,
  awayScore,
  onHomeScoreChange,
  onAwayScoreChange,
  disabled = false,
  hasPrediction,
  compact = false,
}: KnockoutMatchScoreRowProps) {
  const theme = useTheme();
  const highlightFilled = showAntePostFilledHighlight(hasPrediction, disabled);

  const styles = useMemo(() => {
    const scoreSize = compact ? 42 : 50;
    const scoreFont = compact ? 18 : 22;

    return StyleSheet.create({
      outer: {
        width: '100%',
        alignItems: 'center',
      },
      row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: compact ? 52 : 60,
        maxWidth: compact ? undefined : 520,
      },
      side: {
        flex: 1,
        minWidth: 0,
        alignItems: 'center',
      },
      homeSide: {
        paddingRight: compact ? 4 : 8,
      },
      awaySide: {
        paddingLeft: compact ? 4 : 8,
      },
      teamBlock: {
        width: '100%',
        maxWidth: compact ? 88 : 110,
        alignItems: 'center',
        gap: compact ? 2 : 4,
      },
      teamName: {
        fontFamily: theme.fontFamily.regular,
        color: theme.colors.text,
        fontSize: compact ? 10 : 12,
        fontWeight: '600',
        textAlign: 'center',
        width: '100%',
        lineHeight: compact ? 12 : 15,
      },
      teamSource: {
        fontFamily: theme.fontFamily.light,
        color: theme.colors.textMuted,
        fontSize: compact ? 9 : 10,
        textAlign: 'center',
        width: '100%',
      },
      vs: {
        width: compact ? 18 : 24,
        flexShrink: 0,
        textAlign: 'center',
        fontFamily: theme.fontFamily.regular,
        color: theme.colors.textMuted,
        fontSize: compact ? 12 : 14,
        fontWeight: '700',
      },
      scoreShell: {
        width: scoreSize,
        height: compact ? 38 : 44,
        flexShrink: 0,
        borderRadius: theme.radius.sm,
        borderWidth: 2,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      },
      scoreShellFilled: {
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.accentMuted,
      },
      scoreField: {
        width: '100%',
        height: compact ? 38 : 44,
        margin: 0,
        padding: 0,
        borderWidth: 0,
        backgroundColor: 'transparent',
        fontSize: scoreFont,
        fontWeight: '700',
        color: theme.colors.text,
        textAlign: 'center',
        fontFamily: theme.fontFamily.regular,
        ...(Platform.OS === 'web' ? { lineHeight: compact ? 38 : 44 } : {}),
      },
    });
  }, [theme, compact]);

  const flagSize = compact ? 26 : 36;

  return (
    <View style={styles.outer}>
      <View style={styles.row}>
        <View style={[styles.side, styles.homeSide]}>
          <View style={styles.teamBlock}>
            <CountryFlag
              countryCode={homeTeam.code}
              countryName={homeTeam.name}
              flagSize={flagSize}
              showName={false}
              align="center"
            />
            <Text style={styles.teamName} numberOfLines={2} ellipsizeMode="tail">
              {homeTeam.name}
            </Text>
            {!compact ? (
              <Text style={styles.teamSource} numberOfLines={1} ellipsizeMode="tail">
                {homeTeam.source}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.scoreShell, highlightFilled && styles.scoreShellFilled]}>
          <TextInput
            style={[styles.scoreField, antePostScoreFieldPlatformStyle]}
            value={homeScore}
            onChangeText={onHomeScoreChange}
            placeholder="0"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="number-pad"
            maxLength={2}
            textAlign="center"
            editable={!disabled}
            multiline={false}
          />
        </View>

        <Text style={styles.vs}>vs</Text>

        <View style={[styles.scoreShell, highlightFilled && styles.scoreShellFilled]}>
          <TextInput
            style={[styles.scoreField, antePostScoreFieldPlatformStyle]}
            value={awayScore}
            onChangeText={onAwayScoreChange}
            placeholder="0"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="number-pad"
            maxLength={2}
            textAlign="center"
            editable={!disabled}
            multiline={false}
          />
        </View>

        <View style={[styles.side, styles.awaySide]}>
          <View style={styles.teamBlock}>
            <CountryFlag
              countryCode={awayTeam.code}
              countryName={awayTeam.name}
              flagSize={flagSize}
              showName={false}
              align="center"
            />
            <Text style={styles.teamName} numberOfLines={2} ellipsizeMode="tail">
              {awayTeam.name}
            </Text>
            {!compact ? (
              <Text style={styles.teamSource} numberOfLines={1} ellipsizeMode="tail">
                {awayTeam.source}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}
