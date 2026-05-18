import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { wcSupabase } from '@/features/wc2026/lib/supabase';
import { wcHref } from '@/features/wc2026/utils/href';
import { WC_STAGE_SLICES } from '@/features/wc2026/utils/match-number-stage';
import { getFixtures, type Match, type Team } from '@/features/wc2026/services/fixtures';
import { WcLeaderboardPickRow } from '@/features/wc2026/components/WcLeaderboardPredictionRow';
import {
  wcFootballLeaderboard,
  wcFootballUserCompetitionPredictions,
  type WcFootballLeaderboardRow,
  type WcLeaderboardPredictionRow,
} from '@/features/wc2026/services/football-leaderboard';
import { buildKnockoutTeamsByMatchNumber } from '@/features/wc2026/services/knockout-teams-from-predictions';

function firstParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  const raw = Array.isArray(v) ? v[0] : v;
  return typeof raw === 'string' ? raw : '';
}

function formatPoints(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return rounded.toFixed(1);
}

function sortPredictions(list: WcLeaderboardPredictionRow[]): WcLeaderboardPredictionRow[] {
  return [...list].sort((a, b) => {
    const an = a.match_number != null ? Number(a.match_number) : 9999;
    const bn = b.match_number != null ? Number(b.match_number) : 9999;
    if (an !== bn) return an - bn;
    if (a.prediction_type !== b.prediction_type) return a.prediction_type.localeCompare(b.prediction_type);
    return a.id.localeCompare(b.id);
  });
}

function buildMatchIndex(fixtures: Match[]) {
  const byId = new Map<string, Match>();
  const byNum = new Map<number, Match>();
  for (const m of fixtures) {
    byId.set(m.id, m);
    const raw = m.match_number as unknown;
    const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw);
    if (Number.isFinite(n)) byNum.set(n, m);
  }
  return { byId, byNum };
}

function matchForPrediction(p: WcLeaderboardPredictionRow, ix: ReturnType<typeof buildMatchIndex>): Match | null {
  if (p.match_id && ix.byId.has(p.match_id)) return ix.byId.get(p.match_id)!;
  if (p.match_number != null) {
    const n = Number(p.match_number);
    if (Number.isFinite(n) && ix.byNum.has(n)) return ix.byNum.get(n)!;
  }
  return null;
}

/** DB has no knockout rows — merge synthetic teams from bracket rebuild (see `buildKnockoutTeamsByMatchNumber`). */
function resolveDisplayMatch(
  p: WcLeaderboardPredictionRow,
  ix: ReturnType<typeof buildMatchIndex>,
  koMap: Map<number, { home_team: Team; away_team: Team }> | undefined
): Match | null {
  const m = matchForPrediction(p, ix);
  const mn = p.match_number != null ? Number(p.match_number) : null;
  const ko = mn != null && Number.isFinite(mn) ? koMap?.get(mn) : undefined;

  if (m && ko) {
    return {
      ...m,
      home_team: m.home_team ?? ko.home_team,
      away_team: m.away_team ?? ko.away_team,
    };
  }
  if (m) return m;

  if (ko && mn != null && mn >= 73) {
    return {
      id: p.match_id ?? `knockout-${mn}`,
      match_number: mn,
      tournament_stage_id: '',
      group_id: null,
      home_team_id: ko.home_team.id,
      away_team_id: ko.away_team.id,
      venue_id: '',
      match_date: '',
      home_score: null,
      away_score: null,
      status: 'scheduled',
      is_knockout: true,
      created_at: '',
      updated_at: '',
      home_team: ko.home_team,
      away_team: ko.away_team,
    };
  }

  return m;
}

/** Same letter order as group-stage picks elsewhere in the app. */
const WC_GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

type StageSubgroup = { key: string; label: string; rows: WcLeaderboardPredictionRow[] };

type StageBucket = {
  stageId: string;
  label: string;
  order: number;
  rows: WcLeaderboardPredictionRow[];
  subgroups?: StageSubgroup[];
};

function groupLetterSortKey(letter: string): number {
  const u = letter.trim().toUpperCase();
  const i = WC_GROUP_LETTERS.indexOf(u);
  return i >= 0 ? i : 1000;
}

