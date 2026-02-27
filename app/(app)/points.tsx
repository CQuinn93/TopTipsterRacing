import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

const WIN_BONUS = [
  { range: '2.63 – 4', points: 1 },
  { range: '4.33 – 6', points: 2 },
  { range: '6.5 – 8', points: 3 },
  { range: '8.5 – 11', points: 4 },
  { range: '12 – 15', points: 5 },
  { range: '17 – 19', points: 7 },
  { range: '21 – 26', points: 10 },
  { range: '26.01 – 29', points: 15 },
];

const PLACE_BONUS = [
  { range: '4 – 6', points: 1 },
  { range: '6.5 – 8', points: 2 },
  { range: '8.5 – 11', points: 3 },
  { range: '12 – 17', points: 4 },
  { range: '19 – 23', points: 6 },
  { range: '23.01 – 26', points: 8 },
];

function TableRow({
  left,
  right,
  isHeader,
  styles,
}: {
  left: string;
  right: string;
  isHeader?: boolean;
  styles: ReturnType<typeof StyleSheet.create>;
}) {
  return (
    <View style={[styles.row, isHeader && styles.rowHeader]}>
      <Text style={[styles.cell, styles.cellLeft, isHeader && styles.cellHeader]}>{left}</Text>
      <Text style={[styles.cell, styles.cellRight, isHeader && styles.cellHeader]}>{right}</Text>
    </View>
  );
}

export default function PointsScreen() {
  const theme = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '600',
          color: theme.colors.text,
          marginBottom: theme.spacing.lg,
        },
        sectionLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.accent,
          marginBottom: theme.spacing.sm,
        },
        sectionLabelSpaced: {
          marginTop: theme.spacing.lg,
        },
        table: {
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
          overflow: 'hidden',
        },
        row: {
          flexDirection: 'row',
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        rowHeader: {
          backgroundColor: theme.colors.surface,
        },
        cell: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.text,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          flex: 1,
        },
        cellLeft: {},
        cellRight: {
          textAlign: 'right',
        },
        cellHeader: {
          fontWeight: '600',
          color: theme.colors.accent,
        },
        note: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
          marginTop: theme.spacing.lg,
          lineHeight: 20,
        },
      }),
    [theme]
  );
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Points system</Text>

      <Text style={styles.sectionLabel}>Standard (all odds)</Text>
      <View style={styles.table}>
        <TableRow left="Winner" right="5 pts" isHeader styles={styles} />
        <TableRow left="Place (2nd/3rd/4th)" right="1 pt" styles={styles} />
      </View>

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Win bonus (by SP range)</Text>
      <View style={styles.table}>
        <TableRow left="SP range" right="Bonus pts" isHeader styles={styles} />
        {WIN_BONUS.map((r) => (
          <TableRow key={r.range} left={r.range} right={`+${r.points}`} styles={styles} />
        ))}
      </View>

      <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Place bonus (by SP range)</Text>
      <View style={styles.table}>
        <TableRow left="SP range" right="Bonus pts" isHeader styles={styles} />
        {PLACE_BONUS.map((r) => (
          <TableRow key={r.range} left={r.range} right={`+${r.points}`} styles={styles} />
        ))}
      </View>

      <Text style={styles.note}>
        Your total for a pick = standard points + bonus (if your pick's SP falls in a bonus range).
      </Text>
    </ScrollView>
  );
}

