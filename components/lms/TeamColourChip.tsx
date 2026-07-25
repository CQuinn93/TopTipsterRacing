import { View, Text, StyleSheet } from 'react-native';
import { lmsTeamChipColours, lmsTeamCode } from '@/lib/lms/teamColours';

type Props = {
  shortName?: string | null;
  name?: string | null;
  slug?: string | null;
  size?: number;
};

/**
 * Colour + TLA chip used to identify clubs without loading trademarked crest artwork.
 */
export function TeamColourChip({ shortName, name, slug, size = 28 }: Props) {
  const colours = lmsTeamChipColours({ slug, shortName });
  const code = lmsTeamCode({ shortName, name });
  // Keep TLA fully visible inside the circle (avoid “…”).
  const fontSize = Math.max(8, Math.round(size * 0.28));
  const border = Math.max(2, Math.round(size * 0.08));

  return (
    <View
      style={[
        styles.chip,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colours.primary,
          borderWidth: border,
          borderColor: colours.secondary,
        },
      ]}
      accessibilityLabel={name ? `${name} colours` : `${code} team colours`}
    >
      <Text
        style={[
          styles.code,
          {
            fontSize,
            color: colours.text,
            lineHeight: fontSize + 1,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
        allowFontScaling={false}
      >
        {code}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 1,
  },
  code: {
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
