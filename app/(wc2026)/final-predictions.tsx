import { useEffect, useState, useRef, useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { IconSymbol } from '@/features/wc2026/components/IconSymbol';
import { DesignColors } from '@/features/wc2026/constants/design-colors';
import { WC2026_STORAGE_PREFIX } from '@/features/wc2026/constants/storage-keys';
import { CountryFlag } from '@/features/wc2026/components/CountryFlag';
import { type KnockoutMatch } from '@/features/wc2026/services/knockout-bracket';
import { supabase } from '@/lib/supabase';
import { batchSaveAllAntePostPredictions } from '@/features/wc2026/services/batch-save-predictions';
import { wcHref } from '@/features/wc2026/utils/href';

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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_SMALL_SCREEN = SCREEN_WIDTH < 375;

export default function FinalPredictionsScreen() {
  const insets = useSafeAreaInsets();
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
              const result = await batchSaveAllAntePostPredictions(userId);
              
              if (result.success) {
                // Set locked status after successful submission
                const { setAntePostLockedStatus } = await import('@/features/wc2026/services/async-predictions');
                await setAntePostLockedStatus(true);
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackPress}
          >
            <IconSymbol name="chevron.left" size={24} color={DesignColors.text} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Ante Post</Text>
            <Text style={styles.headerSubtitle}>Final</Text>
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

  if (bracket.length === 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackPress}
          >
            <IconSymbol name="chevron.left" size={24} color={DesignColors.text} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Ante Post</Text>
            <Text style={styles.headerSubtitle}>Final</Text>
          </View>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>No Final bracket available. Please go back and complete previous stages.</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackPress}
          >
            <IconSymbol name="chevron.left" size={24} color={DesignColors.text} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Ante Post</Text>
            <Text style={styles.headerSubtitle}>Final</Text>
            {(() => {
              const completedCount = bracket.filter((match) => {
                const pred = predictions[match.matchNumber];
                return pred && pred.homeScore.trim() !== '' && pred.awayScore.trim() !== '';
              }).length;
              return (
                <Text style={styles.progressText}>
                  {completedCount} of {bracket.length} matches completed
                </Text>
              );
            })()}
          </View>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerSection}>
            <Text style={styles.description}>
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
              <View key={match.matchNumber} style={styles.matchCardWrapper}>
                <Text style={styles.finaleText}>Finale</Text>
                <View style={[styles.matchCard, hasPrediction && styles.matchCardFilled, styles.matchCardGold]}>
                  <Text style={styles.matchNumber}>Game #{match.matchNumber}</Text>
                  
                  <View style={styles.matchContent}>
                    {/* Home Team */}
                    <View style={styles.teamSection}>
                      <View style={styles.teamInfo}>
                        <CountryFlag
                          countryCode={match.homeTeam.code}
                          countryName={match.homeTeam.name}
                          flagSize={50}
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
                        style={[styles.scoreInput, hasPrediction && styles.scoreInputFilled]}
                        value={pred.homeScore}
                        onChangeText={(text) => handleScoreChange(match.matchNumber, 'home', text, match.homeTeam.id, match.awayTeam.id)}
                        placeholder="0"
                        placeholderTextColor="rgba(71, 74, 74, 0.5)"
                        keyboardType="numeric"
                        maxLength={2}
                        textAlign="center"
                        editable={!isLocked}
                      />
                    </View>

                    {/* VS */}
                    <Text style={styles.vsText}>vs</Text>

                    {/* Away Team */}
                    <View style={styles.teamSection}>
                      <TextInput
                        style={[styles.scoreInput, hasPrediction && styles.scoreInputFilled]}
                        value={pred.awayScore}
                        onChangeText={(text) => handleScoreChange(match.matchNumber, 'away', text, match.homeTeam.id, match.awayTeam.id)}
                        placeholder="0"
                        placeholderTextColor="rgba(71, 74, 74, 0.5)"
                        keyboardType="numeric"
                        maxLength={2}
                        textAlign="center"
                        editable={!isLocked}
                      />
                      <View style={styles.teamInfo}>
                        <CountryFlag
                          countryCode={match.awayTeam.code}
                          countryName={match.awayTeam.name}
                          flagSize={50}
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

                  {/* Team to Advance Selection (required for draws) */}
                  {isDraw && (
                    <View style={styles.advanceSection}>
                      <Text style={styles.advanceTitle}>Team to Advance:</Text>
                      <View style={styles.advanceButtons}>
                        <TouchableOpacity
                          style={[
                            styles.advanceButton,
                            homeSelected && styles.advanceButtonSelected
                          ]}
                          onPress={() => handleWinnerSelection(match.matchNumber, match.homeTeam.id)}
                        >
                          <CountryFlag
                            countryCode={match.homeTeam.code}
                            countryName={match.homeTeam.name}
                            flagSize={30}
                            showName={false}
                            align="center"
                          />
                          <Text style={[
                            styles.advanceButtonText,
                            homeSelected && styles.advanceButtonTextSelected
                          ]}>
                            {match.homeTeam.name}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.advanceButton,
                            awaySelected && styles.advanceButtonSelected
                          ]}
                          onPress={() => handleWinnerSelection(match.matchNumber, match.awayTeam.id)}
                        >
                          <CountryFlag
                            countryCode={match.awayTeam.code}
                            countryName={match.awayTeam.name}
                            flagSize={30}
                            showName={false}
                            align="center"
                          />
                          <Text style={[
                            styles.advanceButtonText,
                            awaySelected && styles.advanceButtonTextSelected
                          ]}>
                            {match.awayTeam.name}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Show Winner with Trophy */}
                  {winner && (
                    <View style={styles.winnerSection}>
                      <View style={styles.winnerContent}>
                        <IconSymbol name="trophy.fill" size={40} color="#FFD700" />
                        <CountryFlag
                          countryCode={winner.code}
                          countryName={winner.name}
                          flagSize={50}
                          showName={false}
                          align="center"
                        />
                        <Text style={styles.winnerName}>{winner.name}</Text>
                        <Text style={styles.winnerLabel}>2026 Winners</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            );
          })}

          {/* Save and Submit Buttons */}
          <View style={styles.buttonContainer}>
            {!isLocked && (
              <>
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.buttonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  <Text style={styles.saveButtonText}>
                    {saving ? 'Saving...' : 'Save Predictions'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.submitButton,
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
                    })) && styles.buttonDisabled,
                  ]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  <Text style={styles.submitButtonText}>
                    {submitting ? 'Submitting...' : 'Submit All Ante Post Selections'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {isLocked && (
              <View style={styles.lockedMessage}>
                <IconSymbol name="lock.fill" size={32} color={DesignColors.text} />
                <Text style={styles.lockedText}>Your ante post selections have been submitted and are now locked.</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
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
    fontSize: IS_SMALL_SCREEN ? 14 : 16,
    fontWeight: '600',
  },
  headerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    paddingHorizontal: IS_SMALL_SCREEN ? 60 : 80, // Ensure text doesn't overlap with back buttons
  },
  headerTitle: {
    color: DesignColors.text,
    fontSize: IS_SMALL_SCREEN ? 16 : 18,
    fontWeight: '700',
    fontFamily: 'Ethnocentric',
    textAlign: 'center',
    marginTop: IS_SMALL_SCREEN ? 40 : 50,
  },
  headerSubtitle: {
    color: DesignColors.text,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.7,
  },
  progressText: {
    color: DesignColors.primary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
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
  keyboardAvoidingView: {
    flex: 1,
    margin: 0,
    padding: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: IS_SMALL_SCREEN ? 14 : 20,
    paddingBottom: IS_SMALL_SCREEN ? 30 : 40,
  },
  headerSection: {
    marginBottom: 24,
  },
  description: {
    color: DesignColors.text,
    fontSize: IS_SMALL_SCREEN ? 13 : 14,
    marginBottom: 8,
    opacity: 0.7,
    textAlign: 'center',
    lineHeight: IS_SMALL_SCREEN ? 18 : 20,
  },
  matchCardWrapper: {
    marginBottom: 24,
    alignItems: 'center',
  },
  finaleText: {
    color: DesignColors.primary,
    fontSize: IS_SMALL_SCREEN ? 26 : 32,
    fontWeight: '700',
    fontFamily: 'Ethnocentric',
    textAlign: 'center',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  matchCard: {
    backgroundColor: DesignColors.surface,
    borderRadius: 12,
    padding: IS_SMALL_SCREEN ? 12 : 16,
    width: '100%',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  matchCardFilled: {
    borderColor: DesignColors.primary,
  },
  matchCardGold: {
    borderWidth: 3,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  matchNumber: {
    color: DesignColors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  matchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: IS_SMALL_SCREEN ? 10 : 16,
  },
  teamSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: IS_SMALL_SCREEN ? 8 : 12,
  },
  teamInfo: {
    flex: 1,
    alignItems: 'center',
    gap: IS_SMALL_SCREEN ? 6 : 8,
  },
  teamName: {
    color: DesignColors.text,
    fontSize: IS_SMALL_SCREEN ? 12 : 14,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: IS_SMALL_SCREEN ? 90 : 100,
  },
  teamSource: {
    color: DesignColors.text,
    fontSize: IS_SMALL_SCREEN ? 10 : 11,
    fontWeight: '400',
    textAlign: 'center',
    opacity: 0.6,
    maxWidth: IS_SMALL_SCREEN ? 90 : 100,
  },
  scoreInput: {
    width: IS_SMALL_SCREEN ? 50 : 60,
    height: IS_SMALL_SCREEN ? 44 : 50,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: DesignColors.surface,
    backgroundColor: '#FFFFFF',
    fontSize: IS_SMALL_SCREEN ? 20 : 24,
    fontWeight: '700',
    color: DesignColors.text,
    textAlign: 'center',
  },
  scoreInputFilled: {
    borderColor: DesignColors.primary,
    backgroundColor: DesignColors.primary + '20',
  },
  vsText: {
    color: DesignColors.text,
    fontSize: IS_SMALL_SCREEN ? 14 : 18,
    fontWeight: '700',
    marginHorizontal: IS_SMALL_SCREEN ? 6 : 12,
    opacity: 0.5,
  },
  advanceSection: {
    marginTop: 16,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: DesignColors.surface,
  },
  advanceTitle: {
    color: DesignColors.text,
    fontSize: IS_SMALL_SCREEN ? 13 : 14,
    fontWeight: '700',
    marginBottom: 12,
  },
  advanceButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-around',
  },
  advanceButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: DesignColors.surface,
    backgroundColor: '#FFFFFF',
  },
  advanceButtonSelected: {
    borderColor: DesignColors.primary,
    backgroundColor: DesignColors.primary + '20',
  },
  advanceButtonText: {
    color: DesignColors.text,
    fontSize: IS_SMALL_SCREEN ? 12 : 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  advanceButtonTextSelected: {
    color: DesignColors.primary,
    fontWeight: '700',
  },
  winnerSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 2,
    borderTopColor: '#FFD700',
    alignItems: 'center',
  },
  winnerContent: {
    alignItems: 'center',
    gap: 12,
  },
  winnerName: {
    color: DesignColors.text,
    fontSize: IS_SMALL_SCREEN ? 16 : 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  winnerLabel: {
    color: DesignColors.primary,
    fontSize: IS_SMALL_SCREEN ? 14 : 16,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'Ethnocentric',
  },
  buttonContainer: {
    gap: 12,
    marginTop: 24,
  },
  saveButton: {
    backgroundColor: DesignColors.surface,
    borderRadius: 12,
    paddingVertical: IS_SMALL_SCREEN ? 14 : 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: DesignColors.primary,
  },
  saveButtonText: {
    color: DesignColors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  submitButton: {
    backgroundColor: DesignColors.primary,
    borderRadius: 12,
    paddingVertical: IS_SMALL_SCREEN ? 14 : 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  submitButtonText: {
    color: DesignColors.textOnDark,
    fontSize: IS_SMALL_SCREEN ? 16 : 18,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  lockedMessage: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  lockedText: {
    color: DesignColors.text,
    fontSize: IS_SMALL_SCREEN ? 14 : 16,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.7,
  },
});
