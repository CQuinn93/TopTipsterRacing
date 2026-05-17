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
import { generateRoundOf16Bracket } from '@/features/wc2026/services/knockout-bracket';
import { wcHref, wcHrefWithParams } from '@/features/wc2026/utils/href';

const ROUND_OF_32_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_bracket`;
const ROUND_OF_32_PREDICTIONS_FOR_R16_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_predictions_for_r16`;
const ROUND_OF_16_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}round_of_16_bracket`;

interface RouteParams {
  bracket?: string; // JSON stringified Round of 32 bracket
  predictions?: string; // JSON stringified Round of 32 predictions
}

export default function RoundOf16ResultsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams() as RouteParams;
  const [r32Bracket, setR32Bracket] = useState<KnockoutMatch[]>([]);
  const [r32Predictions, setR32Predictions] = useState<Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }>>({});
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
          bracketData = (await AsyncStorage.getItem(ROUND_OF_32_BRACKET_KEY)) ?? undefined;
        }
        if (!predictionsData) {
          predictionsData = (await AsyncStorage.getItem(ROUND_OF_32_PREDICTIONS_FOR_R16_KEY)) ?? undefined;
        }
        
        if (bracketData && predictionsData) {
          const bracket = JSON.parse(bracketData);
          const predictions = JSON.parse(predictionsData);
          setR32Bracket(bracket);
          setR32Predictions(predictions);
        } else {
          // Fallback: try loading from saved R32 predictions
          const { getR32Predictions } = await import('@/features/wc2026/services/async-predictions');
          const savedPredictions = await getR32Predictions();
          if (Object.keys(savedPredictions).length > 0) {
            const storedBracket = await AsyncStorage.getItem(ROUND_OF_32_BRACKET_KEY);
            if (storedBracket) {
              setR32Bracket(JSON.parse(storedBracket));
              const formatted: Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }> = {};
              Object.entries(savedPredictions).forEach(([matchNumStr, pred]) => {
                formatted[parseInt(matchNumStr, 10)] = {
                  home_score: pred.home_score,
                  away_score: pred.away_score,
                  predicted_winner_id: pred.predicted_winner_id,
                };
              });
              setR32Predictions(formatted);
            }
          }
        }
      } catch (error) {
        console.error('Error loading Round of 32 data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const styles = useKnockoutResultsScreenStyles();

  const handleContinue = () => {
    // Generate Round of 16 bracket and navigate to predictions
    const r16Bracket = generateRoundOf16Bracket(r32Predictions, r32Bracket);
    
    // Store for Round of 16 predictions
    AsyncStorage.setItem(ROUND_OF_16_BRACKET_KEY, JSON.stringify(r16Bracket));
    
    router.push(
      wcHrefWithParams('/(wc2026)/round-of-16-predictions', {
        bracket: JSON.stringify(r16Bracket),
      })
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <WcKnockoutResultsHeader subtitle="Round of 32 results" onBack={() => router.back()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading results...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WcKnockoutResultsHeader subtitle="Round of 32 results" onBack={() => router.back()} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerSection}>
          <Text style={styles.description}>
            Round of 32 results based on your predictions.
          </Text>
        </View>

        {/* Collect advancing and knocked out teams */}
        {(() => {
          const advancingTeams: Array<{ id: string; code: string; name: string }> = [];
          const knockedOutTeams: Array<{ id: string; code: string; name: string }> = [];
          
          r32Bracket.forEach((match) => {
            const pred = r32Predictions[match.matchNumber];
            if (!pred) return;
            
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
            
            if (winnerId) {
              // Add winner to advancing
              const winner = winnerId === match.homeTeam.id ? match.homeTeam : match.awayTeam;
              advancingTeams.push({ id: winner.id, code: winner.code, name: winner.name });
              
              // Add loser to knocked out
              const loser = winnerId === match.homeTeam.id ? match.awayTeam : match.homeTeam;
              knockedOutTeams.push({ id: loser.id, code: loser.code, name: loser.name });
            }
          });
          
          return (
            <>
              {/* Teams Advancing Section */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderIndicator} />
                  <Text style={styles.sectionHeaderTitle}>Teams Advancing to Round of 16</Text>
                </View>
                <View style={styles.teamsGrid}>
                  {advancingTeams.map((team) => (
                    <View key={team.id} style={styles.teamBadge}>
                      <CountryFlag
                        countryCode={team.code}
                        countryName={team.name}
                        flagSize={40}
                        showName={false}
                        align="center"
                      />
                      <Text style={styles.teamBadgeName} numberOfLines={2} ellipsizeMode="tail">
                        {team.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Teams Knocked Out Section */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={[styles.sectionHeaderIndicator, styles.sectionHeaderIndicatorRed]} />
                  <Text style={styles.sectionHeaderTitle}>Teams Knocked Out</Text>
                </View>
                <View style={styles.teamsGrid}>
                  {knockedOutTeams.map((team) => (
                    <View key={team.id} style={[styles.teamBadge, styles.teamBadgeKnockedOut]}>
                      <CountryFlag
                        countryCode={team.code}
                        countryName={team.name}
                        flagSize={40}
                        showName={false}
                        align="center"
                      />
                      <Text style={[styles.teamBadgeName, styles.teamBadgeNameKnockedOut]} numberOfLines={2} ellipsizeMode="tail">
                        {team.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          );
        })()}

        <TouchableOpacity
          style={styles.continueButton}
          onPress={handleContinue}
        >
          <Text style={styles.continueButtonText}>Continue to Round of 16</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
