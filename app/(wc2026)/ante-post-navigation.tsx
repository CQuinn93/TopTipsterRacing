import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import { WC2026_STORAGE_PREFIX } from '@/features/wc2026/constants/storage-keys';
import {
  getGroupPredictions,
  getR32Predictions,
  getR16Predictions,
  getQFPredictions,
  getSFPredictions,
  getBronzeFinalPredictions,
  getFinalPredictions,
  getAntePostLockedStatus,
} from '@/features/wc2026/services/async-predictions';
import { getFixtures } from '@/features/wc2026/services/fixtures';
import { hydrateKnockoutBracketsFromStoredPicks } from '@/features/wc2026/services/knockout-bracket-hydration';
import { countCompleteAntePostKnockoutPicks } from '@/features/wc2026/services/predictions';
import { getKnockoutAnteEnabled } from '@/features/wc2026/services/tournament-gates';
import { wcHref } from '@/features/wc2026/utils/href';
import { goBackFromAntePostHub } from '@/features/wc2026/utils/ante-post-nav';
import { supabase } from '@/lib/supabase';

interface StageStatus {
  id: string;
  name: string;
  route: string;
  /** User tapped “submit all” on Final — picks are read-only (AsyncStorage `ante_post_is_locked`). */
  userCommittedLocked: boolean;
  /** Previous knockout stage is not finished yet (sequential flow). Not the same as committed lock. */
  waitingOnPriorKnockoutStage: boolean;
  /** Server / product gate: knockout ante post not open. */
  knockoutAnteDisabled: boolean;
  isComplete: boolean;
  completedCount?: number;
  total?: number;
}

async function stageKnockoutComplete(
  userId: string | null,
  localCompleted: number,
  expectedTotal: number,
  minMatch: number,
  maxMatch: number
): Promise<boolean> {
  if (expectedTotal > 0 && localCompleted >= expectedTotal) return true;
  if (!userId) return false;
  try {
    const serverCount = await countCompleteAntePostKnockoutPicks(userId, minMatch, maxMatch);
    return serverCount >= expectedTotal;
  } catch {
    return false;
  }
}

