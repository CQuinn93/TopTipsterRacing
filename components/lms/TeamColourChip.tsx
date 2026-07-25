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
  const fontSize = Math.max(9, Math.round(size * 0.36));
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
            lineHeight: fontSize + 2,
          },
        ]}
        numberOfLines={1}
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
  },
  code: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
