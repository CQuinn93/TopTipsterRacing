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
  const insets = useSafeAreaInsets();
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
            <Text style={styles.headerSubtitle}>Quarter Finals Results</Text>
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
          <Text style={styles.headerSubtitle}>Quarter Finals Results</Text>
        </View>
        <View style={styles.backButton} />
      </View>

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
                  <Text style={styles.sectionTitle}>Teams Advancing to Semi Finals</Text>
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
                  <Text style={styles.sectionTitle}>Teams Knocked Out</Text>
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
    paddingHorizontal: 80, // Ensure text doesn't overlap with back buttons
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
  headerSection: {
    marginBottom: 24,
  },
  description: {
    color: DesignColors.text,
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 8,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionHeaderIndicator: {
    width: 4,
    height: 24,
    backgroundColor: DesignColors.primary,
    borderRadius: 2,
  },
  sectionHeaderIndicatorRed: {
    backgroundColor: '#E61D25',
  },
  sectionTitle: {
    color: DesignColors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  teamsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
  },
  teamBadge: {
    width: '30%',
    minWidth: 100,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(60, 172, 59, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(60, 172, 59, 0.3)',
  },
  teamBadgeKnockedOut: {
    backgroundColor: 'rgba(230, 29, 37, 0.1)',
    borderColor: 'rgba(230, 29, 37, 0.3)',
    opacity: 0.7,
  },
  teamBadgeName: {
    color: DesignColors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  teamBadgeNameKnockedOut: {
    opacity: 0.8,
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
