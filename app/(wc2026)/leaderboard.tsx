import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { wcHref } from '@/features/wc2026/utils/href';
import { WC_STAGE_SLICES } from '@/features/wc2026/utils/match-number-stage';
import {
  wcFootballLeaderboard,
  wcFootballCompetitionPredictions,
  type WcFootballLeaderboardRow,
  type WcLeaderboardPredictionRow,
} from '@/features/wc2026/services/football-leaderboard';

function firstParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  const raw = Array.isArray(v) ? v[0] : v;
  return typeof raw === 'string' ? raw : '';
}

function stageLabelForMatchNumber(matchNumber: number | null): string {
  if (matchNumber == null) return '—';
  const s = WC_STAGE_SLICES.find((x) => matchNumber >= x.min && matchNumber <= x.max);
  return s?.label ?? 'Match';
}

function formatLiveOutcome(o: 'H' | 'D' | 'A' | null | undefined): string {
  if (o === 'H') return 'Home';
  if (o === 'D') return 'Draw';
  if (o === 'A') return 'Away';
  return '—';
}

function formatPredictionLine(p: WcLeaderboardPredictionRow): string {
  const mn = p.match_number != null ? `Match ${p.match_number}` : 'Pick';
  const stage = stageLabelForMatchNumber(p.match_number);
  const pts = p.points_awarded ?? 0;
  if (p.prediction_type === 'ante_post') {
    const hs = p.home_score != null ? String(p.home_score) : '—';
    const as = p.away_score != null ? String(p.away_score) : '—';
    return `${mn} · ${stage} — ${hs}–${as} — ${pts} pts`;
  }
  const tip = formatLiveOutcome(p.live_outcome ?? null);
  const goals = p.live_total_goals != null ? String(p.live_total_goals) : '—';
  const btts = p.live_btts === true ? 'Yes' : p.live_btts === false ? 'No' : '—';
  return `${mn} · ${stage} — 1X2: ${tip} · goals ${goals} · BTTS ${btts} — ${pts} pts`;
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
  const [predictions, setPredictions] = useState<WcLeaderboardPredictionRow[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!competitionId) {
      setLbRows([]);
      setPredictions([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [rows, preds] = await Promise.all([
        wcFootballLeaderboard(competitionId),
        wcFootballCompetitionPredictions(competitionId),
      ]);
      setLbRows(rows);
      setPredictions(preds);
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
      setPredictions([]);
      setNames({});
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const predsByUser = useMemo(() => {
    const m = new Map<string, WcLeaderboardPredictionRow[]>();
    for (const p of predictions) {
      const list = m.get(p.user_id) ?? [];
      list.push(p);
      m.set(p.user_id, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => {
        const an = a.match_number ?? 9999;
        const bn = b.match_number ?? 9999;
        if (an !== bn) return an - bn;
        if (a.prediction_type !== b.prediction_type) return a.prediction_type.localeCompare(b.prediction_type);
        return a.id.localeCompare(b.id);
      });
    }
    return m;
  }, [predictions]);

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
        content: { padding: theme.spacing.md, paddingBottom: 40 },
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
          paddingHorizontal: theme.spacing.md,
          paddingBottom: theme.spacing.md,
        },
        sectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '700',
          color: theme.colors.accent,
          marginTop: theme.spacing.md,
          marginBottom: 6,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        },
        line: {
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.text,
          lineHeight: 17,
          marginBottom: 6,
        },
        emptyBreak: {
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.textMuted,
          fontStyle: 'italic',
          marginBottom: 4,
        },
      }),
    [theme, insets.top]
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(wcHref('/(wc2026)/(tabs)/competitions'));
  };

  const toggleUser = (uid: string) => {
    setExpandedUserId((prev) => (prev === uid ? null : uid));
  };

  const userSubTotals = (uid: string) => {
    const list = predsByUser.get(uid) ?? [];
    let ante = 0;
    let live = 0;
    for (const p of list) {
      const pts = p.points_awarded ?? 0;
      if (p.prediction_type === 'ante_post') ante += pts;
      else live += pts;
    }
    return { ante, live };
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
            Tap any player to expand ante post and match day points, match by match. Totals match the mini-league
            leaderboard (same picks count in every league you join).
          </Text>
          {loadError ? (
            <Text style={[styles.intro, { color: theme.colors.error }]}>
              {loadError}
              {'\n\n'}
              If this persists, confirm the database migration for `wc_football_competition_predictions` has been applied.
            </Text>
          ) : null}
          {!loadError && lbRows.length === 0 ? (
            <Text style={styles.intro}>No leaderboard data yet — join this league or check back later.</Text>
          ) : null}
          {!loadError && lbRows.length > 0 ? (
            lbRows.map((row, index) => {
              const uid = row.user_id;
              const isYou = userId != null && uid === userId;
              const expanded = expandedUserId === uid;
              const list = predsByUser.get(uid) ?? [];
              const anteRows = list.filter((p) => p.prediction_type === 'ante_post');
              const liveRows = list.filter((p) => p.prediction_type === 'live');
              const { ante, live } = userSubTotals(uid);
              return (
                <View key={uid} style={styles.row}>
                  <TouchableOpacity
                    style={[styles.rowHeader, isYou && styles.rowHeaderYou]}
                    onPress={() => toggleUser(uid)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.rank}>{index + 1}</Text>
                    <View style={styles.userCol}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {names[uid] ?? (isYou ? 'You' : 'Player')}
                        {isYou ? ' (you)' : ''}
                      </Text>
                      <Text style={styles.subTotals}>
                        Ante post {ante} pts · Match day {live} pts
                      </Text>
                    </View>
                    <Text style={styles.pts}>{row.total_points}</Text>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                  {expanded ? (
                    <View style={styles.breakdown}>
                      <Text style={styles.sectionTitle}>Ante post selections</Text>
                      {anteRows.length === 0 ? (
                        <Text style={styles.emptyBreak}>No ante post rows yet.</Text>
                      ) : (
                        anteRows.map((p) => (
                          <Text key={p.id} style={styles.line}>
                            {formatPredictionLine(p)}
                          </Text>
                        ))
                      )}
                      <Text style={styles.sectionTitle}>Match day picks</Text>
                      {liveRows.length === 0 ? (
                        <Text style={styles.emptyBreak}>No match day tips saved yet.</Text>
                      ) : (
                        liveRows.map((p) => (
                          <Text key={p.id} style={styles.line}>
                            {formatPredictionLine(p)}
                          </Text>
                        ))
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
