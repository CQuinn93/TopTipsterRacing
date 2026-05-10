import { useEffect, useState, useRef } from 'react';
import { Alert } from 'react-native';
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
import { AntePostGroupTable } from '@/features/wc2026/components/ante-post-group-table';
import { type Match } from '@/features/wc2026/services/fixtures';
import { type Prediction } from '@/features/wc2026/services/predictions';
import { type FinalGroupStanding } from '@/features/wc2026/services/group-standings';
import { type ThirdPlaceTeam } from '@/features/wc2026/services/third-place-ranking';
import { generateRoundOf32Bracket } from '@/features/wc2026/services/knockout-bracket';
import { wcHref, wcHrefWithParams } from '@/features/wc2026/utils/href';

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
const ROUND_OF_32_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_bracket`;
const ROUND_OF_32_STANDINGS_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_standings`;
const ROUND_OF_32_ADVANCING_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_advancing`;
const ROUND_OF_32_KNOCKED_OUT_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_knocked_out`;
const ROUND_OF_32_THIRD_PLACE_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_third_place`;

interface RouteParams {
  groupStandings?: string; // JSON stringified
  advancingTeams?: string; // JSON stringified team IDs
  knockedOutTeams?: string; // JSON stringified team IDs
  bestThirdPlace?: string; // JSON stringified ThirdPlaceTeam[]
}

export default function RoundOf32ResultsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams() as RouteParams;
  const [groupStandings, setGroupStandings] = useState<Record<string, FinalGroupStanding[]>>({});
  const [advancingTeams, setAdvancingTeams] = useState<Set<string>>(new Set());
  const [knockedOutTeams, setKnockedOutTeams] = useState<Set<string>>(new Set());
  const [bestThirdPlace, setBestThirdPlace] = useState<ThirdPlaceTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (initializedRef.current) return;
    
    const loadData = async () => {
      initializedRef.current = true;
      try {
        // Try to load from params first
        if (params.groupStandings) {
          const standings = JSON.parse(params.groupStandings);
          setGroupStandings(standings);
          
          // Parse advancing and knocked out teams from params
          const advancing = new Set<string>();
          const knockedOut = new Set<string>();
          
          if (params.advancingTeams) {
            const advancingIds = JSON.parse(params.advancingTeams);
            advancingIds.forEach((id: string) => advancing.add(id));
          }
          if (params.knockedOutTeams) {
            const knockedOutIds = JSON.parse(params.knockedOutTeams);
            knockedOutIds.forEach((id: string) => knockedOut.add(id));
          }
          
          // Load third-place teams
          if (params.bestThirdPlace) {
            const thirdPlace = JSON.parse(params.bestThirdPlace);
            setBestThirdPlace(thirdPlace);
          }
          
          setAdvancingTeams(advancing);
          setKnockedOutTeams(knockedOut);
        } else {
          // Try to load from AsyncStorage if params not available
          const storedStandings = await AsyncStorage.getItem(ROUND_OF_32_STANDINGS_KEY);
          const storedAdvancing = await AsyncStorage.getItem(ROUND_OF_32_ADVANCING_KEY);
          const storedKnockedOut = await AsyncStorage.getItem(ROUND_OF_32_KNOCKED_OUT_KEY);
          
          if (storedStandings) {
            setGroupStandings(JSON.parse(storedStandings));
          }
          
          if (storedAdvancing) {
            const advancing = new Set<string>();
            JSON.parse(storedAdvancing).forEach((id: string) => advancing.add(id));
            setAdvancingTeams(advancing);
          }
          
          if (storedKnockedOut) {
            const knockedOut = new Set<string>();
            JSON.parse(storedKnockedOut).forEach((id: string) => knockedOut.add(id));
            setKnockedOutTeams(knockedOut);
          }
          
          // Load third-place teams from storage
          const storedThirdPlace = await AsyncStorage.getItem(ROUND_OF_32_THIRD_PLACE_KEY);
          if (storedThirdPlace) {
            setBestThirdPlace(JSON.parse(storedThirdPlace));
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [params.groupStandings, params.advancingTeams, params.knockedOutTeams]);

  // Removed handleReorderThirdPlace - no longer needed with matrix-based assignments

  const handleContinue = async () => {
    // Generate bracket using combination matrix
    if (!params.groupStandings || bestThirdPlace.length === 0) {
      Alert.alert('Error', 'Missing data. Please go back and confirm your predictions again.');
      return;
    }
    
    try {
      const standings = JSON.parse(params.groupStandings);
      
      // Generate bracket using FIFA combination matrix (no manual ordering needed)
      const bracket = generateRoundOf32Bracket(standings, bestThirdPlace);
      
      // Store bracket
      await AsyncStorage.setItem(ROUND_OF_32_BRACKET_KEY, JSON.stringify(bracket));
      
      // Navigate to Round of 32 predictions screen with bracket data
      router.push(
        wcHrefWithParams('/(wc2026)/round-of-32-predictions', {
          bracket: JSON.stringify(bracket),
          groupStandings: params.groupStandings || '',
          advancingTeams: params.advancingTeams || '',
        })
      );
    } catch (error) {
      console.error('Error generating bracket:', error);
      Alert.alert('Error', 'Failed to generate Round of 32 bracket. Please try again.');
    }
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
          <View style={styles.backButton} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={DesignColors.primary} />
          <Text style={styles.loadingText}>Generating Round of 32 fixtures based on your predictions...</Text>
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
          <Text style={styles.headerSubtitle}>Final standings from Group Stage</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Teams Advancing to Round of 32</Text>
        <Text style={styles.description}>
          Teams highlighted in green have advanced. Teams highlighted in red have been eliminated.
        </Text>

        {GROUPS.map((groupName) => {
          const standings = groupStandings[groupName] || [];
          // For display, we need to create mock fixtures and predictions
          // Since we're just showing the table, we can pass empty arrays
          const mockFixtures: Match[] = [];
          const mockPredictions: Record<string, Prediction> = {};

          if (standings.length === 0) return null;

          return (
            <View key={groupName} style={styles.groupContainer}>
              <Text style={styles.groupTitle}>Group {groupName}</Text>
              <View style={styles.tableWrapper}>
                <AntePostGroupTable
                  groupName={groupName}
                  fixtures={mockFixtures}
                  predictions={mockPredictions}
                  standings={standings}
                  advancingTeams={advancingTeams}
                  knockedOutTeams={knockedOutTeams}
                />
              </View>
            </View>
          );
        })}

        {/* Third-place table removed - match assignments now use FIFA combination matrix */}

        <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
          <Text style={styles.continueButtonText}>Continue to Round of 32 Predictions</Text>
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
    fontSize: 16,
    fontWeight: '600',
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
    gap: 16,
  },
  loadingText: {
    color: DesignColors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  sectionTitle: {
    color: DesignColors.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    color: DesignColors.text,
    fontSize: 14,
    marginBottom: 24,
    opacity: 0.7,
  },
  groupContainer: {
    marginBottom: 24,
  },
  groupTitle: {
    color: DesignColors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  tableWrapper: {
    position: 'relative',
  },
  continueButton: {
    backgroundColor: DesignColors.actionButton,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 24,
  },
  continueButtonText: {
    color: DesignColors.textOnDark,
    fontSize: 18,
    fontWeight: '700',
  },
  
  headerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
});
