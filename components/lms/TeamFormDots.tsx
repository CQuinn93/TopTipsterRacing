import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export type FormResult = 'W' | 'D' | 'L' | null;

type Props = {
  results: FormResult[];
  size?: number;
};

/** Last-five form: green win, grey draw, red loss, empty = no data yet. */
export function TeamFormDots({ results, size = 8 }: Props) {
  const theme = useTheme();
  const padded = [...results];
  while (padded.length < 5) padded.unshift(null);
  const five = padded.slice(-5);

  return (
    <View style={styles.row}>
      {five.map((r, i) => {
        const bg =
          r === 'W'
            ? theme.colors.accent
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
                borderColor: theme.colors.borderLight,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  dot: {
    borderRadius: 1.5,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
