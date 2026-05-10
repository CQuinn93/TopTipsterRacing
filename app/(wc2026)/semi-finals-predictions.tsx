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
import { wcHref, wcHrefWithParams } from '@/features/wc2026/utils/href';

const SEMI_FINALS_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}semi_finals_bracket`;
const BRONZE_FINAL_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}bronze_final_bracket`;

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

export default function SemiFinalsPredictionsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams() as RouteParams;
  const [bracket, setBracket] = useState<KnockoutMatch[]>([]);
  const [predictions, setPredictions] = useState<Record<number, KnockoutPrediction>>({});
  const [savedPredictions, setSavedPredictions] = useState<Record<number, { home_score: number | null; away_score: number | null }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
          const storedBracket = await AsyncStorage.getItem(SEMI_FINALS_BRACKET_KEY);
          if (storedBracket) {
            bracketData = storedBracket;
          }
        }
        
        if (bracketData) {
          const parsedBracket = JSON.parse(bracketData);
          setBracket(parsedBracket);
          
          // Try loading from AsyncStorage first (saved predictions)
          const { getSFPredictions, getAntePostLockedStatus } = await import('@/features/wc2026/services/async-predictions');
          const savedSFPredictions = await getSFPredictions();
          const loadedPredictions: Record<number, KnockoutPrediction> = {};
          const loadedSaved: Record<number, { home_score: number | null; away_score: number | null }> = {};
          
          if (Object.keys(savedSFPredictions).length > 0) {
            // Load from AsyncStorage
            Object.entries(savedSFPredictions).forEach(([matchNumStr, pred]) => {
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
          Alert.alert('Error', 'No bracket data found. Please go back and complete the previous stage.');
          router.replace(wcHref('/(wc2026)/ante-post-navigation'));
          return;
        }
      } catch (error) {
        console.error('Error parsing bracket:', error);
        Alert.alert('Error', 'Failed to load Semi Finals bracket');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [params.bracket, loadExistingPredictions]);

  const handleScoreChange = (matchNumber: number, team: 'home' | 'away', value: string, homeTeamId: string, awayTeamId: string) => {
    if (isLocked) return; // Prevent changes when locked
    setPredictions((prev) => {
      const current = prev[matchNumber] || { matchNumber, homeScore: '', awayScore: '', predictedWinnerId: null };
      const newHomeScore = team === 'home' ? value : current.homeScore;
      const newAwayScore = team === 'away' ? value : current.awayScore;
      
      // Auto-determine winner if scores are different
      let predictedWinnerId = current.predictedWinnerId;
      if (newHomeScore.trim() && newAwayScore.trim()) {
        const homeScore = parseInt(newHomeScore, 10);
        const awayScore = parseInt(newAwayScore, 10);
        if (!isNaN(homeScore) && !isNaN(awayScore)) {
          if (homeScore > awayScore) {
            predictedWinnerId = homeTeamId;
          } else if (awayScore > homeScore) {
            predictedWinnerId = awayTeamId;
          } else {
            // Draw - clear winner selection (user must choose)
            predictedWinnerId = null;
          }
        }
      }
      
      return {
        ...prev,
        [matchNumber]: {
          ...current,
          [team === 'home' ? 'homeScore' : 'awayScore']: value,
          predictedWinnerId,
        },
      };
    });
  };

  const handleWinnerSelection = (matchNumber: number, winnerId: string) => {
    if (isLocked) return; // Prevent changes when locked
    setPredictions((prev) => {
      const current = prev[matchNumber] || { matchNumber, homeScore: '', awayScore: '', predictedWinnerId: null };
      return {
        ...prev,
        [matchNumber]: {
          ...current,
          predictedWinnerId: winnerId,
        },
      };
    });
  };

  const handleSave = async () => {
    if (isLocked) return; // Prevent saving when locked
    setSaving(true);
    try {
      // Import async predictions service
      const { saveSFPredictions } = await import('@/features/wc2026/services/async-predictions');
      
      // Convert predictions to AsyncStorage format
      const sfPredictions: Record<number, { match_number: number; home_score: number; away_score: number; predicted_winner_id: string | null }> = {};
      
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
          
          sfPredictions[match.matchNumber] = {
            match_number: match.matchNumber,
            home_score: homeScore,
            away_score: awayScore,
            predicted_winner_id: predictedWinnerId ?? null,
          };
        }
      });

      // Save to AsyncStorage
      await saveSFPredictions(sfPredictions);
      
      // Update saved predictions state
      const newSaved: Record<number, { home_score: number | null; away_score: number | null }> = {};
      Object.entries(sfPredictions).forEach(([matchNumStr, pred]) => {
        newSaved[parseInt(matchNumStr, 10)] = {
          home_score: pred.home_score,
          away_score: pred.away_score,
        };
      });
      setSavedPredictions(newSaved);
      
      Alert.alert('Saved', 'Semi Finals predictions saved!');
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
      const { saveSFPredictions } = await import('@/features/wc2026/services/async-predictions');
      
      // Convert predictions to AsyncStorage format
      const sfPredictions: Record<number, { match_number: number; home_score: number; away_score: number; predicted_winner_id: string | null }> = {};
      
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
          
          sfPredictions[match.matchNumber] = {
            match_number: match.matchNumber,
            home_score: homeScore,
            away_score: awayScore,
            predicted_winner_id: predictedWinnerId ?? null,
          };
        }
      });

      // Save to AsyncStorage
      await saveSFPredictions(sfPredictions);
      
      // Store bracket for future stages
      await AsyncStorage.setItem(SEMI_FINALS_BRACKET_KEY, JSON.stringify(bracket));
      
      // Format predictions for bracket generation
      const formattedPredictions: Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }> = {};
      bracket.forEach((match) => {
        const pred = predictions[match.matchNumber];
        if (pred && pred.homeScore.trim() && pred.awayScore.trim()) {
          formattedPredictions[match.matchNumber] = {
            home_score: parseInt(pred.homeScore, 10),
            away_score: parseInt(pred.awayScore, 10),
            predicted_winner_id: pred.predictedWinnerId ?? null,
          };
        }
      });
      
      // Generate Bronze Final bracket and navigate directly to predictions
      const { generateBronzeFinalBracket } = await import('@/features/wc2026/services/knockout-bracket');
      const bronzeFinalBracket = generateBronzeFinalBracket(formattedPredictions, bracket);
      
      // Store for Bronze Final predictions
      await AsyncStorage.setItem(BRONZE_FINAL_BRACKET_KEY, JSON.stringify(bronzeFinalBracket));
      
      // Navigate to Bronze Final predictions
      router.push(
        wcHrefWithParams('/(wc2026)/bronze-final-predictions', {
          bracket: JSON.stringify(bronzeFinalBracket),
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
          <Text style={styles.headerTitle}>Semi Finals</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={DesignColors.primary} />
          <Text style={styles.loadingText}>Loading Semi Finals fixtures...</Text>
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
          onPress={handleBackPress}
        >
          <IconSymbol name="chevron.left" size={24} color={DesignColors.text} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Ante Post</Text>
          <Text style={styles.headerSubtitle}>Semi Finals</Text>
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
      
      {/* Teams Advancing Header */}
      <View style={styles.winnersHeader}>
        <Text style={styles.winnersHeaderTitle}>Teams Advancing to Final / Bronze Match</Text>
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
                <Text style={styles.winnerName} numberOfLines={1} ellipsizeMode="tail">
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
              Predict the outcome of each Semi Finals match. Winners advance to the Final, losers play in the Bronze Match.
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
              <View key={match.matchNumber} style={[styles.matchCard, hasPrediction && styles.matchCardFilled]}>
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
                      style={[styles.scoreInput, hasPrediction && styles.scoreInputFilled]}
                      value={pred.awayScore}
                      onChangeText={(text) => handleScoreChange(match.matchNumber, 'away', text, match.homeTeam.id, match.awayTeam.id)}
                      placeholder="0"
                      placeholderTextColor="rgba(71, 74, 74, 0.5)"
                      keyboardType="numeric"
                      editable={!isLocked}
                      maxLength={2}
                      textAlign="center"
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

                {/* Show winner if not a draw */}
                {hasPrediction && !isDraw && pred.predictedWinnerId && (
                  <View style={styles.winnerSection}>
                    <Text style={styles.winnerText}>
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
              <ActivityIndicator color={DesignColors.textOnDark} />
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
                  <ActivityIndicator color={DesignColors.textOnDark} />
                ) : (
                  <Text style={styles.continueButtonText}>Continue to Bronze Final & Final</Text>
                )}
              </TouchableOpacity>
            );
          })()}
        </ScrollView>
      </KeyboardAvoidingView>
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
    paddingHorizontal: IS_SMALL_SCREEN ? 14 : 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: DesignColors.surface,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: DesignColors.text,
    fontSize: 16,
    fontWeight: '600',
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
  progressText: {
    color: DesignColors.primary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
  },
  matchCard: {
    backgroundColor: DesignColors.surface,
    borderRadius: 12,
    padding: IS_SMALL_SCREEN ? 12 : 16,
    marginBottom: IS_SMALL_SCREEN ? 12 : 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  matchCardFilled: {
    borderColor: DesignColors.primary,
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
    marginBottom: IS_SMALL_SCREEN ? 8 : 12,
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
  vsText: {
    color: DesignColors.text,
    fontSize: IS_SMALL_SCREEN ? 14 : 18,
    fontWeight: '700',
    marginHorizontal: IS_SMALL_SCREEN ? 6 : 12,
    opacity: 0.5,
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
  },
  scoreInputFilled: {
    borderColor: DesignColors.primary,
    backgroundColor: DesignColors.primary + '20',
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
    fontSize: 14,
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
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  advanceButtonTextSelected: {
    color: DesignColors.primary,
    fontWeight: '700',
  },
  winnerSection: {
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: DesignColors.primary + '15',
  },
  winnerText: {
    color: DesignColors.primary,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  winnersHeader: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: DesignColors.surface,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  winnersHeaderTitle: {
    color: DesignColors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
    opacity: 0.7,
  },
  winnersContainer: {
    gap: 8,
    paddingHorizontal: 4,
  },
  winnerBadge: {
    alignItems: 'center',
    marginHorizontal: 4,
    minWidth: 60,
    maxWidth: 80,
  },
  winnerName: {
    color: DesignColors.text,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 80,
  },
  saveButton: {
    backgroundColor: DesignColors.actionButton,
    borderRadius: 12,
    paddingVertical: IS_SMALL_SCREEN ? 14 : 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonDisabled: {
    opacity: 0.1,
  },
  lockedMessage: {
    backgroundColor: DesignColors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 20,
    borderLeftWidth: 4,
    borderLeftColor: DesignColors.primary,
  },
  lockedMessageText: {
    color: DesignColors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  saveButtonText: {
    color: DesignColors.textOnDark,
    fontSize: IS_SMALL_SCREEN ? 16 : 18,
    fontWeight: '700',
  },
  continueButton: {
    backgroundColor: DesignColors.primary,
    borderRadius: 12,
    paddingVertical: IS_SMALL_SCREEN ? 14 : 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  continueButtonDisabled: {
    opacity: 0.3,
  },
  continueButtonText: {
    color: DesignColors.textOnDark,
    fontSize: IS_SMALL_SCREEN ? 16 : 18,
    fontWeight: '700',
  },
});
