import { useEffect, useState, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
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
import { CountryFlag } from '@/features/wc2026/components/CountryFlag';
import { type KnockoutMatch } from '@/features/wc2026/services/knockout-bracket';
import { generateBronzeFinalBracket } from '@/features/wc2026/services/knockout-bracket';
import { wcHref, wcHrefWithParams } from '@/features/wc2026/utils/href';

const SEMI_FINALS_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}semi_finals_bracket`;
const SEMI_FINALS_PREDICTIONS_FOR_FINAL_KEY = `${WC2026_STORAGE_PREFIX}semi_finals_predictions_for_final`;
const BRONZE_FINAL_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}bronze_final_bracket`;

interface RouteParams {
  bracket?: string; // JSON stringified Semi Finals bracket
  predictions?: string; // JSON stringified Semi Finals predictions
}

export default function BronzeFinalResultsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams() as RouteParams;
  const [sfBracket, setSfBracket] = useState<KnockoutMatch[]>([]);
  const [sfPredictions, setSfPredictions] = useState<Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (initializedRef.current) return;
    
    const loadData = async () => {
      initializedRef.current = true;
      try {
        let bracketData: string | undefined = params.bracket;
        let predictionsData: string | undefined = params.predictions;
        
        // If no data in params, try AsyncStorage
        if (!bracketData) {
          bracketData = (await AsyncStorage.getItem(SEMI_FINALS_BRACKET_KEY)) ?? undefined;
        }
        if (!predictionsData) {
          predictionsData = (await AsyncStorage.getItem(SEMI_FINALS_PREDICTIONS_FOR_FINAL_KEY)) ?? undefined;
        }
        
        if (bracketData && predictionsData) {
          const bracket = JSON.parse(bracketData);
          const predictions = JSON.parse(predictionsData);
          setSfBracket(bracket);
          setSfPredictions(predictions);
        } else {
          // Fallback: try loading from saved SF predictions
          const { getSFPredictions } = await import('@/features/wc2026/services/async-predictions');
          const savedPredictions = await getSFPredictions();
          if (Object.keys(savedPredictions).length > 0) {
            const storedBracket = await AsyncStorage.getItem(SEMI_FINALS_BRACKET_KEY);
            if (storedBracket) {
              setSfBracket(JSON.parse(storedBracket));
              const formatted: Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }> = {};
              Object.entries(savedPredictions).forEach(([matchNumStr, pred]) => {
                formatted[parseInt(matchNumStr, 10)] = {
                  home_score: pred.home_score,
                  away_score: pred.away_score,
                  predicted_winner_id: pred.predicted_winner_id,
                };
              });
              setSfPredictions(formatted);
            }
          }
        }
      } catch (error) {
        console.error('Error loading Semi Finals data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleContinue = () => {
    // Generate Bronze Final bracket and navigate to predictions
    const bronzeFinalBracket = generateBronzeFinalBracket(sfPredictions, sfBracket);
    
    // Store for Bronze Final predictions
    AsyncStorage.setItem(BRONZE_FINAL_BRACKET_KEY, JSON.stringify(bronzeFinalBracket));
    
    router.push(
      wcHrefWithParams('/(wc2026)/bronze-final-predictions', {
        bracket: JSON.stringify(bronzeFinalBracket),
      })
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <IconSymbol name="chevron.left" size={24} color={DesignColors.text} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Ante Post</Text>
            <Text style={styles.headerSubtitle}>Semi Finals Results</Text>
          </View>
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={DesignColors.primary} />
          <Text style={styles.loadingText}>Loading results...</Text>
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
          onPress={() => router.back()}
        >
          <IconSymbol name="chevron.left" size={24} color={DesignColors.text} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Ante Post</Text>
          <Text style={styles.headerSubtitle}>Semi Finals Results</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerSection}>
          <Text style={styles.description}>
            Semi Finals results based on your predictions. Winners advance to the Final. Losers play in the Bronze Final.
          </Text>
        </View>

        {sfBracket.map((match) => {
          const pred = sfPredictions[match.matchNumber];
          if (!pred) return null;
          
          const homeScore = pred.home_score;
          const awayScore = pred.away_score;
          const isDraw = homeScore === awayScore;
          
          // Determine winner
          let winnerId: string | null = null;
          if (homeScore > awayScore) {
            winnerId = match.homeTeam.id;
          } else if (awayScore > homeScore) {
            winnerId = match.awayTeam.id;
          } else if (pred.predicted_winner_id) {
            winnerId = pred.predicted_winner_id;
          }
          
          const homeWon = winnerId === match.homeTeam.id;
          const awayWon = winnerId === match.awayTeam.id;
          const homeLost = !homeWon && !isDraw;
          const awayLost = !awayWon && !isDraw;
          
          return (
            <View key={match.matchNumber} style={styles.matchCard}>
              <Text style={styles.matchNumber}>Game #{match.matchNumber}</Text>
              
              <View style={styles.matchContent}>
                {/* Home Team */}
                <View style={[
                  styles.teamSection, 
                  homeWon && styles.winnerTeam, 
                  homeLost && styles.loserTeam
                ]}>
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
                  <Text style={styles.teamSource}>{match.homeTeam.source}</Text>
                  <Text style={styles.score}>{homeScore}</Text>
                  {homeWon && <Text style={styles.advanceText}>→ Final</Text>}
                  {homeLost && <Text style={styles.bronzeText}>→ Bronze Final</Text>}
                </View>

                <Text style={styles.vsText}>vs</Text>

                {/* Away Team */}
                <View style={[
                  styles.teamSection, 
                  awayWon && styles.winnerTeam, 
                  awayLost && styles.loserTeam
                ]}>
                  <Text style={styles.score}>{awayScore}</Text>
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
                  <Text style={styles.teamSource}>{match.awayTeam.source}</Text>
                  {awayWon && <Text style={styles.advanceText}>→ Final</Text>}
                  {awayLost && <Text style={styles.bronzeText}>→ Bronze Final</Text>}
                </View>
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
        >
          <Text style={styles.continueButtonText}>Continue to Bronze Final</Text>
        </TouchableOpacity>
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
    gap: 16,
  },
  headerSection: {
    marginBottom: 8,
  },
  description: {
    color: DesignColors.text,
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 8,
  },
  matchCard: {
    backgroundColor: DesignColors.surface,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: DesignColors.surface,
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
    gap: 12,
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  winnerTeam: {
    backgroundColor: 'rgba(60, 172, 59, 0.2)',
    borderWidth: 1,
    borderColor: DesignColors.primary,
  },
  loserTeam: {
    backgroundColor: 'rgba(230, 29, 37, 0.1)',
    opacity: 0.6,
  },
  teamName: {
    color: DesignColors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 120,
  },
  teamSource: {
    color: DesignColors.text,
    fontSize: 11,
    fontWeight: '400',
    textAlign: 'center',
    opacity: 0.6,
    maxWidth: 120,
  },
  score: {
    color: DesignColors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  vsText: {
    color: DesignColors.text,
    fontSize: 18,
    fontWeight: '700',
    opacity: 0.5,
  },
  advanceText: {
    color: DesignColors.primary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  bronzeText: {
    color: '#E67E22',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  continueButton: {
    backgroundColor: DesignColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  continueButtonText: {
    color: DesignColors.textOnDark,
    fontSize: 18,
    fontWeight: '700',
  },
});
