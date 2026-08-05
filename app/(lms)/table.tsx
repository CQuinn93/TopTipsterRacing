import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useSidebar } from '@/contexts/SidebarContext';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import { lmsGetLeagueTable, type LmsLeagueTableRow } from '@/lib/lms/api';
import {
  lmsSessionGetLeagueTable,
  lmsSessionSetLeagueTable,
} from '@/lib/lms/sessionCache';

const SEASON = '2026/27';

function formatUpdatedAt(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function gdLabel(gd: number): string {
  if (gd > 0) return `+${gd}`;
  return String(gd);
}

export default function LmsTableScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { openSidebar } = useSidebar();

  const [rows, setRows] = useState<LmsLeagueTableRow[]>([]);
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      setError(null);
      if (!force) {
        const cached = lmsSessionGetLeagueTable(SEASON);
        if (cached?.success) {
          setRows(cached.rows);
          setComputedAt(cached.computed_at);
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
      setComputedAt(table.computed_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load table');
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(true);
  }, [load]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        },
        title: {
          flex: 1,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 20,
          color: theme.colors.text,
        },
        meta: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          gap: 2,
        },
        metaText: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        colHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          gap: theme.spacing.sm,
        },
        colHeaderText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          color: theme.colors.textMuted,
          letterSpacing: 0.4,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          gap: theme.spacing.sm,
        },
        pos: {
          width: 22,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
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
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 14,
          color: theme.colors.text,
        },
        num: {
          width: 28,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
        pts: {
          width: 32,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 13,
          color: theme.colors.text,
          textAlign: 'center',
        },
        center: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: theme.spacing.xl,
          gap: theme.spacing.sm,
        },
        errorText: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 14,
          color: theme.colors.textMuted,
          textAlign: 'center',
        },
        emptyText: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 14,
          color: theme.colors.textMuted,
          textAlign: 'center',
        },
      }),
    [theme, insets.top]
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={openSidebar} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open menu">
          <Ionicons name="menu" size={24} color={theme.colors.text} />
        </Pressable>
        <Text style={styles.title}>Table</Text>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
          <Ionicons name="close" size={22} color={theme.colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.meta}>
        <Text style={styles.metaText}>Premier League · {SEASON}</Text>
        {computedAt ? (
          <Text style={styles.metaText}>Updated {formatUpdatedAt(computedAt)}</Text>
        ) : null}
      </View>

      <View style={styles.colHeader}>
        <Text style={[styles.colHeaderText, { width: 22, textAlign: 'right' }]}>#</Text>
        <Text style={[styles.colHeaderText, { flex: 1 }]}>Club</Text>
        <Text style={[styles.colHeaderText, { width: 28, textAlign: 'center' }]}>GP</Text>
        <Text style={[styles.colHeaderText, { width: 28, textAlign: 'center' }]}>W</Text>
        <Text style={[styles.colHeaderText, { width: 28, textAlign: 'center' }]}>D</Text>
        <Text style={[styles.colHeaderText, { width: 28, textAlign: 'center' }]}>L</Text>
        <Text style={[styles.colHeaderText, { width: 28, textAlign: 'center' }]}>GD</Text>
        <Text style={[styles.colHeaderText, { width: 32, textAlign: 'center' }]}>PTS</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load(true)} hitSlop={8}>
            <Text style={[styles.metaText, { color: theme.colors.accent }]}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.accent}
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.xl }}
        >
          {rows.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>No finished fixtures yet this season.</Text>
            </View>
          ) : (
            rows.map((r) => (
              <View key={r.team_id} style={styles.row}>
                <Text style={styles.pos}>{r.position}</Text>
                <View style={styles.club}>
                  <TeamColourChip
                    shortName={r.short_name}
                    name={r.name}
                    slug={r.slug}
                    size={24}
                  />
                  <Text style={styles.clubName} numberOfLines={1}>
                    {r.name}
                  </Text>
                </View>
                <Text style={styles.num}>{r.played}</Text>
                <Text style={styles.num}>{r.won}</Text>
                <Text style={styles.num}>{r.drawn}</Text>
                <Text style={styles.num}>{r.lost}</Text>
                <Text style={styles.num}>{gdLabel(r.gd)}</Text>
                <Text style={styles.pts}>{r.points}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
