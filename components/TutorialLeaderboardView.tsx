import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { displayHorseName } from '@/lib/displayHorseName';
import { decimalToFractional } from '@/lib/oddsFormat';
import { fetchTutorialData } from '@/lib/fetchTutorialData';
import {
  botSelectionsByUser,
  getTutorialMeetingStart,
  maxWinningSpForSelections,
  pointsForSelectionsOnRaces,
  tutorialJsonToRaces,
  type SelectionsMap,
} from '@/lib/tutorialRaceBuilders';
import { loadTutorialSession, tutorialMeetingSlug } from '@/lib/tutorialSession';
import type { TutorialGetDataPayload } from '@/lib/tutorialTypes';
import type { Race } from '@/types/races';

type Row = {
  id: string;
  name: string;
  total: number;
  isYou: boolean;
  maxSp: number;
  bestSpHorse?: string;
  bestSpRace?: string;
};

export function TutorialLeaderboardView() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<TutorialGetDataPayload | null>(null);
  const [displayName, setDisplayName] = useState('You');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let c = false;
    void (async () => {
      const { data } = await supabase.from('profiles').select('username').eq('id', userId).maybeSingle();
      if (!c && data && typeof (data as { username?: string }).username === 'string') {
        setDisplayName((data as { username: string }).username);
      }
    })();
    return () => {
      c = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const data = await fetchTutorialData();
      if (!cancelled) setPayload(data);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const meetingStart = useMemo(() => getTutorialMeetingStart(), []);
  const races = useMemo(() => tutorialJsonToRaces(payload?.races, meetingStart), [payload?.races, meetingStart]);
  const slug = tutorialMeetingSlug(payload);

  const [sessionSelections, setSessionSelections] = useState<SelectionsMap>({});

  const refreshSession = useCallback(async () => {
    if (!userId || !payload) return;
    const s = await loadTutorialSession(userId, slug);
    if (s?.selections) setSessionSelections(s.selections);
    else setSessionSelections({});
  }, [userId, payload, slug]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useFocusEffect(
    useCallback(() => {
      void refreshSession();
    }, [refreshSession])
  );

  const rows: Row[] = useMemo(() => {
    if (!payload || !races.length) return [];
    const botMap = botSelectionsByUser(payload.botSelections);
    const out: Row[] = [];
    if (userId) {
      const best = maxWinningSpForSelections(races, sessionSelections);
      out.push({
        id: userId,
        name: displayName,
        total: pointsForSelectionsOnRaces(races, sessionSelections),
        isYou: true,
        maxSp: best?.sp ?? 0,
        bestSpHorse: best?.runnerName,
        bestSpRace: best?.raceName,
      });
    }
    for (const bot of payload.bots ?? []) {
      const sel = botMap[bot.id];
      const map: SelectionsMap = {};
      if (sel) {
        for (const [raceId, v] of Object.entries(sel)) {
          map[raceId] = { runnerId: v.runnerId, runnerName: v.runnerName, oddsDecimal: v.oddsDecimal };
        }
      }
      const best = maxWinningSpForSelections(races, map);
      out.push({
        id: bot.id,
        name: bot.displayName,
        total: pointsForSelectionsOnRaces(races, map),
        isYou: false,
        maxSp: best?.sp ?? 0,
        bestSpHorse: best?.runnerName,
        bestSpRace: best?.raceName,
      });
    }
    return out.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [payload, races, userId, displayName, sessionSelections]);

  const styles = useMemo(() => {
    const isLight = String(theme.colors.background) === String(lightTheme.colors.background);
    const cardBorder = isLight ? theme.colors.white : theme.colors.border;
    const cardBorderWidth = isLight ? 2 : 1;
    return StyleSheet.create({
      root: { flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top },
      banner: {
        backgroundColor: theme.colors.accentMuted,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.accent,
      },
      bannerText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.accent,
        textAlign: 'center',
      },
      scroll: { flex: 1 },
      content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
      title: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 20,
        fontWeight: '700',
        color: theme.colors.text,
        marginBottom: theme.spacing.xs,
      },
      subtitle: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.textMuted, marginBottom: theme.spacing.md },
      exitLink: { marginBottom: theme.spacing.md },
      exitText: { fontFamily: theme.fontFamily.regular, fontSize: 14, color: theme.colors.accent, fontWeight: '500' },
      row: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.xs,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
      },
      rowYou: { borderColor: theme.colors.accent, borderWidth: 2 },
      rank: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: theme.colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: theme.spacing.sm,
      },
      rankText: { fontFamily: theme.fontFamily.regular, fontSize: 12, fontWeight: '700', color: theme.colors.black },
      center: { flex: 1, minWidth: 0 },
      name: { fontFamily: theme.fontFamily.regular, fontSize: 15, fontWeight: '700', color: theme.colors.text },
      meta: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
      pts: { fontFamily: theme.fontFamily.regular, fontSize: 16, fontWeight: '700', color: theme.colors.accent },
      expand: { marginTop: theme.spacing.sm, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border },
      expandLine: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.textSecondary, marginBottom: 4 },
      coach: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        padding: theme.spacing.md,
        paddingBottom: Math.max(theme.spacing.md, insets.bottom),
      },
      coachText: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
      coachRow: { flexDirection: 'row', gap: theme.spacing.sm },
      coachBtn: {
        flex: 1,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
      },
      coachBtnPrimary: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
      coachBtnText: { fontFamily: theme.fontFamily.regular, fontSize: 13, fontWeight: '600', color: theme.colors.text },
      coachBtnTextPrimary: { color: theme.colors.black },
      centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.lg },
    });
  }, [theme, insets.top, insets.bottom]);

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  if (!payload?.races?.length) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.subtitle}>Could not load practice leaderboard.</Text>
        <TouchableOpacity style={[styles.coachBtn, styles.coachBtnPrimary]} onPress={() => router.replace('/(app)/leaderboard')}>
          <Text style={[styles.coachBtnText, styles.coachBtnTextPrimary]}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const meetingTitle = payload.meeting?.title ?? 'Tutorial';

  const breakdownFor = (row: Row): { race: Race; pts: number }[] => {
    let selections: SelectionsMap = {};
    if (row.isYou) selections = sessionSelections;
    else {
      const botMap = botSelectionsByUser(payload.botSelections);
      const sel = botMap[row.id];
      if (sel) {
        for (const [raceId, v] of Object.entries(sel)) {
          selections[raceId] = { runnerId: v.runnerId, runnerName: v.runnerName, oddsDecimal: v.oddsDecimal };
        }
      }
    }
    return races.map((race) => {
      const pick = selections[race.id];
      let pts = 0;
      if (pick?.runnerId) {
        const res = race.results?.[pick.runnerId];
        if (res != null && (res.pos_points != null || res.sp_points != null)) {
          pts = (res.pos_points ?? 0) + (res.sp_points ?? 0);
        }
      }
      return { race, pts };
    });
  };

  return (
    <View style={styles.root}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>Practice leaderboard — sample points only</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{meetingTitle}</Text>
        <Text style={styles.subtitle}>Totals use the same position points as the real game (tutorial omits SP bonus).</Text>
        <TouchableOpacity style={styles.exitLink} onPress={() => router.replace('/(app)/leaderboard')}>
          <Text style={styles.exitText}>← Exit practice mode</Text>
        </TouchableOpacity>

        {rows.map((row, index) => {
          const open = expandedId === row.id;
          return (
            <TouchableOpacity
              key={row.id}
              style={[styles.row, row.isYou && styles.rowYou]}
              onPress={() => setExpandedId(open ? null : row.id)}
              activeOpacity={0.85}
            >
              <View style={styles.rank}>
                <Text style={styles.rankText}>{index + 1}</Text>
              </View>
              <View style={styles.center}>
                <Text style={styles.name} numberOfLines={1}>
                  {row.isYou ? `${displayName} (you)` : row.name}
                </Text>
                <Text style={styles.meta}>
                  Top Tipster pick: {row.maxSp > 0 ? `${decimalToFractional(row.maxSp)} (${displayHorseName(row.bestSpHorse ?? '')})` : '—'}
                </Text>
                {open && (
                  <View style={styles.expand}>
                    {breakdownFor(row).map(({ race, pts }) => (
                      <Text key={race.id} style={styles.expandLine}>
                        {race.name}: {pts} pts
                      </Text>
                    ))}
                  </View>
                )}
              </View>
              <Text style={styles.pts}>{row.total}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.coach}>
        <Text style={styles.coachText}>Open Results to tap horses for position vs bonus breakdown. Your practice picks live under My selections with ?tutorial=1.</Text>
        <View style={styles.coachRow}>
          <TouchableOpacity style={[styles.coachBtn, styles.coachBtnPrimary]} onPress={() => router.push('/(app)/results?tutorial=1')}>
            <Text style={[styles.coachBtnText, styles.coachBtnTextPrimary]}>Results</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.coachBtn} onPress={() => router.push('/(app)/selections?tutorial=1')}>
            <Text style={styles.coachBtnText}>My selections</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
