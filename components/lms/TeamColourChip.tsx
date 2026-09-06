import { memo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { lmsTeamChipColours, lmsTeamCode } from '@/lib/lms/teamColours';
import { lmsTeamIconSource } from '@/lib/lms/teamIcons';

type Props = {
  shortName?: string | null;
  name?: string | null;
  slug?: string | null;
  size?: number;
};

/**
 * Team identifier: local kit icon when available, otherwise colour + TLA chip.
 * Icons live in assets/Icons/{TLA}.png (not official club crests).
 */
export const TeamColourChip = memo(function TeamColourChip({
  shortName,
  name,
  slug,
  size = 28,
}: Props) {
  const icon = lmsTeamIconSource({ shortName, name, slug });
  const code = lmsTeamCode({ shortName, name });
  const label = name ? `${name} kit` : `${code} kit`;

  if (icon) {
    return (
      <Image
        source={icon}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel={label}
      />
    );
  }

  const colours = lmsTeamChipColours({ slug, shortName });
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
});

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
