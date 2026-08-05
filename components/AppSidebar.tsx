import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';

/**
 * Shared sport menu (hamburger).
 * Racing: Return to Home
 * LMS: Return to Home, Table, Rules, How it works
 * Admin tools live on the competition hub Admin tab only.
 */
export function AppSidebar() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open, closeSidebar, variant } = useSidebar();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          flexDirection: 'row',
          justifyContent: 'flex-start',
        },
        panel: {
          width: '78%',
          maxWidth: 320,
          height: '100%',
          backgroundColor: theme.colors.surface,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: theme.colors.border,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        headerTitle: {
          fontFamily:
            variant === 'lms' ? theme.fontFamily.baiBold : theme.fontFamily.regular,
          fontSize: 18,
          color: theme.colors.text,
          fontWeight: '700',
        },
        closeBtn: { padding: 4 },
        buttons: {
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.md,
          gap: 4,
          paddingBottom: theme.spacing.xl,
        },
        menuButton: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingVertical: 14,
          paddingHorizontal: theme.spacing.sm,
          borderRadius: theme.radius.md,
        },
        menuButtonText: {
          flex: 1,
          fontFamily:
            variant === 'lms' ? theme.fontFamily.baiMedium : theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.text,
          fontWeight: '600',
        },
      }),
    [theme, variant]
  );

  const goTo = (path: string) => {
    closeSidebar();
    router.push(path as any);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={closeSidebar}>
      <Pressable style={styles.backdrop} onPress={closeSidebar}>
        <Pressable
          style={[styles.panel, { paddingTop: insets.top }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Menu</Text>
            <TouchableOpacity onPress={closeSidebar} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.buttons}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => goTo('/competition-hub')}
              activeOpacity={0.7}
            >
              <Ionicons name="home-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Return to Home</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>

            {variant === 'lms' ? (
              <>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => goTo('/(lms)/table')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="stats-chart-outline" size={22} color={theme.colors.accent} />
                  <Text style={styles.menuButtonText}>Table</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => goTo('/(lms)/rules')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="document-text-outline" size={22} color={theme.colors.accent} />
                  <Text style={styles.menuButtonText}>Rules</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuButton}
                  onPress={() => goTo('/(lms)/how-it-works')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="help-circle-outline" size={22} color={theme.colors.accent} />
                  <Text style={styles.menuButtonText}>How it works</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
