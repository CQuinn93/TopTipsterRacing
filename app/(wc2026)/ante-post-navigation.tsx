import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { IconSymbol } from '@/features/wc2026/components/IconSymbol';
import { DesignColors } from '@/features/wc2026/constants/design-colors';
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
import { wcHref } from '@/features/wc2026/utils/href';

interface StageStatus {
  id: string;
  name: string;
  route: string;
  isLocked: boolean;
  isComplete: boolean;
  completedCount?: number;
  total?: number;
}

export default function AntePostNavigationScreen() {
  const insets = useSafeAreaInsets();
  const [stages, setStages] = useState<StageStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStageStatuses();
  }, []);

  const loadStageStatuses = async () => {
    // Set a maximum timeout to ensure loading always stops
    const timeoutId = setTimeout(() => {
      console.warn('loadStageStatuses took too long, forcing loading to stop');
      setLoading(false);
    }, 10000); // 10 second max timeout

    try {
      setLoading(true);
      
      // First check if selections are globally locked
      const isGloballyLocked = await getAntePostLockedStatus().catch(() => false);
      
      // Load predictions from AsyncStorage (these are fast and shouldn't fail)
      const [
        groupPredictions,
        r32Predictions,
        r16Predictions,
        qfPredictions,
        sfPredictions,
        bronzeFinalPredictions,
        finalPredictions
      ] = await Promise.all([
        getGroupPredictions().catch(() => ({})),
        getR32Predictions().catch(() => ({})),
        getR16Predictions().catch(() => ({})),
        getQFPredictions().catch(() => ({})),
        getSFPredictions().catch(() => ({})),
        getBronzeFinalPredictions().catch(() => ({})),
        getFinalPredictions().catch(() => ({})),
      ]);

      // Load fixtures separately with timeout/error handling
      // Group stage has 72 matches (12 groups * 6 matches per group)
      let allFixtures: any[] = [];
      try {
        allFixtures = await Promise.race([
          getFixtures(),
          new Promise<any[]>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          )
        ]);
      } catch (fixturesError) {
        console.error('Error loading fixtures (using fallback):', fixturesError);
        // Use fallback: Group stage has 72 matches
        allFixtures = Array(72).fill(null).map((_, i) => ({ 
          id: `fallback-${i}`, 
          group: { group_name: String.fromCharCode(65 + Math.floor(i / 6)) } 
        }));
      }

      const groupMatches = allFixtures.filter(f => f.group !== null);
      const groupCompleted = Object.keys(groupPredictions).length;
      const groupTotal = groupMatches.length;
      const groupIsComplete = groupCompleted === groupTotal && groupTotal > 0;

      const r32Bracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}round_of_32_bracket`);
      const r32BracketData = r32Bracket ? JSON.parse(r32Bracket) : [];
      const r32Completed = Object.keys(r32Predictions).length;
      const r32Total = r32BracketData.length;
      const r32IsComplete = r32Completed === r32Total && r32Total > 0;
      const r32IsLocked = !groupIsComplete;

      const r16Bracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}round_of_16_bracket`);
      const r16BracketData = r16Bracket ? JSON.parse(r16Bracket) : [];
      const r16Completed = Object.keys(r16Predictions).length;
      const r16Total = r16BracketData.length;
      const r16IsComplete = r16Completed === r16Total && r16Total > 0;
      const r16IsLocked = !r32IsComplete;

      const qfBracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}quarter_finals_bracket`);
      const qfBracketData = qfBracket ? JSON.parse(qfBracket) : [];
      const qfCompleted = Object.keys(qfPredictions).length;
      const qfTotal = qfBracketData.length;
      const qfIsComplete = qfCompleted === qfTotal && qfTotal > 0;
      const qfIsLocked = !r16IsComplete;

      const sfBracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}semi_finals_bracket`);
      const sfBracketData = sfBracket ? JSON.parse(sfBracket) : [];
      const sfCompleted = Object.keys(sfPredictions).length;
      const sfTotal = sfBracketData.length;
      const sfIsComplete = sfCompleted === sfTotal && sfTotal > 0;
      const sfIsLocked = !qfIsComplete;

      const bronzeBracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}bronze_final_bracket`);
      const bronzeBracketData = bronzeBracket ? JSON.parse(bronzeBracket) : [];
      const bronzeCompleted = Object.keys(bronzeFinalPredictions).length;
      const bronzeTotal = bronzeBracketData.length;
      const bronzeIsComplete = bronzeCompleted === bronzeTotal && bronzeTotal > 0;
      const bronzeIsLocked = !sfIsComplete;

      const finalBracket = await AsyncStorage.getItem(`${WC2026_STORAGE_PREFIX}final_bracket`);
      const finalBracketData = finalBracket ? JSON.parse(finalBracket) : [];
      const finalCompleted = Object.keys(finalPredictions).length;
      const finalTotal = finalBracketData.length;
      const finalIsComplete = finalCompleted === finalTotal && finalTotal > 0;
      const finalIsLocked = !bronzeIsComplete;

      // If globally locked, all stages are locked (view-only)
      const globalLock = isGloballyLocked;

      setStages([
        {
          id: 'group',
          name: 'Group Stage',
          route: '/(wc2026)/ante-post-selections',
          isLocked: globalLock || false,
          isComplete: groupIsComplete,
          completedCount: groupCompleted,
          total: groupTotal,
        },
        {
          id: 'r32',
          name: 'Round of 32',
          route: '/(wc2026)/round-of-32-predictions',
          isLocked: globalLock || r32IsLocked,
          isComplete: r32IsComplete,
          completedCount: r32Completed,
          total: r32Total,
        },
        {
          id: 'r16',
          name: 'Round of 16',
          route: '/(wc2026)/round-of-16-predictions',
          isLocked: globalLock || r16IsLocked,
          isComplete: r16IsComplete,
          completedCount: r16Completed,
          total: r16Total,
        },
        {
          id: 'qf',
          name: 'Quarter Finals',
          route: '/(wc2026)/quarter-finals-predictions',
          isLocked: globalLock || qfIsLocked,
          isComplete: qfIsComplete,
          completedCount: qfCompleted,
          total: qfTotal,
        },
        {
          id: 'sf',
          name: 'Semi Finals',
          route: '/(wc2026)/semi-finals-predictions',
          isLocked: globalLock || sfIsLocked,
          isComplete: sfIsComplete,
          completedCount: sfCompleted,
          total: sfTotal,
        },
        {
          id: 'bronze',
          name: '3rd Place Final',
          route: '/(wc2026)/bronze-final-predictions',
          isLocked: globalLock || bronzeIsLocked,
          isComplete: bronzeIsComplete,
          completedCount: bronzeCompleted,
          total: bronzeTotal,
        },
        {
          id: 'final',
          name: 'Final',
          route: '/(wc2026)/final-predictions',
          isLocked: globalLock || finalIsLocked,
          isComplete: finalIsComplete,
          completedCount: finalCompleted,
          total: finalTotal,
        },
      ]);
    } catch (error) {
      console.error('Error loading stage statuses:', error);
      // Set default empty stages if there's an error
      setStages([]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleStagePress = (stage: StageStatus) => {
    // Allow navigation even when locked - users can view their predictions
    router.push(wcHref(stage.route));
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace(wcHref('/(wc2026)/(tabs)'))}
          >
            <IconSymbol name="chevron.left" size={24} color={DesignColors.text} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Ante Post</Text>
            <Text style={styles.headerSubtitle}>Navigation</Text>
          </View>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={DesignColors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace(wcHref('/(wc2026)/(tabs)'))}
        >
          <IconSymbol name="chevron.left" size={24} color={DesignColors.text} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Ante Post</Text>
          <Text style={styles.headerSubtitle}>Navigation</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.description}>
          {stages.length > 0 && stages.some(s => s.isLocked && s.isComplete) 
            ? 'Your predictions are locked. Select a stage to view your selections.'
            : 'Select a stage to make or continue your predictions. Complete each stage in order to unlock the next.'}
        </Text>

        {stages.map((stage) => (
          <TouchableOpacity
            key={stage.id}
            style={[
              styles.stageCard,
              stage.isLocked && styles.stageCardLocked,
              stage.isComplete && styles.stageCardComplete,
            ]}
            onPress={() => handleStagePress(stage)}
          >
            <View style={styles.stageContent}>
              <View style={styles.stageLeft}>
                <Text style={styles.stageName}>{stage.name}</Text>
                {!stage.isComplete && !stage.isLocked && stage.completedCount !== undefined && stage.total !== undefined && (
                  <Text style={styles.stageProgress}>
                    {stage.completedCount} of {stage.total} matches completed
                  </Text>
                )}
              </View>
              <View style={styles.stageRight}>
                {stage.isLocked ? (
                  <IconSymbol name="lock.fill" size={24} color={DesignColors.text} style={styles.stageIcon} />
                ) : stage.isComplete ? (
                  <IconSymbol name="checkmark.circle.fill" size={24} color={DesignColors.primary} style={styles.stageIcon} />
                ) : stage.completedCount !== undefined && stage.completedCount > 0 ? (
                  <Text style={styles.stageCount}>{stage.completedCount}/{stage.total}</Text>
                ) : null}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: DesignColors.surface,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 80,
  },
  backButtonText: {
    color: DesignColors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    paddingHorizontal: 80,
  },
  headerTitle: {
    color: DesignColors.text,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Ethnocentric',
    textAlign: 'center',
    marginTop: 50,
  },
  headerSubtitle: {
    color: DesignColors.text,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.7,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: DesignColors.text,
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  description: {
    color: DesignColors.text,
    fontSize: 14,
    marginBottom: 24,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: 20,
  },
  stageCard: {
    backgroundColor: DesignColors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stageCardLocked: {
    opacity: 0.5,
    borderColor: 'rgba(71, 74, 74, 0.3)',
  },
  stageCardComplete: {
    borderColor: DesignColors.primary,
  },
  stageContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stageLeft: {
    flex: 1,
  },
  stageName: {
    color: DesignColors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  stageProgress: {
    color: DesignColors.text,
    fontSize: 12,
    opacity: 0.7,
  },
  stageRight: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  stageIcon: {
    opacity: 0.7,
  },
  stageCount: {
    color: DesignColors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
