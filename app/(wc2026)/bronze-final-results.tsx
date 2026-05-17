import { useEffect, useState, useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '@/contexts/ThemeContext';
import { WcKnockoutResultsHeader } from '@/features/wc2026/components/WcKnockoutResultsHeader';
import { useKnockoutResultsScreenStyles } from '@/features/wc2026/components/useKnockoutResultsScreenStyles';
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
  const theme = useTheme();
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

  const styles = useKnockoutResultsScreenStyles();

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
        <WcKnockoutResultsHeader subtitle="Semi Finals results" onBack={() => router.back()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading results...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WcKnockoutResultsHeader subtitle="Semi Finals results" onBack={() => router.back()} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerSection}>
          <Text style={styles.description}>
            Semi Finals results based on your predictions. Winners advance to the Final. Losers play in the Bronze Final.
          </Text>
        </View>

        <View style={styles.matchesResultsGrid}>
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
            <View key={match.matchNumber} style={[styles.matchCard, styles.matchCardInGrid]}>
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
        </View>

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