function compareGroupSubgroupKeys(a: string, b: string): number {
  return groupLetterSortKey(a) - groupLetterSortKey(b) || a.localeCompare(b);
}

function subgroupLabelForGroup(key: string): string {
  if (key === '_' || key.length === 0) return 'Other';
  return `Group ${key}`;
}

function stageRowCount(bucket: StageBucket): number {
  if (bucket.subgroups?.length) return bucket.subgroups.reduce((acc, sg) => acc + sg.rows.length, 0);
  return bucket.rows.length;
}

function groupPredictionsByStage(rows: WcLeaderboardPredictionRow[], fixtures: Match[]): StageBucket[] {
  const ix = buildMatchIndex(fixtures);
  const map = new Map<string, StageBucket>();
  for (const s of WC_STAGE_SLICES) {
    map.set(s.id, { stageId: s.id, label: s.label, order: s.min, rows: [] });
  }
  const other: StageBucket = { stageId: '_other', label: 'Other', order: 10000, rows: [] };
  const groupSubMap = new Map<string, WcLeaderboardPredictionRow[]>();

  for (const p of rows) {
    const mn = p.match_number != null && Number.isFinite(Number(p.match_number)) ? Number(p.match_number) : null;
    const slice = mn != null ? WC_STAGE_SLICES.find((x) => mn >= x.min && mn <= x.max) : null;
    if (slice) {
      if (slice.id === 'group') {
        const fx = matchForPrediction(p, ix);
        const raw = fx?.group?.group_name?.trim() ?? '';
        const gkey = raw.length > 0 ? raw.toUpperCase() : '_';
        const arr = groupSubMap.get(gkey) ?? [];
        arr.push(p);
        groupSubMap.set(gkey, arr);
      } else {
        map.get(slice.id)!.rows.push(p);
      }
    } else {
      other.rows.push(p);
    }
  }

  const groupBucket = map.get('group')!;
  if (groupSubMap.size > 0) {
    groupBucket.subgroups = [...groupSubMap.entries()]
      .sort(([ka], [kb]) => compareGroupSubgroupKeys(ka, kb))
      .map(([key, rws]) => ({
        key,
        label: subgroupLabelForGroup(key),
        rows: rws.sort((a, c) => {
          const an = a.match_number != null ? Number(a.match_number) : 0;
          const cn = c.match_number != null ? Number(c.match_number) : 0;
          return an - cn || a.id.localeCompare(c.id);
        }),
      }));
    groupBucket.rows = [];
  }

  const out: StageBucket[] = [...map.values()].filter((b) => (b.subgroups?.length ?? 0) > 0 || b.rows.length > 0);
  if (other.rows.length > 0) out.push(other);
  out.sort((a, b) => a.order - b.order);
  for (const b of out) {
    if (b.subgroups?.length) continue;
    b.rows.sort((a, c) => {
      const an = a.match_number != null ? Number(a.match_number) : 0;
      const cn = c.match_number != null ? Number(c.match_number) : 0;
      return an - cn || a.id.localeCompare(c.id);
    });
  }
  return out;
}

function stageOpenKey(userId: string, stageId: string) {
  return `${userId}::${stageId}`;
}

