import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '@/contexts/ThemeContext';
import { WcKnockoutResultsHeader } from '@/features/wc2026/components/WcKnockoutResultsHeader';
import { useKnockoutPredictionsScreenStyles } from '@/features/wc2026/components/useKnockoutPredictionsScreenStyles';
import { WC2026_STORAGE_PREFIX } from '@/features/wc2026/constants/storage-keys';
import { CountryFlag } from '@/features/wc2026/components/CountryFlag';
import { KnockoutMatchScorePresets } from '@/features/wc2026/components/KnockoutMatchScorePresets';
import { hydrateKnockoutBracketsFromStoredPicks } from '@/features/wc2026/services/knockout-bracket-hydration';
import { runKnockoutPresetEdit, runKnockoutScoreEdit, runKnockoutWinnerPick } from '@/features/wc2026/utils/knockout-edit';
import { hasDownstreamKnockoutPredictions } from '@/features/wc2026/services/async-predictions';
import { type KnockoutMatch } from '@/features/wc2026/services/knockout-bracket';
import { supabase } from '@/lib/supabase';
import { wcHref, wcHrefWithParams } from '@/features/wc2026/utils/href';
import { showAntePostFilledHighlight } from '@/features/wc2026/utils/knockout-ui';

const ROUND_OF_32_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_bracket`;
const ROUND_OF_32_STANDINGS_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_standings`;
const ROUND_OF_32_ADVANCING_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_advancing`;
const ROUND_OF_32_KNOCKED_OUT_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_knocked_out`;

interface RouteParams {
  groupStandings?: string;
  advancingTeams?: string;
  bracket?: string; // JSON stringified KnockoutMatch[]
}

interface KnockoutPrediction {
  matchNumber: number;
  homeScore: string;
  awayScore: string;
  predictedWinnerId?: string | null;
}

