import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  /** Share still standing after this gameweek (0–100). */
  survivalPct: number;
  size?: number;
  strokeWidth?: number;
};

/** Ring chart: accent = survived, muted = eliminated that week. */
export function SurvivalDonut({ survivalPct, size = 56, strokeWidth = 6 }: Props) {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(100, survivalPct));
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const survivedLength = (pct / 100) * circumference;
  const eliminatedLength = circumference - survivedLength;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={theme.colors.error}
          strokeWidth={strokeWidth}
          fill="transparent"
          opacity={0.35}
        />
        {survivedLength > 0 ? (
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={theme.colors.accent}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={`${survivedLength} ${eliminatedLength}`}
            strokeLinecap="round"
            rotation={-90}
            origin={`${cx}, ${cy}`}
          />
        ) : null}
      </Svg>
      <Text
        style={[
          styles.label,
          { fontSize: size * 0.22, fontFamily: theme.fontFamily.baiBold, color: theme.colors.text },
        ]}
        allowFontScaling={false}
      >
        {Math.round(pct)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    fontWeight: '700',
    textAlign: 'center',
  },
});
