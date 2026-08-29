import { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import type { F2tSelectionRow } from '@/lib/f2t/api';

const SLOTS = 20;

type Props = {
  selections: F2tSelectionRow[];
  scoredCount?: number;
  canRegularSub?: boolean;
  onSubstitute?: (playerId: string) => void;
};

function formatKickoff(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PlayerProgressGrid({
  selections,
  scoredCount,
  canRegularSub,
  onSubstitute,
}: Props) {
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
        list: { gap: theme.spacing.sm },
        card: {
          flexDirection: 'row',
          alignItems: 'stretch',
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          overflow: 'hidden',
        },
        cardScored: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        cardEmpty: {
          borderStyle: 'dashed',
          opacity: 0.7,
          padding: theme.spacing.md,
        },
        main: {
          flex: 1.15,
          minWidth: 0,
          padding: theme.spacing.md,
          gap: 6,
        },
        side: {
          flex: 1,
          minWidth: 0,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderLeftWidth: StyleSheet.hairlineWidth,
          borderLeftColor: theme.colors.border,
          justifyContent: 'center',
          gap: 4,
          backgroundColor: theme.colors.background,
        },
        slotHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
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
        nameRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        },
        name: {
          flex: 1,
          minWidth: 0,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 15,
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
          color: '#f97316',
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
        sideLabel: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 10,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          color: theme.colors.accent,
        },
        sideValue: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 13,
          color: theme.colors.text,
        },
        sideMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        oppRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        subBtn: {
          flexShrink: 0,
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.accent,
        },
        subBtnText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          color: theme.colors.accent,
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
      <View style={styles.list}>
        {Array.from({ length: SLOTS }, (_, i) => {
          const slot = i + 1;
          const row = bySlot.get(slot);
          const scoredSlot = Boolean(row?.scored_at);
          const next = row?.next_match ?? null;
          const canSub =
            Boolean(row) &&
            !scoredSlot &&
            Boolean(onSubstitute) &&
            (Boolean(row?.owner_flagged) || Boolean(canRegularSub));

          if (!row) {
            return (
              <View key={slot} style={[styles.card, styles.cardEmpty]}>
                <Text style={styles.slotNum}>#{slot}</Text>
                <Text style={styles.emptyText}>Empty slot</Text>
              </View>
            );
          }

          return (
            <View key={slot} style={[styles.card, scoredSlot && styles.cardScored]}>
              <View style={styles.main}>
                <View style={styles.slotHeader}>
                  <Text style={styles.slotNum}>#{slot}</Text>
                  {scoredSlot ? (
                    <Text style={styles.scoredBadge}>
                      Scored
                      {row.scored_gameweek_number != null
                        ? ` · GW${row.scored_gameweek_number}`
                        : ''}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.display_name}
                  </Text>
                  {canSub ? (
                    <Pressable
                      style={styles.subBtn}
                      onPress={() => onSubstitute?.(row.player_id)}
                      hitSlop={6}
                    >
                      <Text style={styles.subBtnText}>
                        {row.owner_flagged ? 'Free substitute' : 'Substitute'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
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
                  <Text style={styles.flagged}>Flagged — free sub</Text>
                ) : null}
              </View>
              <View style={styles.side}>
                {scoredSlot ? (
                  <>
                    <Text style={styles.sideLabel}>Status</Text>
                    <Text style={styles.sideValue}>Checked off</Text>
                    {row.scored_gameweek_number != null ? (
                      <Text style={styles.sideMeta}>GW{row.scored_gameweek_number}</Text>
                    ) : null}
                  </>
                ) : next ? (
                  <>
                    <Text style={styles.sideLabel}>Next match</Text>
                    <View style={styles.oppRow}>
                      <Text style={styles.sideValue}>
                        {next.is_home ? 'vs' : '@'} {next.opponent_short_name}
                      </Text>
                      <TeamColourChip
                        shortName={next.opponent_short_name}
                        name={next.opponent_name}
                        slug={next.opponent_slug}
                        size={18}
                      />
                    </View>
                    <Text style={styles.sideMeta} numberOfLines={2}>
                      {next.gameweek_number != null ? `GW${next.gameweek_number} · ` : ''}
                      {formatKickoff(next.kickoff_at)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.sideLabel}>Next match</Text>
                    <Text style={styles.sideMeta}>No upcoming fixture</Text>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
