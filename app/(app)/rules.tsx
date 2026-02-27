import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export default function RulesScreen() {
  const theme = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: theme.spacing.lg,
        },
        rule: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.textSecondary,
          lineHeight: 24,
          marginBottom: theme.spacing.md,
        },
      }),
    [theme]
  );
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Rules</Text>
      <Text style={styles.rule}>Make one selection per race (a horse or FAV) before the deadline.</Text>
      <Text style={styles.rule}>Deadline is 1 hour before the first race of the day.</Text>
      <Text style={styles.rule}>
        You can lock in your picks early to view others' selections; once locked, you cannot change them.
      </Text>
      <Text style={styles.rule}>
        Points are awarded after the race based on your pick's finishing position and starting price (SP). See Points
        system in the menu for details.
      </Text>
    </ScrollView>
  );
}