export default function RoundOf32PredictionsScreen() {
  const theme = useTheme();
  const styles = useKnockoutPredictionsScreenStyles();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams() as RouteParams;
  const [bracket, setBracket] = useState<KnockoutMatch[]>([]);
  const [predictions, setPredictions] = useState<Record<number, KnockoutPrediction>>({});
  const [savedPredictions, setSavedPredictions] = useState<Record<number, { home_score: number | null; away_score: number | null }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [hasDownstreamPredictions, setHasDownstreamPredictions] = useState(false);
  const downstreamClearConfirmedRef = useRef(false);
  const [userId, setUserId] = useState<string | null>(null);
  const predictionsLoadedRef = useRef(false);
  const initializedRef = useRef(false);

  // Memoize loadExistingPredictions to prevent recreation on every render
  const loadExistingPredictions = useCallback(async (bracketMatches: KnockoutMatch[], currentUserId: string) => {
    if (!currentUserId || predictionsLoadedRef.current) return;
    
    predictionsLoadedRef.current = true;
    
    try {
      const { getUserPredictionsByMatchNumber } = await import('@/features/wc2026/services/predictions');
      const existingPreds: Record<number, { home_score: number | null; away_score: number | null }> = {};
      const newPredictions: Record<number, KnockoutPrediction> = {};
      
      await Promise.all(
        bracketMatches.map(async (match) => {
          const preds = await getUserPredictionsByMatchNumber(currentUserId, match.matchNumber);
          const antePostPred = preds.find((p) => p.prediction_type === 'ante_post');
          if (antePostPred) {
            existingPreds[match.matchNumber] = {
              home_score: antePostPred.home_score,
              away_score: antePostPred.away_score,
            };
            
            newPredictions[match.matchNumber] = {
              matchNumber: match.matchNumber,
              homeScore: antePostPred.home_score?.toString() ?? '',
              awayScore: antePostPred.away_score?.toString() ?? '',
              predictedWinnerId: antePostPred.predicted_winner_id ?? null,
            };
          }
        })
      );
      
      // Batch state updates to prevent multiple re-renders
      setPredictions((prev) => ({ ...prev, ...newPredictions }));
      setSavedPredictions(existingPreds);
    } catch (error) {
      console.error('Error loading existing predictions:', error);
      predictionsLoadedRef.current = false; // Reset on error so we can retry
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const [h, locked] = await Promise.all([
          hasDownstreamKnockoutPredictions('r32'),
          import('@/features/wc2026/services/async-predictions').then((m) => m.getAntePostLockedStatus()),
        ]);
        if (!cancelled) {
          downstreamClearConfirmedRef.current = false;
          setHasDownstreamPredictions(h);
          setIsLocked(locked);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  useEffect(() => {
    // Prevent multiple initializations
    if (initializedRef.current) return;
    
    const init = async () => {
      initializedRef.current = true;
      
      // Get user from session (avoid duplicate getUser() call)
      let currentUser: string | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          currentUser = session.user.id;
          setUserId(session.user.id);
        }
      } catch (error) {
        console.error('Error getting user:', error);
      }

      // Parse bracket from params or AsyncStorage
      try {
        let bracketData = params.bracket;
        
        // If no bracket in params, try AsyncStorage
        if (!bracketData) {
          const storedBracket = await AsyncStorage.getItem(ROUND_OF_32_BRACKET_KEY);
          if (storedBracket) {
            bracketData = storedBracket;
          } else {
            await hydrateKnockoutBracketsFromStoredPicks();
            bracketData = (await AsyncStorage.getItem(ROUND_OF_32_BRACKET_KEY)) ?? undefined;
          }
        }
        
        if (bracketData) {
          const parsedBracket = JSON.parse(bracketData);
          setBracket(parsedBracket);
          
          // Try loading from AsyncStorage first (saved predictions)
          const { getR32Predictions, getAntePostLockedStatus } = await import('@/features/wc2026/services/async-predictions');
          const savedR32Predictions = await getR32Predictions();
          const loadedPredictions: Record<number, KnockoutPrediction> = {};
          const loadedSaved: Record<number, { home_score: number | null; away_score: number | null }> = {};
          
          if (Object.keys(savedR32Predictions).length > 0) {
            // Load from AsyncStorage
            Object.entries(savedR32Predictions).forEach(([matchNumStr, pred]) => {
              const matchNum = parseInt(matchNumStr, 10);
              loadedPredictions[matchNum] = {
                matchNumber: matchNum,
                homeScore: pred.home_score?.toString() ?? '',
                awayScore: pred.away_score?.toString() ?? '',
                predictedWinnerId: pred.predicted_winner_id ?? null,
              };
              loadedSaved[matchNum] = {
                home_score: pred.home_score,
                away_score: pred.away_score,
              };
            });
            
            setPredictions(loadedPredictions);
            setSavedPredictions(loadedSaved);
          }
          
          // Check locked status
          const locked = await getAntePostLockedStatus();
          setIsLocked(locked);
          
          // If no AsyncStorage data, try database (works for both locked and unlocked)
          if (currentUser && Object.keys(loadedPredictions).length === 0) {
            await loadExistingPredictions(parsedBracket, currentUser);
          }
        } else {
          Alert.alert('Error', 'No bracket data found. Please confirm your group predictions again.');
          router.replace(wcHref('/(wc2026)/ante-post-navigation'));
          return;
        }
      } catch (error) {
        console.error('Error parsing bracket:', error);
        Alert.alert('Error', 'Failed to load Round of 32 bracket');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [params.bracket, loadExistingPredictions]);

  const handleScoreChange = (matchNumber: number, team: 'home' | 'away', value: string, homeTeamId: string, awayTeamId: string) => {
    if (isLocked) return;
    const match = bracket.find((m) => m.matchNumber === matchNumber);
    if (!match) return;
    runKnockoutScoreEdit({
      anchor: 'r32',
      match,
      matchNumber,
      team,
      value,
      homeTeamId,
      awayTeamId,
      predictions,
      savedPredictions,
      selectionsGloballyLocked: isLocked,
      userId,
      onDownstreamCleared: () => setHasDownstreamPredictions(false),
      applyEdit: (next) => setPredictions((prev) => ({ ...prev, [matchNumber]: next })),
    });
  };

  const handleWinnerSelection = (matchNumber: number, winnerId: string) => {
    if (isLocked) return;
    const match = bracket.find((m) => m.matchNumber === matchNumber);
    if (!match) return;
    runKnockoutWinnerPick({
      anchor: 'r32',
      match,
      matchNumber,
      winnerId,
      predictions,
      savedPredictions,
      selectionsGloballyLocked: isLocked,
      userId,
      onDownstreamCleared: () => setHasDownstreamPredictions(false),
      applyEdit: (next) => setPredictions((prev) => ({ ...prev, [matchNumber]: next })),
    });
  };

  const handleSave = async () => {
    if (isLocked) return; // Prevent saving when locked
    setSaving(true);
    try {
      // Import async predictions service
      const { saveR32Predictions } = await import('@/features/wc2026/services/async-predictions');
      
      // Convert predictions to AsyncStorage format
      const r32Predictions: Record<number, { match_number: number; home_score: number; away_score: number; predicted_winner_id: string | null }> = {};
      
      bracket.forEach((match) => {
        const pred = predictions[match.matchNumber];
        if (pred && pred.homeScore.trim() && pred.awayScore.trim()) {
          const homeScore = parseInt(pred.homeScore, 10);
          const awayScore = parseInt(pred.awayScore, 10);
          
          if (isNaN(homeScore) || isNaN(awayScore)) return;
          
          // Determine winner if not set
          let predictedWinnerId = pred.predictedWinnerId;
          if (!predictedWinnerId) {
            if (homeScore > awayScore) {
              predictedWinnerId = match.homeTeam.id;
            } else if (awayScore > homeScore) {
              predictedWinnerId = match.awayTeam.id;
            }
          }
          
          r32Predictions[match.matchNumber] = {
            match_number: match.matchNumber,
            home_score: homeScore,
            away_score: awayScore,
            predicted_winner_id: predictedWinnerId ?? null,
          };
        }
      });

      // Save to AsyncStorage
      await saveR32Predictions(r32Predictions);
      
      // Update saved predictions state
      const newSaved: Record<number, { home_score: number | null; away_score: number | null }> = {};
      Object.entries(r32Predictions).forEach(([matchNumStr, pred]) => {
        newSaved[parseInt(matchNumStr, 10)] = {
          home_score: pred.home_score,
          away_score: pred.away_score,
        };
      });
      setSavedPredictions(newSaved);
      
      Alert.alert('Saved', 'Round of 32 predictions saved!');
    } catch (error) {
      console.error('Error saving predictions:', error);
      Alert.alert('Error', 'Failed to save predictions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    if (isLocked) return; // Prevent navigation when locked
    // Check if all matches have predictions and winner selected for draws
    const allHavePredictions = bracket.every((match) => {
      const pred = predictions[match.matchNumber];
      if (!pred || pred.homeScore.trim() === '' || pred.awayScore.trim() === '') {
        return false;
      }
      
      const homeScore = parseInt(pred.homeScore, 10);
      const awayScore = parseInt(pred.awayScore, 10);
      if (isNaN(homeScore) || isNaN(awayScore)) {
        return false;
      }
      
      // If it's a draw, must have predicted winner
      if (homeScore === awayScore && !pred.predictedWinnerId) {
        return false;
      }
      
      return true;
    });

    if (!allHavePredictions) {
      Alert.alert('Error', 'Please enter predictions for all matches and select a winner for any draws before continuing.');
      return;
    }

    setSaving(true);
    try {
      // Import async predictions service
      const { saveR32Predictions } = await import('@/features/wc2026/services/async-predictions');
      
      // Convert predictions to AsyncStorage format
      const r32Predictions: Record<number, { match_number: number; home_score: number; away_score: number; predicted_winner_id: string | null }> = {};
      
      bracket.forEach((match) => {
        const pred = predictions[match.matchNumber];
        if (pred && pred.homeScore.trim() && pred.awayScore.trim()) {
          const homeScore = parseInt(pred.homeScore, 10);
          const awayScore = parseInt(pred.awayScore, 10);
          
          // Determine winner if not set
          let predictedWinnerId = pred.predictedWinnerId;
          if (!predictedWinnerId) {
            if (homeScore > awayScore) {
              predictedWinnerId = match.homeTeam.id;
            } else if (awayScore > homeScore) {
              predictedWinnerId = match.awayTeam.id;
            }
          }
          
          r32Predictions[match.matchNumber] = {
            match_number: match.matchNumber,
            home_score: homeScore,
            away_score: awayScore,
            predicted_winner_id: predictedWinnerId ?? null,
          };
        }
      });

      // Save to AsyncStorage
      await saveR32Predictions(r32Predictions);

      // Persist all ante picks to Supabase (keep AsyncStorage until final submit clears it)
      if (userId) {
        const { batchSaveAllAntePostPredictions } = await import('@/features/wc2026/services/batch-save-predictions');
        const sync = await batchSaveAllAntePostPredictions(userId, { clearLocal: false });
        if (!sync.success) {
          Alert.alert(
            'Could not save to your account',
            sync.error ?? 'Check your connection and try again. Your picks are stored on this device until they sync.'
          );
          return;
        }
      }

      // Store bracket and predictions for Round of 16 results
      await AsyncStorage.setItem(ROUND_OF_32_BRACKET_KEY, JSON.stringify(bracket));
      await AsyncStorage.setItem(`${WC2026_STORAGE_PREFIX}round_of_32_predictions_for_r16`, JSON.stringify(r32Predictions));
      
      // Navigate to Round of 16 results screen
      router.push(
        wcHrefWithParams('/(wc2026)/round-of-16-results', {
          bracket: JSON.stringify(bracket),
          predictions: JSON.stringify(r32Predictions),
        })
      );
    } catch (error) {
      console.error('Error saving predictions:', error);
      Alert.alert('Error', 'Failed to save predictions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedChanges = () => {
    return bracket.some((match) => {
      const pred = predictions[match.matchNumber];
      const saved = savedPredictions[match.matchNumber];
      
      if (!pred) return false;
      
      const homeScore = pred.homeScore.trim() === '' ? null : parseInt(pred.homeScore, 10);
      const awayScore = pred.awayScore.trim() === '' ? null : parseInt(pred.awayScore, 10);
      
      if (isNaN(homeScore!) || isNaN(awayScore!)) return false;
      
      const isDraw = homeScore === awayScore;
      const hasWinner = pred.predictedWinnerId !== null && pred.predictedWinnerId !== undefined;
      
      // Check if scores changed
      if (saved?.home_score !== homeScore || saved?.away_score !== awayScore) {
        return true;
      }
      
      // If draw, check if winner selection changed (we'd need to track saved winner too)
      // For now, just check if prediction exists and is a draw without a winner
      if (isDraw && !hasWinner) {
        return true;
      }
      
      return false;
    });
  };

  const handleBackPress = () => {
    if (hasUnsavedChanges()) {
      Alert.alert(
        'Unsaved Predictions',
        'You have unsaved predictions. Are you sure you want to go back? Unsaved changes will be lost.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Go Back',
            style: 'destructive',
            onPress: () => router.replace(wcHref('/(wc2026)/ante-post-navigation')),
          },
        ]
      );
    } else {
      router.replace(wcHref('/(wc2026)/ante-post-navigation'));
    }
  };

  const completedCount = useMemo(
    () =>
      bracket.filter((match) => {
        const pred = predictions[match.matchNumber];
        return pred && pred.homeScore.trim() !== '' && pred.awayScore.trim() !== '';
      }).length,
    [bracket, predictions]
  );
  const progressLine =
    bracket.length > 0 ? `${completedCount} of ${bracket.length} matches completed` : undefined;

  if (loading) {
    return (
      <View style={styles.container}>
        <WcKnockoutResultsHeader subtitle="Round of 32" onBack={handleBackPress} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading Round of 32 fixtures...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WcKnockoutResultsHeader
        subtitle="Round of 32 · Enter scores"
        progressText={progressLine}
        onBack={handleBackPress}
      />
      
      {/* Teams Advancing to Round of 16 Header */}
      <View style={styles.winnersHeader}>
        <Text style={styles.winnersHeaderTitle}>Teams Advancing to Round of 16</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.winnersContainer}>
          {bracket
            .map((match) => {
              const pred = predictions[match.matchNumber];
              if (!pred || pred.homeScore.trim() === '' || pred.awayScore.trim() === '') {
                return null;
              }
              
              const homeScore = parseInt(pred.homeScore, 10);
              const awayScore = parseInt(pred.awayScore, 10);
              if (isNaN(homeScore) || isNaN(awayScore)) {
                return null;
              }
              
              // Determine winner
              let winner: { id: string; code: string; name: string; source: string } | null = null;
              if (homeScore > awayScore) {
                winner = match.homeTeam;
              } else if (awayScore > homeScore) {
                winner = match.awayTeam;
              } else if (pred.predictedWinnerId) {
                // Draw - use selected winner
                winner = match.homeTeam.id === pred.predictedWinnerId ? match.homeTeam : match.awayTeam;
              }
              
              return winner ? { team: winner, matchNumber: match.matchNumber } : null;
            })
            .filter((item): item is { team: { id: string; code: string; name: string; source: string }; matchNumber: number } => item !== null)
            .sort((a, b) => a.matchNumber - b.matchNumber)
            .map((item) => (
              <View key={item.team.id} style={styles.winnerBadge}>
                <CountryFlag
                  countryCode={item.team.code}
                  countryName={item.team.name}
                  flagSize={28}
                  showName={false}
                  align="center"
                />
                <Text style={styles.winnersStripText} numberOfLines={1} ellipsizeMode="tail">
                  {item.team.name}
                </Text>
              </View>
            ))}
        </ScrollView>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={true}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios' ? true : false}
        >
          {/* Locked Message */}
          {isLocked && (
            <View style={styles.lockedMessage}>
              <Text style={styles.lockedMessageText}>
                Predictions submitted and locked. You can view but not edit.
              </Text>
            </View>
          )}

          <View style={styles.headerSection}>
            <Text style={styles.description}>
              Predict the outcome of each Round of 32 match. These matchups are determined by your group stage predictions.
            </Text>
          </View>

          {bracket.map((match) => {
            const pred = predictions[match.matchNumber] || { matchNumber: match.matchNumber, homeScore: '', awayScore: '', predictedWinnerId: null };
            const hasPrediction = pred.homeScore.trim() !== '' && pred.awayScore.trim() !== '';
            const homeScore = hasPrediction ? parseInt(pred.homeScore, 10) : null;
            const awayScore = hasPrediction ? parseInt(pred.awayScore, 10) : null;
            const isDraw = hasPrediction && homeScore !== null && awayScore !== null && homeScore === awayScore;
            const homeSelected = pred.predictedWinnerId === match.homeTeam.id;
            const awaySelected = pred.predictedWinnerId === match.awayTeam.id;

            return (
              <View key={match.matchNumber} style={[styles.matchCard, showAntePostFilledHighlight(hasPrediction, isLocked) && styles.matchCardFilled]}>
                <Text style={styles.matchNumber}>Game #{match.matchNumber}</Text>
                
                <View style={styles.matchContent}>
                  {/* Home Team */}
                  <View style={styles.teamSection}>
                    <View style={styles.teamInfo}>
                      <CountryFlag
                        countryCode={match.homeTeam.code}
                        countryName={match.homeTeam.name}
                        flagSize={40}
                        showName={false}
                        align="center"
                      />
                      <Text style={styles.teamName} numberOfLines={2} ellipsizeMode="tail">
                        {match.homeTeam.name}
                      </Text>
                      <Text style={styles.teamSource} numberOfLines={1} ellipsizeMode="tail">
                        {match.homeTeam.source}
                      </Text>
                    </View>
                    <TextInput
                      style={[styles.scoreInput, showAntePostFilledHighlight(hasPrediction, isLocked) && styles.scoreInputFilled]}
                      value={pred.homeScore}
                      onChangeText={(text) => handleScoreChange(match.matchNumber, 'home', text, match.homeTeam.id, match.awayTeam.id)}
                      placeholder="0"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="numeric"
                      editable={!isLocked}
                      maxLength={2}
                      textAlign="center"
                    />
                  </View>

                  {/* VS */}
                  <Text style={styles.vsText}>vs</Text>

                  {/* Away Team */}
                  <View style={styles.teamSection}>
                    <TextInput
                      style={[styles.scoreInput, showAntePostFilledHighlight(hasPrediction, isLocked) && styles.scoreInputFilled]}
                      value={pred.awayScore}
                      onChangeText={(text) => handleScoreChange(match.matchNumber, 'away', text, match.homeTeam.id, match.awayTeam.id)}
                      placeholder="0"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="numeric"
                      editable={!isLocked}
                      maxLength={2}
                      textAlign="center"
                    />
                    <View style={styles.teamInfo}>
                      <CountryFlag
                        countryCode={match.awayTeam.code}
                        countryName={match.awayTeam.name}
                        flagSize={40}
                        showName={false}
                        align="center"
                      />
                      <Text style={styles.teamName} numberOfLines={2} ellipsizeMode="tail">
                        {match.awayTeam.name}
                      </Text>
                      <Text style={styles.teamSource} numberOfLines={1} ellipsizeMode="tail">
                        {match.awayTeam.source}
                      </Text>
                    </View>
                  </View>
                </View>

                <KnockoutMatchScorePresets
                  disabled={isLocked}
                  homeScoreStr={pred.homeScore}
                  awayScoreStr={pred.awayScore}
                  onSelect={(h, a) => {
                    if (isLocked) return;
                    runKnockoutPresetEdit({
                      anchor: 'r32',
                      match,
                      matchNumber: match.matchNumber,
                      homeScore: h,
                      awayScore: a,
                      homeTeamId: match.homeTeam.id,
                      awayTeamId: match.awayTeam.id,
                      predictions,
                      savedPredictions,
                      selectionsGloballyLocked: isLocked,
                      userId,
                      onDownstreamCleared: () => setHasDownstreamPredictions(false),
                      applyEdit: (next) => setPredictions((prev) => ({ ...prev, [match.matchNumber]: next })),
                    });
                  }}
                />

                {/* Team to Advance Selection (required for draws) */}
                {isDraw && (
                  <View style={styles.advanceSection}>
                    <Text style={styles.advanceTitle}>Team to Advance:</Text>
                    <View style={styles.advanceButtons}>
                      <TouchableOpacity
                        style={[
                          styles.advanceButton,
                          showAntePostFilledHighlight(homeSelected, isLocked) && styles.advanceButtonSelected,
                          isLocked && styles.advanceButtonDisabled
                        ]}
                        onPress={() => handleWinnerSelection(match.matchNumber, match.homeTeam.id)}
                        disabled={isLocked}
                      >
                        <CountryFlag
                          countryCode={match.homeTeam.code}
                          countryName={match.homeTeam.name}
                          flagSize={26}
                          showName={false}
                          align="center"
                        />
                        <Text style={[
                          styles.advanceButtonText,
                          showAntePostFilledHighlight(homeSelected, isLocked) && styles.advanceButtonTextSelected
                        ]}>
                          {match.homeTeam.name}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.advanceButton,
                          showAntePostFilledHighlight(awaySelected, isLocked) && styles.advanceButtonSelected,
                          isLocked && styles.advanceButtonDisabled
                        ]}
                        onPress={() => handleWinnerSelection(match.matchNumber, match.awayTeam.id)}
                        disabled={isLocked}
                      >
                        <CountryFlag
                          countryCode={match.awayTeam.code}
                          countryName={match.awayTeam.name}
                          flagSize={26}
                          showName={false}
                          align="center"
                        />
                        <Text style={[
                          styles.advanceButtonText,
                          showAntePostFilledHighlight(awaySelected, isLocked) && styles.advanceButtonTextSelected
                        ]}>
                          {match.awayTeam.name}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Show winner if not a draw */}
                {hasPrediction && !isDraw && pred.predictedWinnerId && (
                  <View style={[styles.winnerSection, isLocked && styles.winnerSectionLocked]}>
                    <Text style={[styles.winnerText, isLocked && styles.winnerTextLocked]}>
                      Winner: {pred.predictedWinnerId === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name}
                    </Text>
                  </View>
                )}

              </View>
            );
          })}

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, (saving || isLocked) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving || isLocked}
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : (
              <Text style={styles.saveButtonText}>Save Predictions</Text>
            )}
          </TouchableOpacity>

          {/* Continue Button */}
          {(() => {
            const allHavePredictions = bracket.every((match) => {
              const pred = predictions[match.matchNumber];
              if (!pred || pred.homeScore.trim() === '' || pred.awayScore.trim() === '') {
                return false;
              }
              
              const homeScore = parseInt(pred.homeScore, 10);
              const awayScore = parseInt(pred.awayScore, 10);
              if (isNaN(homeScore) || isNaN(awayScore)) {
                return false;
              }
              
              // If it's a draw, must have predicted winner
              if (homeScore === awayScore && !pred.predictedWinnerId) {
                return false;
              }
              
              return true;
            });

            return (
              <TouchableOpacity
                style={[styles.continueButton, (!allHavePredictions || saving || isLocked) && styles.continueButtonDisabled]}
                onPress={handleContinue}
                disabled={!allHavePredictions || saving || isLocked}
              >
                {saving ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <Text style={styles.continueButtonText}>Continue to Round of 16</Text>
                )}
              </TouchableOpacity>
            );
          })()}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
