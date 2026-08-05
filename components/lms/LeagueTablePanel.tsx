import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import { lmsGetLeagueTable, type LmsLeagueTableRow } from '@/lib/lms/api';
import {
  lmsSessionGetLeagueTable,
  lmsSessionSetLeagueTable,
} from '@/lib/lms/sessionCache';

const SEASON = '2026/27';
const PAGE_SIZE = 10;

function gdLabel(gd: number): string {
  if (gd > 0) return `+${gd}`;
  return String(gd);
}

type Props = {
  /** Bump to refetch (e.g. pull-to-refresh on the parent screen). */
  refreshKey?: number;
};

/**
 * Compact PL table (GP / W / D / L / GD / PTS) derived from finished fixtures.
 * Page 1 = positions 1–10, page 2 = the rest.
 */
export function LeagueTablePanel({ refreshKey = 0 }: Props) {
  const theme = useTheme();
  const [rows, setRows] = useState<LmsLeagueTableRow[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      setError(null);
      if (!force) {
        const cached = lmsSessionGetLeagueTable(SEASON);
        if (cached?.success) {
          setRows(cached.rows);
          setLoading(false);
          return;
        }
      }

      const table = await lmsGetLeagueTable(SEASON);
      if (!table.success) {
        setError(table.error ?? 'Could not load table');
        setRows([]);
        return;
      }
      lmsSessionSetLeagueTable(SEASON, table);
      setRows(table.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load table');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(refreshKey > 0);
  }, [load, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(
    () => rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [rows, safePage]
  );

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
        list: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        colHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingBottom: 8,
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
          gap: 6,
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        rowLast: { borderBottomWidth: 0 },
        pos: {
          width: 20,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.textMuted,
          textAlign: 'right',
        },
        club: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
        },
        clubName: {
          flex: 1,
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.text,
        },
        num: {
          width: 26,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
        pts: {
          width: 28,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 12,
          color: theme.colors.text,
          textAlign: 'center',
        },
        pager: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 12,
          gap: 12,
        },
        pagerBtn: {
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
        pagerBtnDisabled: { opacity: 0.35 },
        pagerBtnText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.accent,
        },
        pagerMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        empty: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
          paddingVertical: 8,
        },
        center: {
          paddingVertical: 24,
          alignItems: 'center',
          gap: 8,
        },
      }),
    [theme]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View>
        <Text style={styles.sectionLabel}>Premier League table</Text>
        <Text style={styles.empty}>{error}</Text>
        <Pressable onPress={() => void load(true)} hitSlop={8}>
          <Text style={[styles.pagerBtnText, { marginTop: 4 }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const from = rows.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(rows.length, (safePage + 1) * PAGE_SIZE);

  return (
    <View>
      <Text style={styles.sectionLabel}>Premier League table</Text>

      {rows.length === 0 ? (
        <Text style={styles.empty}>No finished fixtures yet this season.</Text>
      ) : (
        <>
          <View style={styles.list}>
            <View style={styles.colHeader}>
              <Text style={[styles.colHeaderText, { width: 20, textAlign: 'right' }]}>#</Text>
              <Text style={[styles.colHeaderText, { flex: 1 }]}>Club</Text>
              <Text style={[styles.colHeaderText, { width: 26, textAlign: 'center' }]}>GP</Text>
              <Text style={[styles.colHeaderText, { width: 26, textAlign: 'center' }]}>W</Text>
              <Text style={[styles.colHeaderText, { width: 26, textAlign: 'center' }]}>D</Text>
              <Text style={[styles.colHeaderText, { width: 26, textAlign: 'center' }]}>L</Text>
              <Text style={[styles.colHeaderText, { width: 26, textAlign: 'center' }]}>GD</Text>
              <Text style={[styles.colHeaderText, { width: 28, textAlign: 'center' }]}>PTS</Text>
            </View>

            {pageRows.map((r, i) => (
              <View
                key={r.team_id}
                style={[styles.row, i === pageRows.length - 1 && styles.rowLast]}
              >
                <Text style={styles.pos}>{r.position}</Text>
                <View style={styles.club}>
                  <TeamColourChip
                    shortName={r.short_name}
                    name={r.name}
                    slug={r.slug}
                    size={22}
                  />
                  <Text style={styles.clubName} numberOfLines={1}>
                    {r.short_name || r.name}
                  </Text>
                </View>
                <Text style={styles.num}>{r.played}</Text>
                <Text style={styles.num}>{r.won}</Text>
                <Text style={styles.num}>{r.drawn}</Text>
                <Text style={styles.num}>{r.lost}</Text>
                <Text style={styles.num}>{gdLabel(r.gd)}</Text>
                <Text style={styles.pts}>{r.points}</Text>
              </View>
            ))}
          </View>

          {pageCount > 1 ? (
            <View style={styles.pager}>
              <Pressable
                style={[styles.pagerBtn, safePage === 0 && styles.pagerBtnDisabled]}
                onPress={() => setPage(0)}
                disabled={safePage === 0}
                accessibilityRole="button"
                accessibilityLabel="Show top of table"
              >
                <Text style={styles.pagerBtnText}>1–10</Text>
              </Pressable>
              <Text style={styles.pagerMeta}>
                {from}–{to} of {rows.length}
              </Text>
              <Pressable
                style={[styles.pagerBtn, safePage >= pageCount - 1 && styles.pagerBtnDisabled]}
                onPress={() => setPage(1)}
                disabled={safePage >= pageCount - 1}
                accessibilityRole="button"
                accessibilityLabel="Show bottom of table"
              >
                <Text style={styles.pagerBtnText}>11–{rows.length || 20}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
