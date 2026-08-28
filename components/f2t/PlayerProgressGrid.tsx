import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import type { F2tSelectionRow } from '@/lib/f2t/api';

const SLOTS = 20;

type Props = {
  selections: F2tSelectionRow[];
  scoredCount?: number;
};

export function PlayerProgressGrid({ selections, scoredCount }: Props) {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { gap: theme.spacing.sm },
        summary: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 14,
          color: theme.colors.textSecondary,
        },
        grid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        },
        slot: {
          width: '47%',
          minWidth: 140,
          flexGrow: 1,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          padding: theme.spacing.sm,
          gap: 4,
        },
        slotScored: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        slotEmpty: {
          borderStyle: 'dashed',
          opacity: 0.7,
        },
        slotHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        slotNum: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        scoredBadge: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 10,
          color: theme.colors.accent,
          textTransform: 'uppercase',
        },
        name: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 14,
          color: theme.colors.text,
        },
        emptyText: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
        },
        flagged: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.warning ?? theme.colors.error,
        },
        chipRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        teamAbbr: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
      }),
    [theme]
  );

  const bySlot = useMemo(() => {
    const map = new Map<number, F2tSelectionRow>();
    for (const row of selections) map.set(row.slot, row);
    return map;
  }, [selections]);

  const scored =
    scoredCount ?? selections.filter((s) => s.scored_at != null).length;

  return (
    <View style={styles.wrap}>
      <Text style={styles.summary}>
        {scored} of {SLOTS} players scored
      </Text>
      <View style={styles.grid}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const slot = i + 1;
          const row = bySlot.get(slot);
          const scoredSlot = Boolean(row?.scored_at);
          return (
            <View
              key={slot}
              style={[
                styles.slot,
                scoredSlot && styles.slotScored,
                !row && styles.slotEmpty,
              ]}
            >
              <View style={styles.slotHeader}>
                <Text style={styles.slotNum}>#{slot}</Text>
                {scoredSlot ? <Text style={styles.scoredBadge}>Scored</Text> : null}
              </View>
              {row ? (
                <>
                  <Text style={styles.name} numberOfLines={2}>
                    {row.display_name}
                  </Text>
                  <View style={styles.chipRow}>
                    <TeamColourChip
                      shortName={row.team_short_name}
                      name={row.team_name}
                      slug={row.team_slug}
                      size={22}
                    />
                    <Text style={styles.teamAbbr}>{row.team_short_name}</Text>
                  </View>
                  {row.owner_flagged && !scoredSlot ? (
                    <Text style={styles.flagged}>Flagged — sub eligible</Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.emptyText}>Empty slot</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
