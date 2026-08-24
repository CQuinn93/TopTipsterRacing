import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export type FormResult = 'W' | 'D' | 'L' | null;

type Props = {
  results: FormResult[];
  size?: number;
  /** Primary = full colour; subtle = smaller/dimmer for opponent form on selection tiles. */
  variant?: 'primary' | 'subtle';
  gap?: number;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Last-five form: green win, grey draw, red loss, empty = no data yet. */
export function TeamFormDots({
  results,
  size = 8,
  variant = 'primary',
  gap = 3,
  compact = false,
  style,
}: Props) {
  const theme = useTheme();
  const padded = [...results];
  while (padded.length < 5) padded.unshift(null);
  const five = padded.slice(-5);
  const subtle = variant === 'subtle';

  return (
    <View style={[styles.row, compact && styles.rowCompact, { gap }, style]}>
      {five.map((r, i) => {
        const bg =
          r === 'W'
            ? subtle
              ? theme.colors.accentDim
              : theme.colors.accent
            : r === 'D'
              ? theme.colors.textMuted
              : r === 'L'
                ? theme.colors.error
                : 'transparent';
        return (
          <View
            key={i}
            style={[
              styles.dot,
              {
                width: size,
                height: size,
                backgroundColor: bg,
                borderColor: subtle ? theme.colors.border : theme.colors.borderLight,
                opacity: subtle && r != null ? 0.72 : 1,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

type SelectionFormProps = {
  teamResults: FormResult[];
  opponentResults?: FormResult[] | null;
};

/** Team + opponent form on selection tiles — primary row for the pick, subtle row for the opponent. */
export function SelectionTeamFormDots({ teamResults, opponentResults }: SelectionFormProps) {
  return (
    <View style={styles.selectionFormBlock}>
      <TeamFormDots results={teamResults} size={9} variant="primary" compact />
      {opponentResults ? (
        <View style={styles.selectionOpponentForm}>
          <TeamFormDots results={opponentResults} size={6} variant="subtle" compact gap={2} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  rowCompact: {
    marginTop: 0,
  },
  dot: {
    borderRadius: 1.5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  selectionFormBlock: {
    marginTop: 6,
    gap: 4,
  },
  selectionOpponentForm: {
    paddingLeft: 10,
    opacity: 0.88,
  },
});