export default function WcFootballLeaderboardScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const params = useLocalSearchParams<{ competitionId?: string | string[]; name?: string | string[] }>();
  const competitionId = firstParam(params.competitionId);
  const nameParam = firstParam(params.name);
  let title = 'Leaderboard';
  if (nameParam.length > 0) {
    try {
      title = decodeURIComponent(nameParam);
    } catch {
      title = nameParam;
    }
  }

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lbRows, setLbRows] = useState<WcFootballLeaderboardRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  /** Per-user predictions for this competition; key present = loaded (possibly empty). */
  const [predCache, setPredCache] = useState<Record<string, WcLeaderboardPredictionRow[]>>({});
  const [drawerLoadingUserId, setDrawerLoadingUserId] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<Match[]>([]);
  const [teamsById, setTeamsById] = useState<Record<string, Team>>({});
  /** Per-user synthetic knockout sides (match_number ≥ 73) — DB fixtures only cover the group stage. */
  const [koTeamMaps, setKoTeamMaps] = useState<Record<string, Map<number, { home_team: Team; away_team: Team }>>>(
    {}
  );
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [openStages, setOpenStages] = useState<Record<string, boolean>>({});
  /** Deduplicate overlapping fetches for the same user (e.g. prefetch + drawer). */
  const fetchInflightRef = useRef<Map<string, Promise<void>>>(new Map());

  const ensureUserPredictions = useCallback(
    async (targetId: string) => {
      if (!competitionId) return;
      if (Object.prototype.hasOwnProperty.call(predCache, targetId)) return;
      const existing = fetchInflightRef.current.get(targetId);
      if (existing) {
        await existing;
        return;
      }
      const p = (async () => {
        setDrawerLoadingUserId(targetId);
        try {
          const rows = await wcFootballUserCompetitionPredictions(competitionId, targetId);
          setPredCache((prev) => ({ ...prev, [targetId]: sortPredictions(rows) }));
        } catch {
          setPredCache((prev) => ({ ...prev, [targetId]: [] }));
        } finally {
          setDrawerLoadingUserId((cur) => (cur === targetId ? null : cur));
          fetchInflightRef.current.delete(targetId);
        }
      })();
      fetchInflightRef.current.set(targetId, p);
      await p;
    },
    [competitionId, predCache]
  );

  const load = useCallback(async () => {
    if (!competitionId) {
      setLbRows([]);
      setPredCache({});
      setFixtures([]);
      setTeamsById({});
      setKoTeamMaps({});
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    fetchInflightRef.current.clear();
    setPredCache({});
    setKoTeamMaps({});
    try {
      const [rows, fx, teamsRes] = await Promise.all([
        wcFootballLeaderboard(competitionId),
        getFixtures().catch(() => [] as Match[]),
        wcSupabase.from('teams').select('id, country_code, country_name, confederation, fifa_ranking'),
      ]);
      setLbRows(rows);
      setFixtures(fx);
      const tm: Record<string, Team> = {};
      if (!teamsRes.error && teamsRes.data) {
        for (const t of teamsRes.data as Team[]) {
          tm[t.id] = t;
        }
      }
      setTeamsById(tm);
      const ids = [...new Set(rows.map((r) => r.user_id))];
      if (ids.length) {
        const { data: profiles, error: profErr } = await supabase.from('profiles').select('id, username').in('id', ids);
        if (profErr) {
          setLoadError(profErr.message);
        }
        const map: Record<string, string> = {};
        for (const p of (profiles ?? []) as { id: string; username: string | null }[]) {
          map[p.id] = p.username?.trim() || 'Player';
        }
        setNames(map);
      } else {
        setNames({});
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not load leaderboard.';
      setLoadError(msg);
      setLbRows([]);
      setPredCache({});
      setFixtures([]);
      setTeamsById({});
      setKoTeamMaps({});
      setNames({});
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!expandedUserId) return;
    void ensureUserPredictions(expandedUserId);
  }, [expandedUserId, ensureUserPredictions]);

  useEffect(() => {
    if (!userId || !competitionId || lbRows.length === 0) return;
    void ensureUserPredictions(userId);
  }, [userId, competitionId, lbRows.length, ensureUserPredictions]);

  useEffect(() => {
    setOpenStages({});
  }, [expandedUserId]);

  useEffect(() => {
    if (!expandedUserId) return;
    if (!Object.prototype.hasOwnProperty.call(predCache, expandedUserId)) return;
    const rows = predCache[expandedUserId] ?? [];
    let cancelled = false;
    void (async () => {
      try {
        const map = await buildKnockoutTeamsByMatchNumber(fixtures, rows);
        if (!cancelled) {
          setKoTeamMaps((prev) => ({ ...prev, [expandedUserId]: map }));
        }
      } catch {
        if (!cancelled) {
          setKoTeamMaps((prev) => ({ ...prev, [expandedUserId]: new Map() }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedUserId, predCache, fixtures]);

  const matchIndex = useMemo(() => buildMatchIndex(fixtures), [fixtures]);

  const rankedCombined = useMemo(() => {
    if (lbRows.length === 0) return [];
    const sorted = [...lbRows].sort((a, b) => b.live_points - a.live_points || a.user_id.localeCompare(b.user_id));
    const out: { row: WcFootballLeaderboardRow; rank: number }[] = [];
    for (let i = 0; i < sorted.length; i++) {
      let rank = 1;
      if (i > 0) {
        if (sorted[i].live_points < sorted[i - 1].live_points) rank = i + 1;
        else rank = out[i - 1].rank;
      }
      out.push({ row: sorted[i], rank });
    }
    return out;
  }, [lbRows]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
          paddingTop: Platform.OS === 'web' ? 12 : insets.top + 8,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
        backHit: { padding: 8, marginLeft: -4 },
        headerTitle: {
          flex: 1,
          fontFamily: theme.fontFamily.regular,
          fontSize: 17,
          fontWeight: '700',
          color: theme.colors.text,
        },
        scroll: { flex: 1 },
        content: { padding: theme.spacing.md, paddingBottom: insets.bottom + 40 },
        intro: {
          fontFamily: theme.fontFamily.light,
          fontSize: 13,
          color: theme.colors.textSecondary,
          lineHeight: 19,
          marginBottom: theme.spacing.md,
        },
        row: {
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          marginBottom: theme.spacing.sm,
          overflow: 'hidden',
        },
        rowHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 14,
          paddingHorizontal: theme.spacing.md,
          gap: 10,
        },
        rowHeaderYou: {
          borderLeftWidth: 3,
          borderLeftColor: theme.colors.accent,
        },
        rank: {
          width: 32,
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '700',
          color: theme.colors.textMuted,
        },
        userCol: { flex: 1, minWidth: 0 },
        userName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '700',
          color: theme.colors.text,
        },
        subTotals: {
          fontFamily: theme.fontFamily.light,
          fontSize: 11,
          color: theme.colors.textMuted,
          marginTop: 4,
        },
        pts: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '800',
          color: theme.colors.accent,
        },
        breakdown: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.surfaceElevated,
          paddingHorizontal: theme.spacing.sm,
          paddingBottom: theme.spacing.sm,
        },
        drawerTabRow: {
          flexDirection: 'row',
          gap: theme.spacing.xs,
          marginTop: theme.spacing.sm,
          marginBottom: theme.spacing.sm,
        },
        drawerTabPill: {
          flex: 1,
          paddingVertical: 8,
          paddingHorizontal: theme.spacing.xs,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        drawerTabPillActive: {
          backgroundColor: theme.colors.accent,
          borderColor: theme.colors.accent,
        },
        drawerTabText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
        drawerTabTextActive: {
          color: theme.colors.white,
          fontWeight: '700',
        },
        stageBlock: {
          marginBottom: 4,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          overflow: 'hidden',
          backgroundColor: theme.colors.surface,
        },
        stageHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 8,
          paddingHorizontal: theme.spacing.sm,
          backgroundColor: theme.colors.background,
        },
        stageTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '700',
          color: theme.colors.text,
          flex: 1,
        },
        stageMeta: {
          fontFamily: theme.fontFamily.light,
          fontSize: 10,
          color: theme.colors.textMuted,
          marginRight: 4,
        },
        subgroupTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          color: theme.colors.textSecondary,
          paddingHorizontal: theme.spacing.sm,
          paddingTop: 8,
          paddingBottom: 4,
          backgroundColor: theme.colors.surfaceElevated,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        emptyBreak: {
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.textMuted,
          fontStyle: 'italic',
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.xs,
        },
        drawerLoading: {
          paddingVertical: theme.spacing.md,
          alignItems: 'center',
        },
      }),
    [theme, insets.top, insets.bottom]
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(wcHref('/(wc2026)/(tabs)/competitions'));
  };

  const toggleUser = (uid: string) => {
    setExpandedUserId((prev) => (prev === uid ? null : uid));
  };

  const toggleStage = (userId: string, stageId: string) => {
    const k = stageOpenKey(userId, stageId);
    setOpenStages((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  if (!competitionId) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingHorizontal: 20 }]}>
        <Text style={styles.headerTitle}>Missing league</Text>
        <TouchableOpacity onPress={goBack} style={{ marginTop: 16 }}>
          <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>Back to competitions</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backHit} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.intro}>
            Rankings use match day pick points. Tap a player to load their picks once (cached for this competition until you
            leave). Expand each stage to see flags, result, your prediction, and Win or Loss when the match is finished and
            points are in.
          </Text>
          {loadError ? (
            <Text style={[styles.intro, { color: theme.colors.error }]}>
              {loadError}
              {'\n\n'}
              If picks never load, apply migration 049 (per-user predictions + split totals on the leaderboard RPC).
            </Text>
          ) : null}
          {!loadError && lbRows.length === 0 ? (
            <Text style={styles.intro}>No leaderboard data yet — join this league or check back later.</Text>
          ) : null}
          {!loadError && lbRows.length > 0
            ? rankedCombined.map(({ row, rank }) => {
                const uid = row.user_id;
                const koMap = koTeamMaps[uid];
                const isYou = userId != null && uid === userId;
                const expanded = expandedUserId === uid;
                const cacheLoaded = Object.prototype.hasOwnProperty.call(predCache, uid);
                const list = predCache[uid] ?? [];
                const breakdownRows = list.filter((p) => p.prediction_type === 'live');
                const stageBuckets = groupPredictionsByStage(breakdownRows, fixtures);
                const drawerBusy = drawerLoadingUserId === uid;
                return (
                  <View key={uid} style={styles.row}>
                    <TouchableOpacity
                      style={[styles.rowHeader, isYou && styles.rowHeaderYou]}
                      onPress={() => toggleUser(uid)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.rank}>{rank}</Text>
                      <View style={styles.userCol}>
                        <Text style={styles.userName} numberOfLines={1}>
                          {names[uid] ?? (isYou ? 'You' : 'Player')}
                          {isYou ? ' (you)' : ''}
                        </Text>
                        <Text style={styles.subTotals}>Match day picks</Text>
                      </View>
                      <Text style={styles.pts}>{formatPoints(row.live_points)}</Text>
                      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                    {expanded ? (
                      <View style={styles.breakdown}>
                        {drawerBusy && !cacheLoaded ? (
                          <View style={styles.drawerLoading}>
                            <ActivityIndicator color={theme.colors.accent} />
                          </View>
                        ) : null}
                        {cacheLoaded && breakdownRows.length === 0 ? (
                          <Text style={styles.emptyBreak}>
                            No match day picks saved yet.
                          </Text>
                        ) : null}
                        {cacheLoaded && breakdownRows.length > 0
                          ? stageBuckets.map((bucket) => {
                              const sk = stageOpenKey(uid, bucket.stageId);
                              const isOpen = openStages[sk] === true;
                              const matchCount = stageRowCount(bucket);
                              return (
                                <View key={bucket.stageId} style={styles.stageBlock}>
                                  <TouchableOpacity
                                    style={styles.stageHeader}
                                    onPress={() => toggleStage(uid, bucket.stageId)}
                                    activeOpacity={0.75}
                                  >
                                    <Text style={styles.stageTitle} numberOfLines={1}>
                                      {bucket.label}
                                    </Text>
                                    <Text style={styles.stageMeta}>
                                      {matchCount} match{matchCount === 1 ? '' : 'es'}
                                    </Text>
                                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
                                  </TouchableOpacity>
                                  {isOpen
                                    ? bucket.subgroups && bucket.subgroups.length > 0
                                      ? bucket.subgroups.map((sg) => (
                                          <View key={`${bucket.stageId}::${sg.key}`}>
                                            <Text style={styles.subgroupTitle}>{sg.label}</Text>
                                            {sg.rows.map((p) => (
                                              <WcLeaderboardPickRow
                                                key={p.id}
                                                prediction={p}
                                                match={resolveDisplayMatch(p, matchIndex, koMap)}
                                                teamsById={teamsById}
                                              />
                                            ))}
                                          </View>
                                        ))
                                      : bucket.rows.map((p) => (
                                          <WcLeaderboardPickRow
                                            key={p.id}
                                            prediction={p}
                                            match={resolveDisplayMatch(p, matchIndex, koMap)}
                                            teamsById={teamsById}
                                          />
                                        ))
                                    : null}
                                </View>
                              );
                            })
                          : null}
                      </View>
                    ) : null}
                  </View>
                );
              })
            : null}
        </ScrollView>
      )}
    </View>
  );
}
