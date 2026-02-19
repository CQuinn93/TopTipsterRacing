import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';

type UserCompetition = {
  competition_id: string;
  name: string;
  status: string;
  festival_start_date: string;
  festival_end_date: string;
  display_name: string;
  position: number | null; // 1-based rank in that competition, null if no scores yet
};

type PendingCompetition = {
  competition_id: string;
  name: string;
  festival_start_date: string;
  festival_end_date: string;
};

export default function MyCompetitionsScreen() {
  const { userId } = useAuth();
  const [list, setList] = useState<UserCompetition[]>([]);
  const [pendingList, setPendingList] = useState<PendingCompetition[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      const [participantsRes, pendingRes] = await Promise.all([
        supabase
          .from('competition_participants')
          .select('competition_id, display_name')
          .eq('user_id', userId),
        supabase
          .from('competition_join_requests')
          .select('competition_id')
          .eq('user_id', userId)
          .eq('status', 'pending'),
      ]);
      if (participantsRes.error) throw participantsRes.error;

      if (!participantsRes.data?.length) {
        setList([]);
      } else {
        const compIds = (participantsRes.data as { competition_id: string }[]).map((p) => p.competition_id);
        const displayNameByComp = new Map(
          (participantsRes.data as { competition_id: string; display_name: string }[]).map((p) => [p.competition_id, p.display_name])
        );
        const { data: comps, error: compsError } = await supabase
          .from('competitions')
          .select('id, name, status, festival_start_date, festival_end_date')
          .in('id', compIds);
        if (compsError) throw compsError;
        const joined: UserCompetition[] = (comps ?? []).map((c) => ({
          competition_id: c.id,
          name: c.name,
          status: c.status,
          festival_start_date: c.festival_start_date,
          festival_end_date: c.festival_end_date,
          display_name: displayNameByComp.get(c.id) ?? '',
          position: null,
        }));

        if (joined.length > 0 && compIds.length > 0) {
          const { data: allSelections } = await supabase
            .from('daily_selections')
            .select('competition_id, user_id, selections')
            .in('competition_id', compIds);
          const totalByCompUser: Record<string, Record<string, number>> = {};
          for (const compId of compIds) totalByCompUser[compId] = {};
          for (const row of allSelections ?? []) {
            const sel = row.selections as Record<string, { oddsDecimal?: number }> | null;
            if (!sel) continue;
            const compId = row.competition_id as string;
            const uid = row.user_id as string;
            let sum = 0;
            for (const v of Object.values(sel)) {
              if (v?.oddsDecimal) sum += Math.round(v.oddsDecimal * 10);
            }
            totalByCompUser[compId][uid] = (totalByCompUser[compId][uid] ?? 0) + sum;
          }
          for (const c of joined) {
            const byUser = totalByCompUser[c.competition_id] ?? {};
            const sorted = Object.entries(byUser).sort((a, b) => b[1] - a[1]);
            const idx = sorted.findIndex(([uid]) => uid === userId);
            c.position = idx >= 0 ? idx + 1 : null;
          }
        }
        setList(joined);
      }

      if (pendingRes.error || !pendingRes.data?.length) {
        setPendingList([]);
      } else {
        const compIds = [...new Set((pendingRes.data as { competition_id: string }[]).map((r) => r.competition_id))];
        const { data: comps } = await supabase
          .from('competitions')
          .select('id, name, festival_start_date, festival_end_date')
          .in('id', compIds);
        const compMap = new Map((comps ?? []).map((c) => [c.id, c]));
        const pending: PendingCompetition[] = compIds.map((id) => {
          const c = compMap.get(id);
          return {
            competition_id: id,
            name: c?.name ?? 'Competition',
            festival_start_date: c?.festival_start_date ?? '',
            festival_end_date: c?.festival_end_date ?? '',
          };
        });
        setPendingList(pending);
      }
    } catch {
      setList([]);
      setPendingList([]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [userId]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.colors.accent} />}
    >
      <Text style={styles.title}>My Competitions</Text>
      <Text style={styles.subtitle}>Tap a competition to view the leaderboard.</Text>

      <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(auth)/access-code')}>
        <Text style={styles.primaryButtonText}>Enter another competition (access code)</Text>
      </TouchableOpacity>

      {pendingList.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pending</Text>
          <Text style={styles.sectionSubtitle}>Waiting for admin approval. Pull down to refresh and see if you've been accepted.</Text>
          {pendingList.map((c) => (
            <View key={c.competition_id} style={[styles.card, styles.cardPending]}>
              <Text style={styles.cardTitle}>{c.name}</Text>
              <Text style={styles.cardMeta}>
                {c.festival_start_date ? new Date(c.festival_start_date).toLocaleDateString() : ''}
                {c.festival_end_date ? ` – ${new Date(c.festival_end_date).toLocaleDateString()}` : ''}
              </Text>
              <Text style={styles.pendingBadge}>Request pending</Text>
            </View>
          ))}
        </>
      )}

      {list.length > 0 && <Text style={styles.sectionTitle}>Your competitions</Text>}

      {list.length === 0 && pendingList.length === 0 ? (
        <Text style={styles.muted}>You haven't joined any competitions yet. Use an access code to join one.</Text>
      ) : list.length === 0 ? null : (
        list.map((c) => (
          <TouchableOpacity
            key={c.competition_id}
            style={styles.card}
            onPress={() => router.push({ pathname: '/(app)/leaderboard', params: { competitionId: c.competition_id } })}
            activeOpacity={0.8}
          >
            <Text style={styles.cardTitle}>{c.name}</Text>
            <Text style={styles.cardMeta}>
              {new Date(c.festival_start_date).toLocaleDateString()} – {new Date(c.festival_end_date).toLocaleDateString()}
            </Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardStatus}>{c.status}</Text>
              {c.position != null && (
                <Text style={styles.cardPosition}>Your position: {c.position}{c.position === 1 ? 'st' : c.position === 2 ? 'nd' : c.position === 3 ? 'rd' : 'th'}</Text>
              )}
            </View>
            <Text style={styles.tapHint}>Tap to open leaderboard</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  title: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 24,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  primaryButtonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.black,
    fontWeight: '600',
  },
  sectionTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    color: theme.colors.accent,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
  },
  sectionSubtitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },
  cardPending: {
    opacity: 0.9,
  },
  pendingBadge: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.xs,
    fontStyle: 'italic',
  },
  muted: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    color: theme.colors.text,
  },
  cardMeta: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginTop: 4, flexWrap: 'wrap' },
  cardStatus: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.accent },
  cardPosition: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textSecondary },
  tapHint: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
  },
});
