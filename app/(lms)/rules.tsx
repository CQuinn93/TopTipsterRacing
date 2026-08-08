import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';

export default function LmsRulesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { openSidebar } = useSidebar();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          paddingTop:
            Platform.OS === 'web'
              ? Math.max(theme.spacing.md, insets.top + 6)
              : insets.top + theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        },
        title: {
          flex: 1,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 20,
          color: theme.colors.text,
        },
        content: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.md,
        },
        rule: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 15,
          color: theme.colors.textSecondary,
          lineHeight: 22,
        },
      }),
    [theme, insets.top, insets.bottom]
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={openSidebar} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open menu">
          <Ionicons name="menu" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.title}>Rules</Text>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <Ionicons name="close" size={22} color={theme.colors.textMuted} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.rule}>
          Each gameweek, pick one Premier League team to win. Draws and defeats eliminate you.
        </Text>
        <Text style={styles.rule}>You may only use each club once in a competition.</Text>
        <Text style={styles.rule}>
          The pick deadline is 20 minutes before the first kick-off of that gameweek. Miss it and an
          unused team is assigned for you alphabetically.
        </Text>
        <Text style={styles.rule}>
          Last player still standing wins. If everyone is eliminated in the same week, the league
          can roll over with a rejoin code.
        </Text>
      </ScrollView>
    </View>
  );
}
