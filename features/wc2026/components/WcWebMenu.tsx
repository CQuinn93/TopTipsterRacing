import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { wcHref } from '@/features/wc2026/utils/href';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function WcWebMenu({ open, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

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
          width: '85%',
          maxWidth: 340,
          flex: 1,
          flexDirection: 'column',
          backgroundColor: theme.colors.surface,
          borderRightWidth: 1,
          borderRightColor: theme.colors.border,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        },
        headerTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          fontWeight: '600',
          color: theme.colors.text,
        },
        closeBtn: { padding: theme.spacing.xs },
        buttons: { padding: theme.spacing.sm },
        menuButton: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.background,
          borderRadius: theme.radius.sm,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          marginBottom: theme.spacing.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: theme.spacing.sm,
        },
        menuButtonText: {
          flex: 1,
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.text,
        },
      }),
    [theme]
  );

  const goTo = (href: string) => {
    onClose();
    router.push(wcHref(href) as any);
  };

  const doSignOut = async () => {
    onClose();
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.panel, { paddingTop: insets.top }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Menu</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.buttons} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={styles.menuButton} activeOpacity={0.7} onPress={() => goTo('/(wc2026)/rules')}>
              <Ionicons name="document-text-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Rules</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} activeOpacity={0.7} onPress={() => goTo('/(wc2026)/points')}>
              <Ionicons name="stats-chart-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Points System</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} activeOpacity={0.7} onPress={() => goTo('/(wc2026)/reminders')}>
              <Ionicons name="notifications-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Reminders</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuButton}
              activeOpacity={0.7}
              onPress={() => {
                onClose();
                router.replace(wcHref('/competition-hub'));
              }}
            >
              <Ionicons name="swap-horizontal-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Switch sport</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuButton} activeOpacity={0.7} onPress={doSignOut}>
              <Ionicons name="log-out-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Sign out</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
