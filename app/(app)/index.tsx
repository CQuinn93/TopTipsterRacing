import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { getOrCreateTabletCode } from '@/lib/tabletCode';
import { fetchAvailableRacesForUser, type AvailableRaceDay } from '@/lib/availableRacesForUser';
import type { Database } from '@/types/database';

type Participant = Database['public']['Tables']['competition_participants']['Row'];

export default function HomeScreen() {
  const { userId } = useAuth();
  const [participations, setParticipations] = useState<Participant[]>([]);
  const [availableRaces, setAvailableRaces] = useState<AvailableRaceDay[]>([]);
  const [tabletCode, setTabletCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      const { data: partData } = await supabase
        .from('competition_participants')
        .select('id, competition_id, display_name')
        .eq('user_id', userId);
      if (partData) setParticipations(partData);

      if (partData?.length) {
        const compIds = partData.map((p) => p.competition_id);
        const { data: comps } = await supabase.from('competitions').select('id, name').in('id', compIds);
        const compByName = new Map((comps ?? []).map((c) => [c.id, c.name]));
        const available = await fetchAvailableRacesForUser(supabase, userId, compIds, compByName);
        setAvailableRaces(available);
      } else {
        setAvailableRaces([]);
      }

      getOrCreateTabletCode(userId).then(setTabletCode).catch(() => setTabletCode(null));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [userId]);

  const hasJoinedAny = participations.length > 0;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.colors.accent} />}
      >
        <Text style={styles.title}>Cheltenham Top Tipster</Text>
        <Text style={styles.subtitle}>Make your daily picks and climb the leaderboard</Text>

        {!hasJoinedAny && (
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/(auth)/access-code')}>
            <Text style={styles.primaryButtonText}>Enter competition (access code)</Text>
          </TouchableOpacity>
        )}

        {/* Section 1: My available races */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My available races</Text>
          {availableRaces.length === 0 && hasJoinedAny && (
            <Text style={styles.cardMeta}>No races need your picks right now</Text>
          )}
          {availableRaces.length === 0 && !hasJoinedAny && (
            <Text style={styles.cardMeta}>Join a competition to make selections</Text>
          )}
          {availableRaces.map((item) => (
            <TouchableOpacity
              key={`${item.competitionId}-${item.raceDate}`}
              style={styles.card}
              onPress={() => router.push({ pathname: '/(app)/selections', params: { competitionId: item.competitionId, raceDate: item.raceDate } })}
            >
              <Text style={styles.cardTitle}>{item.competitionName}</Text>
              <Text style={styles.cardMeta}>
                {item.course} • {new Date(item.raceDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
              <Text style={styles.cardStatus}>{item.pendingCount} race{item.pendingCount !== 1 ? 's' : ''} to pick – tap to make selections</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Section 2: My Selections (tablet code) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Selections</Text>
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/(app)/selections')}
          >
            <Text style={styles.cardTitle}>My selections</Text>
            {tabletCode ? (
              <Text style={styles.cardCode}>Tablet code: {tabletCode}</Text>
            ) : refreshing ? null : (
              <Text style={styles.cardCode}>Tablet code: —</Text>
            )}
            <Text style={styles.cardMeta}>View or edit your picks for any competition</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Fixed footer: tablet code */}
      <View style={styles.tabletCodeFooter}>
        <Text style={styles.tabletCodeLabel}>
          Your Tablet code is "{tabletCode ?? '…'}"
        </Text>
        <TouchableOpacity onPress={() => router.push('/(app)/account')}>
          <Text style={styles.whatIsThis}>What is this?</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1 },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.lg },
  title: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 26,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
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
  section: { marginBottom: theme.spacing.xl },
  sectionTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 18,
    color: theme.colors.text,
  },
  cardCode: {
    fontFamily: theme.fontFamily.input,
    fontSize: 14,
    color: theme.colors.accent,
    marginTop: 4,
    letterSpacing: 2,
  },
  cardMeta: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  cardStatus: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.accent, marginTop: 4 },
  muted: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  secondaryButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryButtonText: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 16,
    color: theme.colors.text,
  },
  tabletCodeFooter: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
  },
  tabletCodeLabel: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  whatIsThis: {
    fontFamily: theme.fontFamily.regular,
    fontSize: 14,
    color: theme.colors.accent,
    textDecorationLine: 'underline',
  },
});
