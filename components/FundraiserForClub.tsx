import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

type Props = {
  clubName: string;
  clubLogoUrl?: string | null;
  /** compact = list rows; header = competition screens */
  size?: 'compact' | 'header';
};

export function FundraiserForClub({ clubName, clubLogoUrl, size = 'compact' }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme, size);
  const name = clubName.trim();
  if (!name) return null;

  const logoSize = size === 'header' ? 40 : 28;

  return (
    <View
      style={styles.wrap}
      accessibilityRole="text"
      accessibilityLabel={`Fundraiser for ${name}`}
    >
      {clubLogoUrl ? (
        <Image
          source={{ uri: clubLogoUrl }}
          style={[styles.logo, { width: logoSize, height: logoSize, borderRadius: logoSize * 0.22 }]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View
          style={[
            styles.logoFallback,
            { width: logoSize, height: logoSize, borderRadius: logoSize * 0.22 },
          ]}
        >
          <Ionicons
            name="heart"
            size={Math.round(logoSize * 0.48)}
            color={theme.colors.accent}
          />
        </View>
      )}
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>Fundraiser for</Text>
        <Text style={styles.club} numberOfLines={1}>
          {name}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(theme: Theme, size: 'compact' | 'header') {
  const isHeader = size === 'header';
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: isHeader ? 12 : 10,
      alignSelf: 'stretch',
      paddingVertical: isHeader ? 10 : 6,
      paddingHorizontal: isHeader ? 12 : 8,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accentDim,
      backgroundColor: theme.colors.accentMuted,
      marginTop: isHeader ? 10 : 6,
    },
    logo: {
      backgroundColor: theme.colors.surface,
    },
    logoFallback: {
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copy: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    eyebrow: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: isHeader ? 11 : 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: theme.colors.accent,
    },
    club: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: isHeader ? 16 : 13,
      color: theme.colors.text,
    },
  });
}
