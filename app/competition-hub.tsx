import { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';

export default function CompetitionHubScreen() {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.background,
          padding: theme.spacing.lg,
          justifyContent: 'center',
          gap: theme.spacing.lg,
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 28,
          fontWeight: '700',
          color: theme.colors.text,
          textAlign: 'center',
        },
        subtitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textMuted,
          textAlign: 'center',
          marginBottom: theme.spacing.md,
        },
        card: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        cardLeft: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          flex: 1,
          marginRight: theme.spacing.sm,
        },
        cardTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          fontWeight: '700',
          color: theme.colors.text,
        },
        cardBody: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textSecondary,
          marginTop: 2,
        },
      }),
    [theme]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose your competition</Text>
      <Text style={styles.subtitle}>
        Use the same account across Top Tipster experiences.
      </Text>

      <TouchableOpacity
        style={styles.card}
        onPress={() => router.replace('/(app)')}
        activeOpacity={0.85}
      >
        <View style={styles.cardLeft}>
          <Ionicons name="trophy-outline" size={28} color={theme.colors.accent} />
          <View>
            <Text style={styles.cardTitle}>Top Tipster Racing</Text>
            <Text style={styles.cardBody}>Current horse racing competitions</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        onPress={() => router.replace('/(wc2026)')}
        activeOpacity={0.85}
      >
        <View style={styles.cardLeft}>
          <Ionicons name="football-outline" size={28} color={theme.colors.accent} />
          <View>
            <Text style={styles.cardTitle}>Top Tipster World Cup</Text>
            <Text style={styles.cardBody}>World Cup 2026 predictions module</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}
