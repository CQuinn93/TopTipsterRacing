import { useMemo } from 'react';
import { View, Text, StyleSheet, Switch, ActivityIndicator } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { formatFplAvailability } from '@/lib/f2t/fplAvailability';

export type FootballPlayerOwnerRow = {
  id?: string;
  display_name?: string;
  full_name?: string;
  position?: string | null;
  team_short_name?: string;
  team_name?: string;
  owner_flagged?: boolean;
  picker_stats?: Record<string, unknown>;
};

type Props = {
  player: FootballPlayerOwnerRow;
  accent: string;
  busy?: boolean;
  onToggleFlag: (playerId: string, flagged: boolean) => void;
};

export function FootballPlayerFlagCard({ player, accent, busy, onToggleFlag }: Props) {
  const theme = useTheme();
  const id = String(player.id ?? '');
  const flagged = Boolean(player.owner_flagged);
  const availability = formatFplAvailability(player.picker_stats);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          marginTop: theme.spacing.md,
          padding: theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        rowTop: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        },
        name: {
          flex: 1,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 15,
          color: theme.colors.text,
        },
        badge: {
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.surfaceElevated,
        },
        badgeText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        statusLine: {
          marginTop: 6,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: accent,
        },
        meta: {
          marginTop: 4,
          fontFamily: theme.fontFamily.bai,
          fontSize: 12,
          color: theme.colors.textMuted,
          lineHeight: 17,
        },
        excludeRow: {
          marginTop: theme.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        excludeLabel: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
          color: theme.colors.text,
        },
      }),
    [theme, accent]
  );

  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <Text style={styles.name} numberOfLines={1}>
          {String(player.display_name ?? player.full_name ?? 'Player')}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {String(player.position ?? '—')} · {String(player.team_short_name ?? player.team_name ?? '—')}
          </Text>
        </View>
      </View>
      {availability.statusCode !== 'a' ? (
        <Text style={styles.statusLine}>{availability.statusLabel}</Text>
      ) : null}
      {availability.chanceSummary ? (
        <Text style={styles.meta}>{availability.chanceSummary}</Text>
      ) : null}
      {availability.news ? (
        <Text style={styles.meta} numberOfLines={3}>{availability.news}</Text>
      ) : null}
      <View style={styles.excludeRow}>
        <Text style={styles.excludeLabel}>
          {flagged ? 'Excluded from picks' : 'Available to pick'}
        </Text>
        {busy ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <Switch
            value={flagged}
            onValueChange={(value) => onToggleFlag(id, value)}
            trackColor={{ false: theme.colors.border, true: accent }}
            thumbColor={theme.colors.surface}
          />
        )}
      </View>
    </View>
  );
}
