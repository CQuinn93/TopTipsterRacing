import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { decimalToFractional } from '@/lib/oddsFormat';

const STANDARD_ROWS = [
  { type: 'Win', pts: 5 },
  { type: 'Place', pts: 1 },
];

type BonusRow = { min: number; max: number | null; points: number };

const WIN_BONUS: BonusRow[] = [
  { min: 2.63, max: 4, points: 1 },
  { min: 4.33, max: 6, points: 2 },
  { min: 6.5, max: 8, points: 3 },
  { min: 8.5, max: 11, points: 4 },
  { min: 12, max: 15, points: 5 },
  { min: 17, max: 19, points: 7 },
  { min: 21, max: 26, points: 10 },
  { min: 26, max: null, points: 15 },
];

const PLACE_BONUS: BonusRow[] = [
  { min: 4, max: 6, points: 1 },
  { min: 6.5, max: 8, points: 2 },
  { min: 8.5, max: 11, points: 3 },
  { min: 12, max: 17, points: 4 },
  { min: 19, max: 23, points: 6 },
  { min: 23, max: null, points: 8 },
];

function formatDecimal(n: number): string {
  if (n === Math.round(n)) return String(n);
  if (n * 10 === Math.round(n * 10)) return n.toFixed(1);
  return n.toFixed(2);
}

function formatRange(r: BonusRow, asFraction: boolean): string {
  if (asFraction) {
    const low = decimalToFractional(r.min);
    if (r.max == null) return `> ${low}`;
    return `${low} – ${decimalToFractional(r.max)}`;
  }
  if (r.max == null) return `> ${r.min}`;
  return `${formatDecimal(r.min)} – ${formatDecimal(r.max)}`;
}

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
  const [mainTab, setMainTab] = useState<'standard' | 'bonus'>('standard');
  const [bonusTab, setBonusTab] = useState<'win' | 'place'>('win');
  const [showAsFraction, setShowAsFraction] = useState(false);

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
          marginBottom: theme.spacing.xs,
        },
        intro: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.lg,
          lineHeight: 20,
        },
        tabsRow: {
          flexDirection: 'row',
          width: '100%',
          marginBottom: theme.spacing.md,
          gap: theme.spacing.xs,
        },
        tab: {
          flex: 1,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.sm,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabActive: {
          backgroundColor: theme.colors.accent,
        },
        tabText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textSecondary,
        },
        tabTextActive: {
          color: theme.colors.white,
          fontWeight: '600',
        },
        bonusTabsRow: {
          flexDirection: 'row',
          width: '100%',
          marginBottom: theme.spacing.sm,
          gap: theme.spacing.xs,
        },
        bonusDesc: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.md,
          lineHeight: 20,
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
        footer: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginTop: theme.spacing.lg,
          lineHeight: 18,
        },
        formatLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginBottom: theme.spacing.xs,
        },
        formatRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.md,
        },
        formatPill: {
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.sm,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        formatPillActive: {
          backgroundColor: theme.colors.accent,
          borderColor: theme.colors.accent,
        },
        formatPillText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textSecondary,
        },
        formatPillTextActive: {
          color: theme.colors.white,
          fontWeight: '600',
        },
      }),
    [theme]
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Points System</Text>
      <Text style={styles.intro}>Points consist of 2 categories: Position and bonus points.</Text>

      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, mainTab === 'standard' && styles.tabActive]}
          onPress={() => setMainTab('standard')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, mainTab === 'standard' && styles.tabTextActive]}>Standard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, mainTab === 'bonus' && styles.tabActive]}
          onPress={() => setMainTab('bonus')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, mainTab === 'bonus' && styles.tabTextActive]}>Bonus</Text>
        </TouchableOpacity>
      </View>

      {mainTab === 'standard' && (
        <>
          <View style={styles.table}>
            <TableRow left="Type" right="Pts" isHeader styles={styles} />
            {STANDARD_ROWS.map((r) => (
              <TableRow key={r.type} left={r.type} right={`${r.pts}`} styles={styles} />
            ))}
          </View>
          <Text style={styles.footer}>The table illustrates the decimal values for the ranges, not the fractions.</Text>
        </>
      )}

      {mainTab === 'bonus' && (
        <>
          <Text style={styles.bonusDesc}>
            When your selection wins or places, you earn extra points on top of the standard points. The amount
            depends on the starting price (SP) range at the time of the result—higher ranges earn more bonus
            points, so a less-fancied pick that wins or places is rewarded more.
          </Text>
          <Text style={styles.formatLabel}>Show ranges as</Text>
          <View style={styles.formatRow}>
            <TouchableOpacity
              style={[styles.formatPill, !showAsFraction && styles.formatPillActive]}
              onPress={() => setShowAsFraction(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.formatPillText, !showAsFraction && styles.formatPillTextActive]}>Decimal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formatPill, showAsFraction && styles.formatPillActive]}
              onPress={() => setShowAsFraction(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.formatPillText, showAsFraction && styles.formatPillTextActive]}>Fraction</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bonusTabsRow}>
            <TouchableOpacity
              style={[styles.tab, bonusTab === 'win' && styles.tabActive]}
              onPress={() => setBonusTab('win')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, bonusTab === 'win' && styles.tabTextActive]}>Win</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, bonusTab === 'place' && styles.tabActive]}
              onPress={() => setBonusTab('place')}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, bonusTab === 'place' && styles.tabTextActive]}>Place</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.table}>
            <TableRow left="Range" right="Pts" isHeader styles={styles} />
            {(bonusTab === 'win' ? WIN_BONUS : PLACE_BONUS).map((r, i) => (
              <TableRow key={`${r.min}-${r.max}-${i}`} left={formatRange(r, showAsFraction)} right={`${r.points}`} styles={styles} />
            ))}
          </View>
          <Text style={styles.footer}>
            {showAsFraction
              ? 'The table shows fractional equivalents. Switch to Decimal for numeric ranges.'
              : 'The table illustrates the decimal values for the ranges, not the fractions.'}
          </Text>
        </>
      )}
    </ScrollView>
  );
}
