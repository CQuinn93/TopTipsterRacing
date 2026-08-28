import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import {
  FootballPlayerFlagCard,
  type FootballPlayerOwnerRow,
} from '@/components/f2t/FootballPlayerFlagCard';
import {
  formatFplAvailability,
  summarizeFplAlertStatuses,
} from '@/lib/f2t/fplAvailability';

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const;

type Props = {
  players: FootballPlayerOwnerRow[];
  loading?: boolean;
  accent: string;
  busyPlayerId?: string | null;
  onToggleFlag: (playerId: string, flagged: boolean) => void;
};

export function F2tAlertsPanel({
  players,
  loading,
  accent,
  busyPlayerId,
  onToggleFlag,
}: Props) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState<string | null>(null);

  const statusSummary = useMemo(() => summarizeFplAlertStatuses(players), [players]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) {
      const label = String(p.team_short_name ?? p.team_name ?? '').trim();
      if (label) set.add(label);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [players]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      const availability = formatFplAvailability(p.picker_stats);
      const status = availability.statusCode.toLowerCase();
      if (statusFilter) {
        if (statusFilter === 'other') {
          if (['i', 'd', 's', 'u', 'n'].includes(status)) return false;
        } else if (status !== statusFilter) {
          return false;
        }
      }
      if (teamFilter) {
        const team = String(p.team_short_name ?? p.team_name ?? '').trim();
        if (team !== teamFilter) return false;
      }
      if (positionFilter) {
        if (String(p.position ?? '').toUpperCase() !== positionFilter) return false;
      }
      if (q) {
        const name = `${p.display_name ?? ''} ${p.full_name ?? ''}`.toLowerCase();
        const team = `${p.team_short_name ?? ''} ${p.team_name ?? ''}`.toLowerCase();
        if (!name.includes(q) && !team.includes(q)) return false;
      }
      return true;
    });
  }, [players, search, statusFilter, teamFilter, positionFilter]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          width: '100%',
          gap: theme.spacing.sm,
        },
        title: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          color: accent,
          letterSpacing: 1.4,
          textTransform: 'uppercase',
        },
        hint: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textSecondary,
          lineHeight: 18,
        },
        summaryRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
        },
        summaryChip: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: theme.radius.sm,
          borderWidth: 1.5,
          backgroundColor: theme.colors.surfaceElevated,
        },
        summaryCount: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 14,
        },
        summaryLabel: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          marginTop: 1,
        },
        searchInput: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontFamily: theme.fontFamily.bai,
          fontSize: 14,
          color: theme.colors.text,
          backgroundColor: theme.colors.surfaceElevated,
        },
        filterLabel: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          color: theme.colors.textMuted,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          marginTop: 4,
        },
        chipScroll: {
          flexGrow: 0,
        },
        chipRow: {
          flexDirection: 'row',
          gap: 8,
          paddingVertical: 2,
        },
        filterChip: {
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        filterChipActive: {
          borderColor: accent,
          backgroundColor: `${accent}22`,
        },
        filterChipText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        filterChipTextActive: {
          color: accent,
        },
        resultMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        clearBtn: {
          alignSelf: 'flex-start',
          paddingVertical: 4,
        },
        clearBtnText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: accent,
        },
      }),
    [theme, accent]
  );

  const hasActiveFilters = !!(search.trim() || statusFilter || teamFilter || positionFilter);

  const toggleStatus = (code: string) => {
    setStatusFilter((prev) => (prev === code ? null : code));
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>First2Twenty · FPL alerts</Text>
        <ActivityIndicator size="small" color={accent} style={{ marginTop: 8 }} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>First2Twenty · FPL alerts</Text>
      <Text style={styles.hint}>
        Players with injury, doubt, suspension, or availability news from the daily FPL sync.
        Exclude anyone who should not be pickable.
      </Text>

      {players.length === 0 ? (
        <Text style={styles.hint}>No current FPL alerts.</Text>
      ) : (
        <>
          <View style={styles.summaryRow}>
            {statusSummary.map((row) => {
              const active = statusFilter === row.code;
              return (
                <Pressable
                  key={row.code}
                  onPress={() => toggleStatus(row.code)}
                  style={[
                    styles.summaryChip,
                    { borderColor: row.color },
                    active && { backgroundColor: `${row.color}22` },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.summaryCount, { color: row.color }]}>{row.count}</Text>
                  <Text style={[styles.summaryLabel, { color: row.color }]}>{row.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search player or team"
            placeholderTextColor={theme.colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />

          <Text style={styles.filterLabel}>Position</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable
              style={[styles.filterChip, !positionFilter && styles.filterChipActive]}
              onPress={() => setPositionFilter(null)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  !positionFilter && styles.filterChipTextActive,
                ]}
              >
                All
              </Text>
            </Pressable>
            {POSITIONS.map((pos) => {
              const active = positionFilter === pos;
              return (
                <Pressable
                  key={pos}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setPositionFilter(active ? null : pos)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}
                  >
                    {pos}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.filterLabel}>Team</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            <Pressable
              style={[styles.filterChip, !teamFilter && styles.filterChipActive]}
              onPress={() => setTeamFilter(null)}
            >
              <Text
                style={[styles.filterChipText, !teamFilter && styles.filterChipTextActive]}
              >
                All
              </Text>
            </Pressable>
            {teams.map((team) => {
              const active = teamFilter === team;
              return (
                <Pressable
                  key={team}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setTeamFilter(active ? null : team)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextActive,
                    ]}
                  >
                    {team}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.resultMeta}>
            Showing {filtered.length} of {players.length}
          </Text>
          {hasActiveFilters ? (
            <Pressable
              style={styles.clearBtn}
              onPress={() => {
                setSearch('');
                setStatusFilter(null);
                setTeamFilter(null);
                setPositionFilter(null);
              }}
            >
              <Text style={styles.clearBtnText}>Clear filters</Text>
            </Pressable>
          ) : null}

          {filtered.length === 0 ? (
            <Text style={styles.hint}>No players match these filters.</Text>
          ) : (
            filtered.map((p) => {
              const id = String(p.id ?? '');
              return (
                <FootballPlayerFlagCard
                  key={id}
                  player={p}
                  accent={accent}
                  busy={busyPlayerId === id}
                  onToggleFlag={onToggleFlag}
                />
              );
            })
          )}
        </>
      )}
    </View>
  );
}
