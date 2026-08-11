import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';

type TabKey = 'ios' | 'android';

const SIMPLE_FONT =
  Platform.OS === 'web'
    ? 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    : undefined;

const IOS_SECTIONS = [
  {
    title: 'Safari',
    steps: [
      'Press the Share button (square with an arrow pointing up), or the ••• menu if shown.',
      'Tap Share.',
      'Tap Add to Home Screen.',
      'Tap Add. Open Top Tipster from the new Home Screen icon.',
    ],
  },
  {
    title: 'Google / Chrome',
    steps: [
      'Select Share.',
      'Tap Add to Home Screen.',
      'Confirm, then open Top Tipster from the Home Screen icon.',
    ],
  },
] as const;

const ANDROID_SECTIONS = [
  {
    title: 'Google / Chrome',
    steps: [
      'Select the three dots (⋮) in the browser menu.',
      'Tap Install app or Add to Home screen / Create shortcut.',
      'Tap Install.',
      'Open Top Tipster from the new Home Screen icon.',
    ],
  },
] as const;

/**
 * iOS + Android guide for installing the web app to the Home Screen.
 */
export default function AddToHomeScreenGuide() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('ios');

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
          fontFamily: SIMPLE_FONT ?? theme.fontFamily.input,
          fontSize: 22,
          fontWeight: '700',
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
          fontFamily: SIMPLE_FONT ?? theme.fontFamily.input,
          fontSize: 15,
          color: theme.colors.textSecondary,
          lineHeight: 22,
        },
        tabs: {
          flexDirection: 'row',
          gap: theme.spacing.sm,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          padding: 4,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        tab: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: theme.radius.sm,
          alignItems: 'center',
        },
        tabActive: {
          backgroundColor: theme.colors.accentMuted,
          borderWidth: 1,
          borderColor: theme.colors.accent,
        },
        tabText: {
          fontFamily: SIMPLE_FONT ?? theme.fontFamily.input,
          fontSize: 14,
          fontWeight: '600',
          color: theme.colors.textMuted,
        },
        tabTextActive: {
          color: theme.colors.accent,
          fontWeight: '700',
        },
        section: {
          gap: theme.spacing.md,
        },
        sectionTitle: {
          fontFamily: SIMPLE_FONT ?? theme.fontFamily.input,
          fontSize: 15,
          fontWeight: '700',
          color: '#fafafa',
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
          marginTop: 1,
        },
        stepNumText: {
          fontFamily: SIMPLE_FONT ?? theme.fontFamily.input,
          fontWeight: '700',
          fontSize: 13,
          color: theme.colors.accent,
        },
        stepText: {
          flex: 1,
          fontFamily: SIMPLE_FONT ?? theme.fontFamily.input,
          fontSize: 14,
          color: theme.colors.textSecondary,
          lineHeight: 20,
          paddingTop: 4,
        },
        gotIt: {
          marginTop: theme.spacing.sm,
          backgroundColor: theme.colors.accent,
          paddingVertical: 14,
          borderRadius: theme.radius.md,
          alignItems: 'center',
        },
        gotItText: {
          fontFamily: SIMPLE_FONT ?? theme.fontFamily.input,
          fontWeight: '700',
          fontSize: 16,
          color: theme.colors.white,
        },
      }),
    [theme, insets.top, insets.bottom]
  );

  const sections = tab === 'ios' ? IOS_SECTIONS : ANDROID_SECTIONS;

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
          For the best experience, add Top Tipster to your Home Screen. Pick your device below.
        </Text>

        <View style={styles.tabs} accessibilityRole="tablist">
          <Pressable
            style={[styles.tab, tab === 'ios' && styles.tabActive]}
            onPress={() => setTab('ios')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'ios' }}
            accessibilityLabel="iOS instructions"
          >
            <Text style={[styles.tabText, tab === 'ios' && styles.tabTextActive]}>iOS</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, tab === 'android' && styles.tabActive]}
            onPress={() => setTab('android')}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'android' }}
            accessibilityLabel="Android instructions"
          >
            <Text style={[styles.tabText, tab === 'android' && styles.tabTextActive]}>Android</Text>
          </Pressable>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.steps.map((body, i) => (
              <View key={`${section.title}-${i}`} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{body}</Text>
              </View>
            ))}
          </View>
        ))}

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
