import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { RacingPointsPanel } from '@/components/RacingPointsPanel';

export default function PointsScreen() {
  const theme = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
      }),
    [theme]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <RacingPointsPanel />
    </ScrollView>
  );
}
