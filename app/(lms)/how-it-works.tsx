import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';

export default function LmsHowItWorksScreen() {
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
        step: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 15,
          color: theme.colors.textSecondary,
          lineHeight: 22,
        },
        label: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.accent,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginTop: theme.spacing.sm,
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
        <Text style={styles.title}>How it works</Text>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <Ionicons name="close" size={22} color={theme.colors.textMuted} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Join</Text>
        <Text style={styles.step}>
          Enter your competition access code on the Join tab. An admin approves your request.
        </Text>
        <Text style={styles.label}>Pick</Text>
        <Text style={styles.step}>
          Open a league, go to Selection, and choose a winner for the current gameweek before the
          deadline.
        </Text>
        <Text style={styles.label}>Survive</Text>
        <Text style={styles.step}>
          Check Gameweeks and the Leaderboard after matches. One bad result and you’re out — unless
          you win the whole thing.
        </Text>
        <Text style={styles.label}>Next up</Text>
        <Text style={styles.step}>
          The home card cycles upcoming fixtures. After kick-off, pick stats show how the field
          lined up across all leagues.
        </Text>
      </ScrollView>
    </View>
  );
}