export default function AntePostNavigationScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [stages, setStages] = useState<StageStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStageStatuses = useCallback(async () => {
    const timeoutId = setTimeout(() => {
      console.warn('loadStageStatuses took too long, forcing loading to stop');
      setLoading(false);
    }, 10000);

    try {
      setLoading(true);

      await hydrateKnockoutBracketsFromStoredPicks().catch(() => false);

      const isGloballyLocked = await getAntePostLockedStatus().catch(() => false);

      let userId: string | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id ?? null;
      } catch {
        userId = null;
      }

      const [
        groupPredictions,
        r32Predictions,
        r16Predictions,
        qfPredictions,
        sfPredictions,
        bronzeFinalPredictions,
        finalPredictions,
        knockoutAnteServer,
      ] = await Promise.all([
        getGroupPredictions().catch(() => ({})),
        getR32Predictions().catch(() => ({})),
        getR16Predictions().catch(() => ({})),
        getQFPredictions().catch(() => ({})),
        getSFPredictions().catch(() => ({})),
        getBronzeFinalPredictions().catch(() => ({})),
        getFinalPredictions().catch(() => ({})),
        getKnockoutAnteEnabled().catch(() => false),
      ]);

      let allFixtures: unknown[] = [];
      try {
        allFixtures = await Promise.race([
          getFixtures(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
        ]);
      } catch (fixturesError) {
        console.error('Error loading fixtures (using fallback):', fixturesError);
        allFixtures = Array(72)
          .fill(null)
          .map((_, i) => ({
            id: `fallback-${i}`,
            group: { group_name: String.fromCharCode(65 + Math.floor(i / 6)) },
          }));
      }

      const groupMatches = (allFixtures as { group?: { group_name?: string } | null }[]).filter((f) => f.group != null);
      const groupCompleted = Object.keys(groupPredictions).length;
      const groupTotal = groupMatches.length;
      const groupIsComplete = groupCompleted === groupTotal && groupTotal > 0;

      const r32Bracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}round_of_32_bracket`);
      const r32BracketData = r32Bracket ? JSON.parse(r32Bracket) : [];
      const r32Completed = Object.keys(r32Predictions).length;
      const r32Total = r32BracketData.length > 0 ? r32BracketData.length : 16;
      const r32IsComplete = await stageKnockoutComplete(userId, r32Completed, r32Total, 73, 88);

      const r16Bracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}round_of_16_bracket`);
      const r16BracketData = r16Bracket ? JSON.parse(r16Bracket) : [];
      const r16Completed = Object.keys(r16Predictions).length;
      const r16Total = r16BracketData.length > 0 ? r16BracketData.length : 8;
      const r16IsComplete = await stageKnockoutComplete(userId, r16Completed, r16Total, 89, 96);

      const qfBracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}quarter_finals_bracket`);
      const qfBracketData = qfBracket ? JSON.parse(qfBracket) : [];
      const qfCompleted = Object.keys(qfPredictions).length;
      const qfTotal = qfBracketData.length > 0 ? qfBracketData.length : 4;
      const qfIsComplete = await stageKnockoutComplete(userId, qfCompleted, qfTotal, 97, 100);

      const sfBracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}semi_finals_bracket`);
      const sfBracketData = sfBracket ? JSON.parse(sfBracket) : [];
      const sfCompleted = Object.keys(sfPredictions).length;
      const sfTotal = sfBracketData.length > 0 ? sfBracketData.length : 2;
      const sfIsComplete = await stageKnockoutComplete(userId, sfCompleted, sfTotal, 101, 102);

      const bronzeBracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}bronze_final_bracket`);
      const bronzeBracketData = bronzeBracket ? JSON.parse(bronzeBracket) : [];
      let bronzeCompleted = Object.keys(bronzeFinalPredictions).length;
      let bronzeTotal = bronzeBracketData.length;
      if (bronzeTotal === 0) {
        bronzeTotal = 1;
      }
      if (bronzeCompleted === 0) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const uid = session?.user?.id;
          if (uid) {
            const { getUserPredictionsByMatchNumber } = await import('@/features/wc2026/services/predictions');
            const rows = await getUserPredictionsByMatchNumber(uid, 103);
            const ante = rows.find((p) => p.prediction_type === 'ante_post');
            if (
              ante &&
              ante.home_score != null &&
              ante.away_score != null &&
              (ante.home_score !== ante.away_score || ante.predicted_winner_id)
            ) {
              bronzeCompleted = 1;
            }
          }
        } catch {
          /* ignore */
        }
      }
      const bronzeIsComplete = bronzeCompleted >= bronzeTotal && bronzeTotal > 0;

      const finalBracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}final_bracket`);
      const finalBracketData = finalBracket ? JSON.parse(finalBracket) : [];
      const finalCompleted = Object.keys(finalPredictions).length;
      const finalTotal = finalBracketData.length > 0 ? finalBracketData.length : 1;
      const finalIsComplete = await stageKnockoutComplete(userId, finalCompleted, finalTotal, 104, 104);

      const r32IsWaiting = !groupIsComplete || !knockoutAnteServer;
      const r16IsWaiting = !r32IsComplete || !knockoutAnteServer;
      const qfIsWaiting = !r16IsComplete || !knockoutAnteServer;
      const sfIsWaiting = !qfIsComplete || !knockoutAnteServer;
      const bronzeIsWaiting = !sfIsComplete || !knockoutAnteServer;
      const finalIsWaiting = !bronzeIsComplete || !knockoutAnteServer;

      const userCommittedLocked = isGloballyLocked;

      setStages([
        {
          id: 'group',
          name: 'Group stage',
          route: '/(wc2026)/ante-post-selections',
          userCommittedLocked,
          waitingOnPriorKnockoutStage: false,
          knockoutAnteDisabled: false,
          isComplete: groupIsComplete,
          completedCount: groupCompleted,
          total: groupTotal,
        },
        {
          id: 'r32',
          name: 'Round of 32',
          route: '/(wc2026)/round-of-32-predictions',
          userCommittedLocked,
          waitingOnPriorKnockoutStage: r32IsWaiting,
          knockoutAnteDisabled: !knockoutAnteServer,
          isComplete: r32IsComplete,
          completedCount: r32Completed,
          total: r32Total,
        },
        {
          id: 'r16',
          name: 'Round of 16',
          route: '/(wc2026)/round-of-16-predictions',
          userCommittedLocked,
          waitingOnPriorKnockoutStage: r16IsWaiting,
          knockoutAnteDisabled: !knockoutAnteServer,
          isComplete: r16IsComplete,
          completedCount: r16Completed,
          total: r16Total,
        },
        {
          id: 'qf',
          name: 'Quarter-finals',
          route: '/(wc2026)/quarter-finals-predictions',
          userCommittedLocked,
          waitingOnPriorKnockoutStage: qfIsWaiting,
          knockoutAnteDisabled: !knockoutAnteServer,
          isComplete: qfIsComplete,
          completedCount: qfCompleted,
          total: qfTotal,
        },
        {
          id: 'sf',
          name: 'Semi-finals',
          route: '/(wc2026)/semi-finals-predictions',
          userCommittedLocked,
          waitingOnPriorKnockoutStage: sfIsWaiting,
          knockoutAnteDisabled: !knockoutAnteServer,
          isComplete: sfIsComplete,
          completedCount: sfCompleted,
          total: sfTotal,
        },
        {
          id: 'bronze',
          name: '3rd place final',
          route: '/(wc2026)/bronze-final-predictions',
          userCommittedLocked,
          waitingOnPriorKnockoutStage: bronzeIsWaiting,
          knockoutAnteDisabled: !knockoutAnteServer,
          isComplete: bronzeIsComplete,
          completedCount: bronzeCompleted,
          total: bronzeTotal,
        },
        {
          id: 'final',
          name: 'Final',
          route: '/(wc2026)/final-predictions',
          userCommittedLocked,
          waitingOnPriorKnockoutStage: finalIsWaiting,
          knockoutAnteDisabled: !knockoutAnteServer,
          isComplete: finalIsComplete,
          completedCount: finalCompleted,
          total: finalTotal,
        },
      ]);
    } catch (error) {
      console.error('Error loading stage statuses:', error);
      setStages([]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadStageStatuses();
    }, [loadStageStatuses])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadStageStatuses();
    } finally {
      setRefreshing(false);
    }
  }, [loadStageStatuses]);

  const handleStagePress = (stage: StageStatus) => {
    router.push(wcHref(stage.route));
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        backText: { fontFamily: theme.fontFamily.regular, color: theme.colors.accent, fontSize: 16 },
        headerTitleCol: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.xs,
        },
        brandTitle: {
          fontFamily: theme.fontFamily.swish,
          fontSize: 20,
          lineHeight: 26,
          color: theme.colors.text,
          textAlign: 'center',
          letterSpacing: 0.5,
        },
        brandSport: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 10,
          fontWeight: '800',
          color: theme.colors.accent,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          marginTop: 2,
        },
        brandHint: {
          marginTop: 4,
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        headerSpacer: { width: 72 },
        scroll: { flex: 1 },
        scrollContent: {
          padding: theme.spacing.md,
          paddingBottom: insets.bottom + theme.spacing.xl,
          maxWidth: 720,
          width: '100%',
          alignSelf: 'center',
        },
        description: {
          fontFamily: theme.fontFamily.light,
          fontSize: 14,
          lineHeight: 22,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.lg,
          textAlign: 'center',
        },
        stageCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        stageCardLocked: {
          opacity: 0.55,
        },
        stageCardComplete: {
          borderWidth: 2,
          borderColor: theme.colors.accent,
        },
        stageRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        stageLeft: { flex: 1, minWidth: 0 },
        stageName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: 4,
        },
        stageProgress: {
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        stageRight: {
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 56,
        },
        stageCount: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '700',
          color: theme.colors.accent,
        },
        centered: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing.lg,
        },
        loadingText: {
          marginTop: theme.spacing.md,
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.textSecondary,
        },
      }),
    [theme, insets.bottom]
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={goBackFromAntePostHub}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.brandTitle}>Top Tipster</Text>
          <Text style={styles.brandSport}>Football</Text>
          <Text style={styles.brandHint}>Ante post</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {loading && stages.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading stages…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.colors.accent} />
          }
        >
          <Text style={styles.description}>
            {stages.length > 0 && stages.some((s) => s.userCommittedLocked)
              ? 'Your ante post picks are locked in. Open a stage to review them (scores cannot be changed).'
              : 'Open each stage in order. Changing who advances in a round clears later rounds so your bracket stays consistent.'}
          </Text>

          {stages.map((stage) => (
            <TouchableOpacity
              key={stage.id}
              style={[
                styles.stageCard,
                stage.userCommittedLocked && !stage.isComplete && styles.stageCardLocked,
                stage.isComplete && !stage.userCommittedLocked && styles.stageCardComplete,
              ]}
              onPress={() => handleStagePress(stage)}
              activeOpacity={0.85}
            >
              <View style={styles.stageRow}>
                <View style={styles.stageLeft}>
                  <Text style={styles.stageName}>{stage.name}</Text>
                  {stage.userCommittedLocked ? (
                    <Text style={styles.stageProgress}>Locked in — view only</Text>
                  ) : stage.knockoutAnteDisabled && stage.id !== 'group' ? (
                    <Text style={styles.stageProgress}>Knockout ante post not open yet</Text>
                  ) : !stage.isComplete && stage.waitingOnPriorKnockoutStage ? (
                    <Text style={styles.stageProgress}>Finish the previous stage first</Text>
                  ) : !stage.isComplete &&
                    !stage.waitingOnPriorKnockoutStage &&
                    stage.completedCount !== undefined &&
                    stage.total !== undefined ? (
                    <Text style={styles.stageProgress}>
                      {stage.completedCount} of {stage.total} matches predicted
                    </Text>
                  ) : stage.isComplete ? (
                    <Text style={styles.stageProgress}>Complete</Text>
                  ) : null}
                </View>
                <View style={styles.stageRight}>
                  {stage.userCommittedLocked ? (
                    <Ionicons name="lock-closed-outline" size={22} color={theme.colors.accent} />
                  ) : stage.knockoutAnteDisabled && stage.id !== 'group' ? (
                    <Ionicons name="pause-circle-outline" size={24} color={theme.colors.textMuted} />
                  ) : stage.waitingOnPriorKnockoutStage && !stage.isComplete ? (
                    <Ionicons name="hourglass-outline" size={22} color={theme.colors.textMuted} />
                  ) : stage.isComplete ? (
                    <Ionicons name="checkmark-circle" size={24} color={theme.colors.accent} />
                  ) : stage.completedCount !== undefined && stage.completedCount > 0 ? (
                    <Text style={styles.stageCount}>
                      {stage.completedCount}/{stage.total}
                    </Text>
                  ) : (
                    <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
