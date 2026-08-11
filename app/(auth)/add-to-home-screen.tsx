import { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';

const STEPS = [
  {
    title: 'Open Share',
    body: 'In Safari, tap the Share button (the square with an arrow pointing up) at the bottom of the screen.',
  },
  {
    title: 'Add to Home Screen',
    body: 'Scroll the share sheet if needed, then tap Add to Home Screen.',
  },
  {
    title: 'Confirm',
    body: 'Tap Add. Top Tipster appears on your Home Screen like an app icon.',
  },
  {
    title: 'Open from the icon',
    body: 'Always launch Top Tipster from that icon (not a Safari tab) for the full app experience and notifications.',
  },
] as const;

/**
 * Simple iOS / Safari guide for installing the PWA to the Home Screen.
 */
export default function AddToHomeScreenGuide() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: '#0a0a0a',
        },
        gradient: {
          ...StyleSheet.absoluteFillObject,
        },
        header: {
          paddingTop: Math.max(theme.spacing.md, insets.top + 6),
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        },
        title: {
          flex: 1,
          fontFamily: theme.fontFamily.swish,
          fontSize: 28,
          color: '#fafafa',
        },
        content: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.lg,
          maxWidth: 440,
          width: '100%',
          alignSelf: 'center',
        },
        intro: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.textSecondary,
          lineHeight: 22,
        },
        step: {
          flexDirection: 'row',
          gap: theme.spacing.md,
          alignItems: 'flex-start',
        },
        stepNum: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: theme.colors.accentMuted,
          borderWidth: 1,
          borderColor: theme.colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
        },
        stepNumText: {
          fontFamily: theme.fontFamily.regular,
          fontWeight: '700',
          fontSize: 13,
          color: theme.colors.accent,
        },
        stepBody: {
          flex: 1,
          gap: 4,
        },
        stepTitle: {
          fontFamily: theme.fontFamily.regular,
          fontWeight: '700',
          fontSize: 16,
          color: '#fafafa',
        },
        stepText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
          lineHeight: 20,
        },
        androidNote: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
          lineHeight: 19,
        },
        gotIt: {
          marginTop: theme.spacing.sm,
          backgroundColor: theme.colors.accent,
          paddingVertical: 14,
          borderRadius: theme.radius.md,
          alignItems: 'center',
        },
        gotItText: {
          fontFamily: theme.fontFamily.regular,
          fontWeight: '700',
          fontSize: 16,
          color: theme.colors.white,
        },
      }),
    [theme, insets.top, insets.bottom]
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0a0a0a', '#121212', '#0a0a0a']}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
        pointerEvents="none"
      />
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color={theme.colors.textMuted} />
        </Pressable>
        <Text style={styles.title}>Add to Home Screen</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          For the best experience on iPhone — including deadline alerts — add Top Tipster to your
          Home Screen from Safari.
        </Text>
        {STEPS.map((step, i) => (
          <View key={step.title} style={styles.step}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepText}>{step.body}</Text>
            </View>
          </View>
        ))}
        <Text style={styles.androidNote}>
          On Android Chrome: open the browser menu (⋮) → Install app or Add to Home screen.
        </Text>
        <Pressable
          style={styles.gotIt}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Got it"
        >
          <Text style={styles.gotItText}>Got it</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
