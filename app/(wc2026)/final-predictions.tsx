import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import { WcKnockoutResultsHeader } from '@/features/wc2026/components/WcKnockoutResultsHeader';
import {
  useKnockoutPredictionsScreenStyles,
  useFinalPredictionExtrasStyles,
} from '@/features/wc2026/components/useKnockoutPredictionsScreenStyles';
import { WC2026_STORAGE_PREFIX } from '@/features/wc2026/constants/storage-keys';
import { CountryFlag } from '@/features/wc2026/components/CountryFlag';
import { KnockoutMatchScorePresets } from '@/features/wc2026/components/KnockoutMatchScorePresets';
import { applyKnockoutScorePreset } from '@/features/wc2026/utils/knockout-preset-score';
import { type KnockoutMatch } from '@/features/wc2026/services/knockout-bracket';
import { supabase } from '@/lib/supabase';
import { batchSaveAllAntePostPredictions } from '@/features/wc2026/services/batch-save-predictions';
import { wcHref } from '@/features/wc2026/utils/href';
import { showAntePostFilledHighlight } from '@/features/wc2026/utils/knockout-ui';

const FINAL_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}final_bracket`;

interface RouteParams {
  bracket?: string; // JSON stringified KnockoutMatch[]
}

interface KnockoutPrediction {
  matchNumber: number;
  homeScore: string;
  awayScore: string;
  predictedWinnerId?: string | null;
}

export default function FinalPredictionsScreen() {
  const theme = useTheme();
  const s = useKnockoutPredictionsScreenStyles();
  const fin = useFinalPredictionExtrasStyles();
  const params = useLocalSearchParams() as RouteParams;
  const [bracket, setBracket] = useState<KnockoutMatch[]>([]);
  const [predictions, setPredictions] = useState<Record<number, KnockoutPrediction>>({});
  const [savedPredictions, setSavedPredictions] = useState<Record<number, { home_score: number | null; away_score: number | null }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
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
          setUserId(currentUser);
        }
      } catch (error) {
        console.error('Error getting session:', error);
      }

      try {
        // Load bracket from params or AsyncStorage
        let bracketData: string | undefined = params.bracket;
        if (!bracketData) {
          bracketData = (await AsyncStorage.getItem(FINAL_BRACKET_KEY)) ?? undefined;
        }
        
        if (bracketData) {
          const parsedBracket = JSON.parse(bracketData);
          setBracket(parsedBracket);
          
          // Try loading from AsyncStorage first (saved predictions)
          const { getFinalPredictions, getAntePostLockedStatus } = await import('@/features/wc2026/services/async-predictions');
          const savedPreds = await getFinalPredictions();
          const newPredictions: Record<number, KnockoutPrediction> = {};
          
          if (Object.keys(savedPreds).length > 0) {
            parsedBracket.forEach((match: KnockoutMatch) => {
              const saved = savedPreds[match.matchNumber];
              if (saved) {
                newPredictions[match.matchNumber] = {
                  matchNumber: match.matchNumber,
                  homeScore: saved.home_score?.toString() ?? '',
                  awayScore: saved.away_score?.toString() ?? '',
                  predictedWinnerId: saved.predicted_winner_id ?? null,
                };
              }
            });
            setPredictions((prev) => ({ ...prev, ...newPredictions }));
          }
          
          // Check if predictions are already submitted (locked)
          const locked = await getAntePostLockedStatus();
          setIsLocked(locked);
          
          // If no AsyncStorage data, try database (works for both locked and unlocked)
          if (currentUser && Object.keys(newPredictions).length === 0) {
            await loadExistingPredictions(parsedBracket, currentUser);
          }
        }
      } catch (error) {
        console.error('Error initializing:', error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [params.bracket, loadExistingPredictions]);

  const handleScoreChange = (matchNumber: number, side: 'home' | 'away', value: string, homeTeamId: string, awayTeamId: string) => {
    setPredictions((prev) => {
      const current = prev[matchNumber] || { matchNumber, homeScore: '', awayScore: '', predictedWinnerId: null };
      const newHomeScore = side === 'home' ? value : current.homeScore;
      const newAwayScore = side === 'away' ? value : current.awayScore;
      
      const homeScoreNum = newHomeScore.trim() === '' ? null : parseInt(newHomeScore, 10);
      const awayScoreNum = newAwayScore.trim() === '' ? null : parseInt(newAwayScore, 10);
      const isDraw = homeScoreNum !== null && awayScoreNum !== null && homeScoreNum === awayScoreNum;
      
      // Auto-determine winner if not a draw
      let predictedWinnerId = current.predictedWinnerId;
      if (!isDraw && homeScoreNum !== null && awayScoreNum !== null && !isNaN(homeScoreNum) && !isNaN(awayScoreNum)) {
        if (homeScoreNum > awayScoreNum) {
          predictedWinnerId = homeTeamId;
        } else if (awayScoreNum > homeScoreNum) {
          predictedWinnerId = awayTeamId;
        }
      } else if (!isDraw) {
        predictedWinnerId = null;
      }
      
      return {
        ...prev,
        [matchNumber]: {
          matchNumber,
          homeScore: newHomeScore,
          awayScore: newAwayScore,
          predictedWinnerId,
        },
      };
    });
  };

  const handleWinnerSelection = (matchNumber: number, teamId: string) => {
    setPredictions((prev) => ({
      ...prev,
      [matchNumber]: {
        ...prev[matchNumber],
        matchNumber,
        predictedWinnerId: prev[matchNumber]?.predictedWinnerId === teamId ? null : teamId,
      },
    }));
  };

  const handleSave = async () => {
    if (!userId) {
      Alert.alert('Error', 'You must be logged in to save predictions.');
      return;
    }

    setSaving(true);
    try {
      const { saveFinalPredictions } = await import('@/features/wc2026/services/async-predictions');
      
      // Convert predictions to AsyncStorage format
      const finalPredictions: Record<number, { match_number: number; home_score: number; away_score: number; predicted_winner_id: string | null }> = {};
      
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
          
          finalPredictions[match.matchNumber] = {
            match_number: match.matchNumber,
            home_score: homeScore,
            away_score: awayScore,
            predicted_winner_id: predictedWinnerId ?? null,
          };
        }
      });

      // Save to AsyncStorage
      await saveFinalPredictions(finalPredictions);
      
      // Store bracket for future reference
      await AsyncStorage.setItem(FINAL_BRACKET_KEY, JSON.stringify(bracket));
      
      Alert.alert(
        'Saved',
        'Final prediction saved! You can continue editing until you submit your final ante post selections.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error saving predictions:', error);
      Alert.alert('Error', 'Failed to save predictions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
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
      Alert.alert('Error', 'Please enter a prediction for the Final match and select a winner if it is a draw before submitting.');
      return;
    }

    if (!userId) {
      Alert.alert('Error', 'You must be logged in to submit predictions.');
      return;
    }

    // Show confirmation dialog
    Alert.alert(
      'Confirm Submission',
      'You are about to submit your ante post selections. These cannot be changed once confirmed. Do you want to continue?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Submit',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              // First save the Final predictions
              const { saveFinalPredictions } = await import('@/features/wc2026/services/async-predictions');
              
              const finalPredictions: Record<number, { match_number: number; home_score: number; away_score: number; predicted_winner_id: string | null }> = {};
              
              bracket.forEach((match) => {
                const pred = predictions[match.matchNumber];
                if (pred && pred.homeScore.trim() && pred.awayScore.trim()) {
                  const homeScore = parseInt(pred.homeScore, 10);
                  const awayScore = parseInt(pred.awayScore, 10);
                  
                  let predictedWinnerId = pred.predictedWinnerId;
                  if (!predictedWinnerId) {
                    if (homeScore > awayScore) {
                      predictedWinnerId = match.homeTeam.id;
                    } else if (awayScore > homeScore) {
                      predictedWinnerId = match.awayTeam.id;
                    }
                  }
                  
                  finalPredictions[match.matchNumber] = {
                    match_number: match.matchNumber,
                    home_score: homeScore,
                    away_score: awayScore,
                    predicted_winner_id: predictedWinnerId ?? null,
                  };
                }
              });

              await saveFinalPredictions(finalPredictions);
              
              // Now batch save all ante post predictions
              const result = await batchSaveAllAntePostPredictions(userId, { clearLocal: true });
              
              if (result.success) {
                // Set locked status after successful submission
                const { syncAntePostSubmittedLock } = await import('@/features/wc2026/services/async-predictions');
                await syncAntePostSubmittedLock();
                setIsLocked(true);
                
                Alert.alert(
                  'Success!',
                  `Your ante post selections have been submitted successfully! ${result.savedCount} predictions saved.`,
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        // Navigate back to home
                        router.replace(wcHref('/(wc2026)/(tabs)'));
                      },
                    },
                  ]
                );
              } else {
                Alert.alert(
                  'Error',
                  result.error || 'Failed to submit predictions. Please try again.',
                  [{ text: 'OK' }]
                );
              }
            } catch (error) {
              console.error('Error submitting predictions:', error);
              Alert.alert('Error', 'Failed to submit predictions. Please try again.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const handleBackPress = () => {
    router.replace(wcHref('/(wc2026)/ante-post-navigation'));
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
      <View style={s.container}>
        <WcKnockoutResultsHeader subtitle="Final" onBack={handleBackPress} />
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={s.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (bracket.length === 0) {
    return (
      <View style={s.container}>
        <WcKnockoutResultsHeader subtitle="Final" onBack={handleBackPress} />
        <View style={s.loadingContainer}>
          <Text style={s.loadingText}>No Final bracket available. Please go back and complete previous stages.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={s.container}>
        <WcKnockoutResultsHeader
          subtitle="Final · Enter scores"
          progressText={progressLine}
          onBack={handleBackPress}
        />

        <ScrollView
          style={s.scrollView}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.headerSection}>
            <Text style={s.description}>
              Make your prediction for the Final match. If the match ends in a draw, select which team will win.
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
            
            // Determine winner
            let winnerId: string | null = null;
            if (hasPrediction && !isDraw && homeScore !== null && awayScore !== null) {
              if (homeScore > awayScore) {
                winnerId = match.homeTeam.id;
              } else if (awayScore > homeScore) {
                winnerId = match.awayTeam.id;
              }
            } else if (isDraw && pred.predictedWinnerId) {
              winnerId = pred.predictedWinnerId;
            }
            
            const winner = winnerId ? (winnerId === match.homeTeam.id ? match.homeTeam : match.awayTeam) : null;

            return (
              <View key={match.matchNumber} style={fin.matchCardWrapper}>
                <Text style={fin.finaleText}>Finale</Text>
                <View
                  style={[
                    s.matchCard,
                    showAntePostFilledHighlight(hasPrediction, isLocked) && s.matchCardFilled,
                    !isLocked && fin.matchCardGold,
                  ]}
                >
                  <Text style={s.matchNumber}>Game #{match.matchNumber}</Text>
                  
                  <View style={s.matchContent}>
                    {/* Home Team */}
                    <View style={s.teamSection}>
                      <View style={s.teamInfo}>
                        <CountryFlag
                          countryCode={match.homeTeam.code}
                          countryName={match.homeTeam.name}
                          flagSize={40}
                          showName={false}
                          align="center"
                        />
                        <Text style={s.teamName} numberOfLines={2} ellipsizeMode="tail">
                          {match.homeTeam.name}
                        </Text>
                        <Text style={s.teamSource} numberOfLines={1} ellipsizeMode="tail">
                          {match.homeTeam.source}
                        </Text>
                      </View>
                      <TextInput
                        style={[s.scoreInput, showAntePostFilledHighlight(hasPrediction, isLocked) && s.scoreInputFilled]}
                        value={pred.homeScore}
                        onChangeText={(text) => handleScoreChange(match.matchNumber, 'home', text, match.homeTeam.id, match.awayTeam.id)}
                        placeholder="0"
                        placeholderTextColor={theme.colors.textMuted}
                        keyboardType="numeric"
                        maxLength={2}
                        textAlign="center"
                        editable={!isLocked}
                      />
                    </View>

                    {/* VS */}
                    <Text style={s.vsText}>vs</Text>

                    {/* Away Team */}
                    <View style={s.teamSection}>
                      <TextInput
                        style={[s.scoreInput, showAntePostFilledHighlight(hasPrediction, isLocked) && s.scoreInputFilled]}
                        value={pred.awayScore}
                        onChangeText={(text) => handleScoreChange(match.matchNumber, 'away', text, match.homeTeam.id, match.awayTeam.id)}
                        placeholder="0"
                        placeholderTextColor={theme.colors.textMuted}
                        keyboardType="numeric"
                        maxLength={2}
                        textAlign="center"
                        editable={!isLocked}
                      />
                      <View style={s.teamInfo}>
                        <CountryFlag
                          countryCode={match.awayTeam.code}
                          countryName={match.awayTeam.name}
                          flagSize={40}
                          showName={false}
                          align="center"
                        />
                        <Text style={s.teamName} numberOfLines={2} ellipsizeMode="tail">
                          {match.awayTeam.name}
                        </Text>
                        <Text style={s.teamSource} numberOfLines={1} ellipsizeMode="tail">
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
                      setPredictions((prev) =>
                        applyKnockoutScorePreset(
                          prev,
                          match.matchNumber,
                          h,
                          a,
                          match.homeTeam.id,
                          match.awayTeam.id
                        )
                      );
                    }}
                  />

                  {/* Team to Advance Selection (required for draws) */}
                  {isDraw && (
                    <View style={s.advanceSection}>
                      <Text style={s.advanceTitle}>Team to Advance:</Text>
                      <View style={s.advanceButtons}>
                        <TouchableOpacity
                          style={[
                            s.advanceButton,
                            showAntePostFilledHighlight(homeSelected, isLocked) && s.advanceButtonSelected
                          ]}
                          onPress={() => handleWinnerSelection(match.matchNumber, match.homeTeam.id)}
                        >
                          <CountryFlag
                            countryCode={match.homeTeam.code}
                            countryName={match.homeTeam.name}
                            flagSize={26}
                            showName={false}
                            align="center"
                          />
                          <Text style={[
                            s.advanceButtonText,
                            showAntePostFilledHighlight(homeSelected, isLocked) && s.advanceButtonTextSelected
                          ]}>
                            {match.homeTeam.name}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            s.advanceButton,
                            showAntePostFilledHighlight(awaySelected, isLocked) && s.advanceButtonSelected
                          ]}
                          onPress={() => handleWinnerSelection(match.matchNumber, match.awayTeam.id)}
                        >
                          <CountryFlag
                            countryCode={match.awayTeam.code}
                            countryName={match.awayTeam.name}
                            flagSize={26}
                            showName={false}
                            align="center"
                          />
                          <Text style={[
                            s.advanceButtonText,
                            showAntePostFilledHighlight(awaySelected, isLocked) && s.advanceButtonTextSelected
                          ]}>
                            {match.awayTeam.name}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Show Winner with Trophy */}
                  {winner && (
                    <View
                      style={[
                        s.winnerSection,
                        fin.championSection,
                        isLocked && s.winnerSectionLocked,
                      ]}
                    >
                      <View style={fin.winnerChampionBlock}>
                        <Ionicons name="trophy" size={40} color={theme.colors.statusAccent} />
                        <CountryFlag
                          countryCode={winner.code}
                          countryName={winner.name}
                          flagSize={50}
                          showName={false}
                          align="center"
                        />
                        <Text style={fin.championName}>{winner.name}</Text>
                        <Text style={fin.winnerSubtitle}>2026 Winners</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            );
          })}

          {/* Save and Submit Buttons */}
          <View style={fin.buttonColumn}>
            {!isLocked && (
              <>
                <TouchableOpacity
                  style={[s.saveButton, saving && fin.mutedButton]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={s.saveButtonText}>
                    {saving ? 'Saving...' : 'Save Predictions'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    fin.submitCTA,
                    (submitting || !bracket.every((match) => {
                      const pred = predictions[match.matchNumber];
                      if (!pred || pred.homeScore.trim() === '' || pred.awayScore.trim() === '') {
                        return false;
                      }
                      const homeScore = parseInt(pred.homeScore, 10);
                      const awayScore = parseInt(pred.awayScore, 10);
                      if (isNaN(homeScore) || isNaN(awayScore)) {
                        return false;
                      }
                      if (homeScore === awayScore && !pred.predictedWinnerId) {
                        return false;
                      }
                      return true;
                    })) && fin.mutedButton,
                  ]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  <Text style={fin.submitCTAText}>
                    {submitting ? 'Submitting...' : 'Submit All Ante Post Selections'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {isLocked && (
              <View style={fin.lockedStack}>
                <Ionicons name="lock-closed-outline" size={32} color={theme.colors.textMuted} />
                <Text style={fin.lockedCaption}>Your ante post selections have been submitted and are now locked.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

