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
import { generateSemiFinalsBracket } from '@/features/wc2026/services/knockout-bracket';
import { wcHref, wcHrefWithParams } from '@/features/wc2026/utils/href';

const QUARTER_FINALS_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}quarter_finals_bracket`;
const QUARTER_FINALS_PREDICTIONS_FOR_SF_KEY = `${WC2026_STORAGE_PREFIX}quarter_finals_predictions_for_sf`;
const SEMI_FINALS_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}semi_finals_bracket`;

interface RouteParams {
  bracket?: string; // JSON stringified Quarter Finals bracket
  predictions?: string; // JSON stringified Quarter Finals predictions
}

export default function SemiFinalsResultsScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams() as RouteParams;
  const [qfBracket, setQfBracket] = useState<KnockoutMatch[]>([]);
  const [qfPredictions, setQfPredictions] = useState<Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }>>({});
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
          bracketData = (await AsyncStorage.getItem(QUARTER_FINALS_BRACKET_KEY)) ?? undefined;
        }
        if (!predictionsData) {
          predictionsData = (await AsyncStorage.getItem(QUARTER_FINALS_PREDICTIONS_FOR_SF_KEY)) ?? undefined;
        }
        
        if (bracketData && predictionsData) {
          const bracket = JSON.parse(bracketData);
          const predictions = JSON.parse(predictionsData);
          setQfBracket(bracket);
          setQfPredictions(predictions);
        } else {
          // Fallback: try loading from saved QF predictions
          const { getQFPredictions } = await import('@/features/wc2026/services/async-predictions');
          const savedPredictions = await getQFPredictions();
          if (Object.keys(savedPredictions).length > 0) {
            const storedBracket = await AsyncStorage.getItem(QUARTER_FINALS_BRACKET_KEY);
            if (storedBracket) {
              setQfBracket(JSON.parse(storedBracket));
              const formatted: Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }> = {};
              Object.entries(savedPredictions).forEach(([matchNumStr, pred]) => {
                formatted[parseInt(matchNumStr, 10)] = {
                  home_score: pred.home_score,
                  away_score: pred.away_score,
                  predicted_winner_id: pred.predicted_winner_id,
                };
              });
              setQfPredictions(formatted);
            }
          }
        }
      } catch (error) {
        console.error('Error loading Quarter Finals data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const styles = useKnockoutResultsScreenStyles();

  const handleContinue = () => {
    // Generate Semi Finals bracket and navigate to predictions
    const sfBracket = generateSemiFinalsBracket(qfPredictions, qfBracket);
    
    // Store for Semi Finals predictions
    AsyncStorage.setItem(SEMI_FINALS_BRACKET_KEY, JSON.stringify(sfBracket));
    
    router.push(
      wcHrefWithParams('/(wc2026)/semi-finals-predictions', {
        bracket: JSON.stringify(sfBracket),
      })
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <WcKnockoutResultsHeader subtitle="Quarter Finals results" onBack={() => router.back()} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
          <Text style={styles.loadingText}>Loading results...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WcKnockoutResultsHeader subtitle="Quarter Finals results" onBack={() => router.back()} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerSection}>
          <Text style={styles.description}>
            Quarter Finals results based on your predictions.
          </Text>
        </View>

        {/* Collect advancing and knocked out teams */}
        {(() => {
          const advancingTeams: Array<{ id: string; code: string; name: string }> = [];
          const knockedOutTeams: Array<{ id: string; code: string; name: string }> = [];
          
          qfBracket.forEach((match) => {
            const pred = qfPredictions[match.matchNumber];
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
                  <Text style={styles.sectionHeaderTitle}>Teams Advancing to Semi Finals</Text>
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
          <Text style={styles.continueButtonText}>Continue to Semi Finals</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
