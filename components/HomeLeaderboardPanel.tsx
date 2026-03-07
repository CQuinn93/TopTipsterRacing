/**
 * Compact leaderboard panel for web home screen.
 * Shows top 10 by actual points (pos_points + sp_points from race results).
 */
import { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchRaceDaysForCompetition } from '@/lib/raceDaysForCompetition';
import type { Race, RaceResult } from '@/types/races';

type LeaderboardRow = { user_id: string; display_name: string; score: number; rank: number };

function getResultForPick(race: Race, runnerId: string): RaceResult | null {
  const results = race.results ?? {};
  if (runnerId === 'FAV') {
    if (results['FAV']) return results['FAV'];
    const favId = Object.entries(results).reduce<string | null>((best, [id, r]) => {
      const sp = r?.sp ?? Infinity;
      return !best || sp < ((results[best] as RaceResult)?.sp ?? Infinity) ? id : best;
    }, null);
    return favId ? (results[favId] as RaceResult) : null;
  }
  return (results[runnerId] as RaceResult) ?? null;
}

export function HomeLeaderboardPanel({
  competitionId,
  competitionName,
}: {
  competitionId: string;
  competitionName: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { userId } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!competitionId) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [partsRes, selRes, raceDaysData] = await Promise.all([
          supabase.from('competition_participants').select('user_id, display_name').eq('competition_id', competitionId),
          supabase.from('daily_selections').select('user_id, race_date, selections').eq('competition_id', competitionId),
          fetchRaceDaysForCompetition(supabase, competitionId, 'id, race_date, races'),
        ]);
        if (cancelled) return;
        const parts = (partsRes.data ?? []) as { user_id: string; display_name: string }[];
        const selectionsData = (selRes.data ?? []) as { user_id: string; race_date: string; selections: Record<string, { runnerId?: string }> | null }[];
        const raceDaysRows = (raceDaysData ?? []) as { id: string; race_date: string; races: Race[] }[];

        const raceByDateAndId = new Map<string, Race>();
        for (const d of raceDaysRows) {
          const races = d.races ?? [];
          for (const r of races) {
            raceByDateAndId.set(`${d.race_date}:${r.id}`, r);
          }
        }

        const byUser: Record<string, number> = {};
        for (const p of parts) byUser[p.user_id] = 0;

        for (const row of selectionsData) {
          const sel = row.selections;
          if (!sel) continue;
          const uid = row.user_id;
          for (const [raceId, v] of Object.entries(sel)) {
            if (!v?.runnerId) continue;
            const race = raceByDateAndId.get(`${row.race_date}:${raceId}`);
            if (!race) continue;
            const result = getResultForPick(race, v.runnerId);
            const pts = result != null && (result.pos_points != null || result.sp_points != null)
              ? (result.pos_points ?? 0) + (result.sp_points ?? 0)
              : 0;
            byUser[uid] = (byUser[uid] ?? 0) + pts;
          }
        }

        const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', parts.map((p) => p.user_id));
        const usernameByUserId: Record<string, string> = {};
        for (const pr of profiles ?? []) (usernameByUserId as Record<string, string>)[(pr as { id: string; username?: string }).id] = (pr as { username?: string }).username ?? '';
        const sorted = parts
          .map((p) => ({
            user_id: p.user_id,
            display_name: usernameByUserId[p.user_id] ?? p.display_name,
            score: byUser[p.user_id] ?? 0,
          }))
          .sort((a, b) => b.score - a.score);
        let rank = 1;
        const withRank: LeaderboardRow[] = sorted.map((r, i) => {
          if (i > 0 && sorted[i - 1].score !== r.score) rank = i + 1;
          return { ...r, rank };
        });
        if (!cancelled) setRows(withRank.slice(0, 10));
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [competitionId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        panel: {
          width: 300,
          flexShrink: 0,
          backgroundColor: theme.colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 16,
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: 12,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingHorizontal: 8,
          borderRadius: 8,
          marginBottom: 4,
          gap: 10,
        },
        rowHighlight: {
          backgroundColor: theme.colors.accentMuted,
        },
        rank: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '700',
          width: 20,
          color: theme.colors.textSecondary,
        },
        rankTop: {
          color: theme.colors.accent,
        },
        name: {
          flex: 1,
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.text,
        },
        score: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.textSecondary,
        },
        link: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          gap: 6,
        },
        linkText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: theme.colors.accent,
        },
        empty: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
          textAlign: 'center',
          paddingVertical: 16,
        },
      }),
    [theme]
  );

  return (
    <View style={styles.panel}>
      <Text style={styles.title} numberOfLines={1}>{competitionName}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={theme.colors.accent} style={{ marginVertical: 24 }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No standings yet</Text>
      ) : (
        <>
          {rows.map((r) => (
            <View key={r.user_id} style={[styles.row, r.user_id === userId && styles.rowHighlight]}>
              <Text style={[styles.rank, r.rank <= 3 && styles.rankTop]}>{r.rank}</Text>
              <Text style={styles.name} numberOfLines={1}>{r.display_name || '—'}</Text>
              <Text style={styles.score}>{r.score}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={styles.link}
            onPress={() => router.push({ pathname: '/(app)/leaderboard', params: { competitionId } })}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>Full leaderboard</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}
