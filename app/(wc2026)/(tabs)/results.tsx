import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useTheme } from '@/contexts/ThemeContext';
import { wcHref } from '@/features/wc2026/utils/href';

export default function WorldCupResultsTab() {
  const theme = useTheme();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
      maxWidth: 700,
      width: '100%',
      alignSelf: 'center',
    },
    title: {
      fontFamily: theme.fontFamily.regular,
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    subtitle: {
      fontFamily: theme.fontFamily.light,
      fontSize: 13,
      lineHeight: 18,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    card: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceElevated,
      borderRadius: theme.radius.md,
      padding: theme.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
    cardText: { flex: 1, minWidth: 0 },
    cardTitle: {
      fontFamily: theme.fontFamily.regular,
      fontSize: 14,
      fontWeight: '700',
      color: theme.colors.text,
    },
    cardSub: {
      fontFamily: theme.fontFamily.light,
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
  });

  const links: Array<{ title: string; desc: string; href: string }> = [
    { title: 'Round of 32', desc: 'Generated from your group predictions', href: '/(wc2026)/round-of-32-results' },
    { title: 'Round of 16', desc: 'Generated from your Round of 32 predictions', href: '/(wc2026)/round-of-16-results' },
    { title: 'Quarter Finals', desc: 'Generated from your Round of 16 predictions', href: '/(wc2026)/quarter-finals-results' },
    { title: 'Semi Finals', desc: 'Generated from your Quarter Finals predictions', href: '/(wc2026)/semi-finals-results' },
    { title: 'Bronze Final', desc: 'Generated from your Semi Finals predictions', href: '/(wc2026)/bronze-final-results' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View>
        <Text style={styles.title}>Results</Text>
        <Text style={styles.subtitle}>Knockout results are generated from your saved predictions as you progress.</Text>
      </View>

      {links.map((l) => (
        <TouchableOpacity key={l.href} activeOpacity={0.8} onPress={() => router.push(wcHref(l.href) as any)} style={styles.card}>
          <View style={styles.cardLeft}>
            <Ionicons name="trophy-outline" size={18} color={theme.colors.accent} />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {l.title}
              </Text>
              <Text style={styles.cardSub} numberOfLines={2}>
                {l.desc}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

