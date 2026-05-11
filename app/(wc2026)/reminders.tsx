import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

export default function WorldCupRemindersScreen() {
  const theme = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl, maxWidth: 800, width: '100%', alignSelf: 'center' },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
        },
        subtitle: {
          fontFamily: theme.fontFamily.light,
          fontSize: 14,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.lg,
          lineHeight: 20,
        },
        card: {
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
        },
        body: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
          lineHeight: 22,
        },
      }),
    [theme]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Reminders</Text>
      <Text style={styles.subtitle}>
        Reminders for football will be added next. This screen is a placeholder so the WC web menu matches the Racing app.
      </Text>

      <View style={styles.card}>
        <Text style={styles.body}>
          Planned: match-day reminders, group deadline nudges, and key knockout fixtures. We can wire this into your existing notifications
          system once the match schedule is finalized.
        </Text>
      </View>
    </ScrollView>
  );
}

