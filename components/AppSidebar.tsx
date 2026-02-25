import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { useSidebar } from '@/contexts/SidebarContext';

export function AppSidebar() {
  const { open, closeSidebar } = useSidebar();
  const router = useRouter();

  const goTo = (path: string) => {
    closeSidebar();
    router.push(path);
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={closeSidebar}
    >
      <Pressable style={styles.backdrop} onPress={closeSidebar}>
        <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Menu</Text>
            <TouchableOpacity onPress={closeSidebar} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => goTo('/(app)/rules')}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Rules</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => goTo('/(app)/points')}
              activeOpacity={0.7}
            >
              <Ionicons name="stats-chart-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Points system</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => goTo('/(app)/results')}
              activeOpacity={0.7}
            >
              <Ionicons name="trophy-outline" size={22} color={theme.colors.accent} />
              <Text style={styles.menuButtonText}>Results</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  panel: {
    width: '85%',
    maxWidth: 340,
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
  closeBtn: {
    padding: theme.spacing.xs,
  },
  buttons: {
    padding: theme.spacing.sm,
  },
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
});
