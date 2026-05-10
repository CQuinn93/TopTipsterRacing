import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { DesignColors } from '@/features/wc2026/constants/design-colors';
import { getTeamImage } from '@/features/wc2026/utils/team-images';

interface CountryFlagProps {
  countryCode: string;
  countryName: string;
  flagSize?: number;
  align?: 'left' | 'center' | 'right';
  showName?: boolean;
  namePosition?: 'below' | 'beside';
  reverseOrder?: boolean;
}

export function CountryFlag({
  countryCode,
  countryName,
  flagSize = 40,
  align = 'center',
  showName = true,
  namePosition = 'beside',
  reverseOrder = false,
}: CountryFlagProps) {
  const flagImage = getTeamImage(countryCode);

  const alignStyle =
    align === 'left' ? styles.alignLeft : align === 'right' ? styles.alignRight : styles.alignCenter;
  const containerDirection =
    namePosition === 'beside' ? styles.horizontalContainer : styles.verticalContainer;

  const flagElement = (
    <View
      style={[
        styles.flagContainer,
        { width: flagSize, height: flagSize, borderRadius: flagSize / 2 },
      ]}
    >
      <Image source={flagImage} style={styles.flag} contentFit="cover" transition={200} />
    </View>
  );

  const nameElement = showName ? (
    <Text
      style={[
        styles.countryName,
        alignStyle,
        namePosition === 'beside' ? styles.nameBeside : styles.nameBelow,
        reverseOrder && namePosition === 'beside' ? styles.nameBefore : null,
      ]}
      numberOfLines={2}
      ellipsizeMode="tail"
    >
      {countryName}
    </Text>
  ) : null;

  return (
    <View style={[styles.container, alignStyle, containerDirection, reverseOrder && styles.reverseOrder]}>
      {reverseOrder ? (
        <>
          {nameElement}
          {flagElement}
        </>
      ) : (
        <>
          {flagElement}
          {nameElement}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  horizontalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verticalContainer: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  reverseOrder: {
    flexDirection: 'row-reverse',
  },
  alignLeft: {
    justifyContent: 'flex-start',
  },
  alignCenter: {
    justifyContent: 'center',
  },
  alignRight: {
    justifyContent: 'flex-end',
  },
  flagContainer: {
    overflow: 'hidden',
    backgroundColor: DesignColors.surface,
    borderWidth: 2,
    borderColor: '#B8BBB8',
    flexShrink: 0,
  },
  flag: {
    width: '100%',
    height: '100%',
  },
  countryName: {
    fontSize: 12,
    fontWeight: '600',
    color: DesignColors.text,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  nameBeside: {
    marginLeft: 8,
    textAlign: 'left',
    maxWidth: 100,
    flex: 1,
  },
  nameBefore: {
    marginLeft: 0,
    marginRight: 8,
    textAlign: 'right',
    maxWidth: 100,
    flex: 1,
  },
  nameBelow: {
    textAlign: 'center',
    maxWidth: 120,
    marginTop: 4,
  },
});
