import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import { f2tListGameweekGoalscorers, type F2tGoalscorerRow } from '@/lib/f2t/api';
import { lmsListGameweeks, type LmsGameweek } from '@/lib/lms/api';

const SEASON = '2026/27';

type Props = {
  /** Bump to refetch (e.g. pull-to-refresh on the parent screen). */
  refreshKey?: number;
};

function pickDefaultGameweek(gws: LmsGameweek[]): LmsGameweek | null {
  if (gws.length === 0) return null;
  const live = gws.find((g) => g.status === 'live');
  if (live) return live;
  const complete = [...gws].reverse().find((g) => g.status === 'complete');
  if (complete) return complete;
  return gws.find((g) => g.status === 'upcoming') ?? gws[0] ?? null;
}

/**
 * Season goalscorers for Tipster20 — filterable by Premier League gameweek.
 */
export function GoalscorersPanel({ refreshKey = 0 }: Props) {
  const theme = useTheme();
  const [gameweeks, setGameweeks] = useState<LmsGameweek[]>([]);
  const [selectedGwId, setSelectedGwId] = useState<string | null>(null);
  const [rows, setRows] = useState<F2tGoalscorerRow[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      setError(null);
      const gws = await lmsListGameweeks(SEASON);
      setGameweeks(gws);
      setSelectedGwId((prev) => {
        if (prev && gws.some((g) => g.id === prev)) return prev;
        return pickDefaultGameweek(gws)?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load gameweeks');
      setGameweeks([]);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  const loadRows = useCallback(async (gameweekId: string) => {
    setLoadingRows(true);
    setError(null);
    try {
      const list = await f2tListGameweekGoalscorers(gameweekId);
      setRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load goalscorers');
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta, refreshKey]);

  useEffect(() => {
    if (!selectedGwId) {
      setRows([]);
      return;
    }
    void loadRows(selectedGwId);
  }, [selectedGwId, loadRows, refreshKey]);

  const selectedGw = useMemo(
    () => gameweeks.find((g) => g.id === selectedGwId) ?? null,
    [gameweeks, selectedGwId]
  );

  const filterGws = gameweeks;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sectionLabel: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 11,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          color: theme.colors.textMuted,
          marginBottom: 8,
        },
        gwScroll: { marginHorizontal: -4, marginBottom: 12 },
        gwRow: {
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 4,
          paddingBottom: 2,
        },
        gwChip: {
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        gwChipActive: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        gwChipText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        gwChipTextActive: { color: theme.colors.accent },
        list: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        colHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingTop: 10,
          paddingBottom: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        colHeaderText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 10,
          color: theme.colors.textMuted,
          letterSpacing: 0.3,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        rowLast: { borderBottomWidth: 0 },
        rank: {
          width: 22,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.textMuted,
          textAlign: 'right',
        },
        player: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
        },
        playerName: {
          flex: 1,
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.text,
        },
        goals: {
          width: 36,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 13,
          color: theme.colors.text,
          textAlign: 'center',
        },
        empty: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
          paddingVertical: 8,
          lineHeight: 18,
        },
        center: {
          paddingVertical: 24,
          alignItems: 'center',
          gap: 8,
        },
      }),
    [theme]
  );

  if (loadingMeta) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (error && gameweeks.length === 0) {
    return (
      <View>
        <Text style={styles.sectionLabel}>Goalscorers</Text>
        <Text style={styles.empty}>{error}</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>Goalscorers</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.gwScroll}
        contentContainerStyle={styles.gwRow}
      >
        {filterGws.map((g) => {
          const active = g.id === selectedGwId;
          return (
            <Pressable
              key={g.id}
              style={[styles.gwChip, active && styles.gwChipActive]}
              onPress={() => setSelectedGwId(g.id)}
            >
              <Text style={[styles.gwChipText, active && styles.gwChipTextActive]}>
                GW{g.number}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loadingRows ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : error ? (
        <Text style={styles.empty}>{error}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>
          {selectedGw
            ? `No goalscorers recorded for GW${selectedGw.number} yet.`
            : 'No gameweeks available.'}
        </Text>
      ) : (
        <View style={styles.list}>
          <View style={styles.colHeader}>
            <Text style={[styles.colHeaderText, { width: 22, textAlign: 'right' }]}>#</Text>
            <Text style={[styles.colHeaderText, { flex: 1 }]}>Player</Text>
            <Text style={[styles.colHeaderText, { width: 36, textAlign: 'center' }]}>G</Text>
          </View>
          {rows.map((r, i) => (
            <View
              key={r.player_id}
              style={[styles.row, i === rows.length - 1 && styles.rowLast]}
            >
              <Text style={styles.rank}>{i + 1}</Text>
              <View style={styles.player}>
                <TeamColourChip
                  shortName={r.team_short_name}
                  name={r.team_name}
                  slug={r.team_slug}
                  size={22}
                />
                <Text style={styles.playerName} numberOfLines={1}>
                  {r.display_name}
                </Text>
              </View>
              <Text style={styles.goals}>{r.goals}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
