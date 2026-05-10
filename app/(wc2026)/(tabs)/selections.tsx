import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { wcHref } from '@/features/wc2026/utils/href';

export default function WorldCupSelectionsTab() {
  const theme = useTheme();
  const { session } = useAuth();

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>My selections</Text>
        <Text style={[styles.body, { color: theme.colors.textSecondary }]}>
          Make and review your World Cup predictions by stage.
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.colors.accent }]}
          onPress={() => router.push(wcHref('/(wc2026)/ante-post-navigation'))}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Open selections</Text>
          <Ionicons name="arrow-forward" size={14} color="#000000" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    marginBottom: 16,
  },
  button: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
  },
});
