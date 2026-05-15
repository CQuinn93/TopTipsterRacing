import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

const PRESETS: [number, number][][] = [
  [
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
  [
    [0, 1],
    [0, 2],
    [0, 3],
  ],
];

type Props = {
  disabled?: boolean;
  homeScoreStr: string;
  awayScoreStr: string;
  onSelect: (home: number, away: number) => void;
};

export function KnockoutMatchScorePresets({
  disabled,
  homeScoreStr,
  awayScoreStr,
  onSelect,
}: Props) {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          marginTop: theme.spacing.xs,
          marginBottom: theme.spacing.xs,
        },
        label: {
          fontFamily: theme.fontFamily.light,
          fontSize: 11,
          color: theme.colors.textMuted,
          textAlign: 'center',
          marginBottom: 6,
        },
        grid: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 6,
        },
        col: {
          flex: 1,
          gap: 5,
        },
        chip: {
          paddingVertical: 6,
          paddingHorizontal: 4,
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          alignItems: 'center',
        },
        chipActive: {
          borderColor: theme.colors.accent,
          borderWidth: 2,
          backgroundColor: theme.colors.accentMuted,
        },
        chipText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '700',
          color: theme.colors.text,
        },
        chipTextActive: {
          color: theme.colors.accent,
        },
      }),
    [theme]
  );

  const curH = parseInt(homeScoreStr, 10);
  const curA = parseInt(awayScoreStr, 10);
  const hasPair =
    !Number.isNaN(curH) &&
    !Number.isNaN(curA) &&
    homeScoreStr.trim() !== '' &&
    awayScoreStr.trim() !== '';

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Quick scores</Text>
      <View style={styles.grid}>
        {PRESETS.map((col, ci) => (
          <View key={ci} style={styles.col}>
            {col.map(([h, a]) => {
              const active = !disabled && hasPair && curH === h && curA === a;
              return (
                <TouchableOpacity
                  key={`${h}-${a}`}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => onSelect(h, a)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Set score ${h} to ${a}`}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {`${h}–${a}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
