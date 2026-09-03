import { View, Text, Image, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { sportLabel, type KioskSport } from '@/lib/kioskSession';

type Props = {
  clubName?: string | null;
  clubLogoUrl?: string | null;
  competitionName: string;
  sport: KioskSport;
  onStaffExit?: () => void;
};

function ClubLogo({
  url,
  size,
  theme,
}: {
  url?: string | null;
  size: number;
  theme: ReturnType<typeof useTheme>;
}) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size * 0.18 }}
        resizeMode="contain"
        accessibilityLabel="Club logo"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.18,
        backgroundColor: theme.colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="shield-outline" size={Math.round(size * 0.45)} color={theme.colors.textMuted} />
    </View>
  );
}

export function KioskHubHeader({
  clubName,
  clubLogoUrl,
  competitionName,
  sport,
  onStaffExit,
}: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const club = (clubName ?? '').trim() || 'Top Tipster';

  return (
    <View style={styles.wrap}>
      <ClubLogo url={clubLogoUrl} size={72} theme={theme} />
      <View style={styles.center}>
        <Text style={styles.eyebrow}>Competition Hub</Text>
        <Text style={styles.club} numberOfLines={1}>
          {club}
        </Text>
        <Text style={styles.comp} numberOfLines={1}>
          {competitionName}
        </Text>
        <Text style={styles.sport}>{sportLabel(sport)}</Text>
      </View>
      <View style={styles.rightCol}>
        <ClubLogo url={clubLogoUrl} size={72} theme={theme} />
        {onStaffExit ? (
          <Pressable
            onPress={onStaffExit}
            hitSlop={10}
            style={styles.lockBtn}
            accessibilityRole="button"
            accessibilityLabel="Staff exit"
          >
            <Ionicons name="lock-closed-outline" size={20} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 4,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      minWidth: 0,
      gap: 2,
    },
    eyebrow: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 13,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: theme.colors.accent,
      textAlign: 'center',
    },
    club: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 26,
      color: theme.colors.text,
      textAlign: 'center',
    },
    comp: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 16,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    sport: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: 'center',
      marginTop: 1,
    },
    rightCol: {
      width: 72,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lockBtn: {
      position: 'absolute',
      top: -6,
      right: -6,
      padding: 6,
      backgroundColor: theme.colors.background,
      borderRadius: 16,
    },
  });
}
