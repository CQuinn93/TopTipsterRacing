import { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Alert } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { lightTheme } from '@/constants/theme';
import { clearAvailableRacesCache } from '@/lib/availableRacesCache';
import { clearSelectionsBulkCache } from '@/lib/selectionsBulkCache';
import { getCompetitionDisplayStatus } from '@/lib/appUtils';

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
  const theme = useTheme();
  const { userId } = useAuth();
  const [list, setList] = useState<UserCompetition[]>([]);
  const [pendingList, setPendingList] = useState<PendingCompetition[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [newlyApprovedNames, setNewlyApprovedNames] = useState<string[]>([]);
  const [compFilter, setCompFilter] = useState<'live' | 'upcoming' | 'complete'>('live');
  const pendingListRef = useRef<PendingCompetition[]>([]);

  const listFiltered = useMemo(
    () => list.filter((c) => c.status.toLowerCase() === compFilter),
    [list, compFilter]
  );

  useEffect(() => {
    pendingListRef.current = pendingList;
  }, [pendingList]);

  const load = async () => {
    if (!userId) return;
    const prevPendingIds = new Set(pendingListRef.current.map((c) => c.competition_id));
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
        setNewlyApprovedNames([]);
      } else {
        const compIds = (participantsRes.data as { competition_id: string }[]).map((p) => p.competition_id);
        const displayNameByComp = new Map(
          (participantsRes.data as { competition_id: string; display_name: string }[]).map((p) => [p.competition_id, p.display_name])
        );
        const { data: comps, error: compsError } = await supabase
          .from('competitions')
          .select('id, name, festival_start_date, festival_end_date')
          .in('id', compIds);
        if (compsError) throw compsError;
        const joined: UserCompetition[] = (comps ?? []).map((c) => {
            const displayStatus = getCompetitionDisplayStatus(c.festival_start_date, c.festival_end_date);
            const statusLabel = displayStatus === 'upcoming' ? 'Upcoming' : displayStatus === 'live' ? 'Live' : 'Complete';
            return {
              competition_id: c.id,
              name: c.name,
              status: statusLabel,
              festival_start_date: c.festival_start_date,
              festival_end_date: c.festival_end_date,
              display_name: displayNameByComp.get(c.id) ?? '',
              position: null,
            };
          });

        if (joined.length > 0 && compIds.length > 0) {
          // Use daily_selections only (no race-days fetch) to minimise egress. Position here is
          // approximate (odds-based); leaderboard uses full DB points (pos_points + sp_points).
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
              if (v?.oddsDecimal != null) sum += Math.round(v.oddsDecimal * 10);
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
        const newlyApproved = joined.filter((c) => prevPendingIds.has(c.competition_id));
        setNewlyApprovedNames(newlyApproved.length > 0 ? newlyApproved.map((c) => c.name) : []);
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

  useEffect(() => {
    if (newlyApprovedNames.length === 0 || !userId) return;
    const message =
      newlyApprovedNames.length === 1
        ? `${newlyApprovedNames[0]} entry has been approved.`
        : `${newlyApprovedNames.join(', ')} entries have been approved.`;
    Alert.alert('Approved', message, [
      {
        text: 'OK',
        onPress: () => {
          setNewlyApprovedNames([]);
          clearAvailableRacesCache(userId);
          clearSelectionsBulkCache(userId);
        },
      },
    ]);
  }, [newlyApprovedNames, userId]);

  const styles = useMemo(() => {
    const isLight = theme.colors.background === lightTheme.colors.background;
    const cardBorder = isLight ? theme.colors.white : theme.colors.border;
    const cardBorderWidth = isLight ? 2 : 1;
    return StyleSheet.create({
      container: { flex: 1, backgroundColor: theme.colors.background },
      content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
      title: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 20,
        color: theme.colors.text,
        marginBottom: theme.spacing.xs,
      },
      subtitle: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.sm,
      },
      primaryButton: {
        backgroundColor: theme.colors.accent,
        borderRadius: theme.radius.sm,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        alignItems: 'center',
        marginBottom: theme.spacing.lg,
      },
      primaryButtonText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 14,
        color: theme.colors.background === '#fafafa' ? theme.colors.black : theme.colors.white,
        fontWeight: '600',
      },
      sectionTitle: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 15,
        color: theme.colors.accent,
        marginTop: theme.spacing.md,
        marginBottom: theme.spacing.xs,
      },
      sectionSubtitle: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 11,
        color: theme.colors.textMuted,
        marginBottom: theme.spacing.xs,
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
      emptyMessage: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.textMuted,
        textAlign: 'center',
        marginTop: theme.spacing.sm,
      },
      card: {
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        marginBottom: theme.spacing.md,
        borderWidth: cardBorderWidth,
        borderColor: cardBorder,
      },
      cardTitle: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 16,
        color: theme.colors.text,
      },
      cardMeta: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: theme.spacing.xs },
      cardFooter: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.sm, flexWrap: 'wrap' },
      cardStatus: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.accent },
      cardPosition: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textSecondary },
      tapHint: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 12,
        color: theme.colors.textMuted,
        marginTop: theme.spacing.sm,
      },
      compTabsRow: {
        flexDirection: 'row',
        width: '100%',
        marginBottom: theme.spacing.sm,
        gap: theme.spacing.xs,
      },
      compTab: {
        flex: 1,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.sm,
        backgroundColor: theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
      },
      compTabActive: {
        backgroundColor: theme.colors.accent,
      },
      compTabText: {
        fontFamily: theme.fontFamily.regular,
        fontSize: 13,
        color: theme.colors.textSecondary,
      },
      compTabTextActive: {
        color: theme.colors.white,
        fontWeight: '600',
      },
    });
  }, [theme]);

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

      {list.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Competitions</Text>
          <View style={styles.compTabsRow}>
            {(['complete', 'live', 'upcoming'] as const).map((tab) => {
              const isActive = compFilter === tab;
              const label = tab === 'complete' ? 'Complete' : tab === 'live' ? 'Live' : 'Upcoming';
              return (
                <TouchableOpacity
                  key={tab}
                  style={[styles.compTab, isActive && styles.compTabActive]}
                  onPress={() => setCompFilter(tab)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.compTabText, isActive && styles.compTabTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {list.length === 0 && pendingList.length === 0 ? (
        <Text style={styles.emptyMessage}>You're not part of any competitions yet. Press the button below to enter one.</Text>
      ) : list.length === 0 ? null : (
        listFiltered.map((c) => (
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

