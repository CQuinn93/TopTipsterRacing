import { useEffect, useState, useRef } from 'react';
import { router } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { IconSymbol } from '@/features/wc2026/components/IconSymbol';
import { DesignColors } from '@/features/wc2026/constants/design-colors';
import { WC2026_STORAGE_PREFIX } from '@/features/wc2026/constants/storage-keys';
import { getFixtures, type Match } from '@/features/wc2026/services/fixtures';
import { type Prediction } from '@/features/wc2026/services/predictions';
import { supabase } from '@/lib/supabase';
import { AntePostGroupTable } from '@/features/wc2026/components/ante-post-group-table';
import { AntePostFixtures } from '@/features/wc2026/components/ante-post-fixtures';
import { getGroupPredictions, saveGroupPredictions, getAntePostLockedStatus } from '@/features/wc2026/services/async-predictions';
import { generateRoundOf32 } from '@/features/wc2026/services/round-of-32-generator';
import { wcHref, wcHrefWithParams } from '@/features/wc2026/utils/href';

const ROUND_OF_32_BRACKET_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_bracket`;
const ROUND_OF_32_STANDINGS_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_standings`;
const ROUND_OF_32_ADVANCING_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_advancing`;
const ROUND_OF_32_KNOCKED_OUT_KEY = `${WC2026_STORAGE_PREFIX}round_of_32_knocked_out`;

const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export default function AntePostSelectionsScreen() {
  const insets = useSafeAreaInsets();
  const [activeGroup, setActiveGroup] = useState<string>('A');
  const [fixtures, setFixtures] = useState<Match[]>([]);
  const [allFixtures, setAllFixtures] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [localPredictions, setLocalPredictions] = useState<Record<string, { home_score: number | null; away_score: number | null }>>({});
  const [completedGroups, setCompletedGroups] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const fixturesScrollViewRef = useRef<ScrollView>(null);
  const dbPredictionsLoadedRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      await getCurrentUser();
      // Load fixtures regardless of user status (they're public)
      await loadAllFixtures();
      // Check locked status
      const locked = await getAntePostLockedStatus();
      setIsLocked(locked);
    };
    init();
  }, []);

  useEffect(() => {
    // Load predictions from AsyncStorage on mount (not from database)
    if (allFixtures.length > 0) {
      loadGroupPredictionsFromStorage();
    }
  }, [allFixtures]);

  useEffect(() => {
    // Load group data when fixtures are available AND when group changes
    // This ensures initial group loads properly when fixtures are first loaded
    if (allFixtures.length > 0) {
      loadGroupData();
    }
  }, [activeGroup, allFixtures]);

  const getCurrentUser = async () => {
    try {
      // Use session instead of getUser() to avoid duplicate auth request
      // The session is already checked in _layout.tsx, so this is just extracting user ID
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
      }
    } catch (error) {
      console.error('Error getting current user:', error);
      // Don't set loading to false here - let loadAllFixtures handle it
    }
  };

  const loadAllFixtures = async () => {
    try {
      // Only database call - get all fixtures once at startup
      const all = await getFixtures();
      setAllFixtures(all);
      // Group data will be loaded automatically by useEffect when allFixtures is set
    } catch (error) {
      console.error('Error loading all fixtures:', error);
      setLoading(false);
    }
  };

  // Load predictions from AsyncStorage (not database)
  const loadGroupPredictionsFromStorage = async () => {
    try {
      const asyncPredictions = await getGroupPredictions();

      // If there are no local predictions (e.g. after final submission cleared AsyncStorage),
      // try to load them from the database so locked users can still view their picks.
      if (Object.keys(asyncPredictions).length === 0) {
        // Only hit the database once per mount
        if (userId && !dbPredictionsLoadedRef.current) {
          try {
            const { getUserPredictions } = await import('@/features/wc2026/services/predictions');
            const dbPredictions = await getUserPredictions(userId);

            // Filter to group-stage ante_post predictions that have a match_id
            const groupAntePostPreds = dbPredictions.filter(
              (p) => p.prediction_type === 'ante_post' && p.match_id !== null
            );

            const localMap: Record<string, { home_score: number | null; away_score: number | null }> = {};
            const dbMap: Record<string, Prediction> = {};

            groupAntePostPreds.forEach((p) => {
              const matchId = p.match_id as string;
              dbMap[matchId] = p;
              localMap[matchId] = {
                home_score: p.home_score,
                away_score: p.away_score,
              };
            });

            setPredictions(dbMap);
            setLocalPredictions(localMap);
            dbPredictionsLoadedRef.current = true;
          } catch (dbError) {
            console.error('Error loading group predictions from database:', dbError);
          }
        }

        // Either we just loaded from DB or there's nothing to show yet;
        // in both cases, don't overwrite any existing state.
        return;
      }

      // Convert AsyncStorage format to local predictions format
      const localMap: Record<string, { home_score: number | null; away_score: number | null }> = {};

      Object.entries(asyncPredictions).forEach(([matchId, pred]) => {
        localMap[matchId] = {
          home_score: pred.home_score,
          away_score: pred.away_score,
        };
      });

      setLocalPredictions(localMap);
    } catch (error) {
      console.error('Error loading predictions from AsyncStorage:', error);
    }
  };

  const loadGroupData = async () => {
    try {
      setLoading(true);
      // Filter fixtures from already-loaded allFixtures (no database call)
      if (allFixtures.length > 0) {
        const groupFixtures = allFixtures.filter(
          (f) => f.group?.group_name === activeGroup
        );
        groupFixtures.sort((a, b) => (a.match_number || 0) - (b.match_number || 0));
        setFixtures(groupFixtures);
        
        // Load predictions from AsyncStorage for this group
        await loadGroupPredictionsFromStorage();
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading group data:', error);
      setLoading(false);
    }
  };

  const loadUserPredictions = async () => {
    // No longer loading from database - all predictions are in AsyncStorage
    // This function is kept for compatibility but now just loads from AsyncStorage
    await loadGroupPredictionsFromStorage();
  };

  const checkGroupCompletion = () => {
    if (allFixtures.length === 0) return;

    const completed = new Set<string>();
    
    GROUPS.forEach((group) => {
      // Get fixtures for this group from all fixtures
      const groupMatches = allFixtures.filter((f) => f.group?.group_name === group);
      
      // Check if all matches in this group have predictions with scores (0-0 is allowed)
      const allHavePredictions = groupMatches.length > 0 && groupMatches.every((match) => {
        const localPred = localPredictions[match.id];
        const savedPred = predictions[match.id];
        const pred = localPred || savedPred;
        
        if (!pred) return false;
        
        const homeScore = localPred?.home_score ?? savedPred?.home_score;
        const awayScore = localPred?.away_score ?? savedPred?.away_score;
        
        return (homeScore !== null && homeScore !== undefined && typeof homeScore === 'number') &&
               (awayScore !== null && awayScore !== undefined && typeof awayScore === 'number');
      });
      
      if (allHavePredictions) {
        completed.add(group);
      }
    });
    
    setCompletedGroups(completed);
  };

  useEffect(() => {
    if (allFixtures.length > 0) {
      checkGroupCompletion();
    }
  }, [localPredictions, predictions, allFixtures]);

  // Merge local predictions with saved predictions for display
  const getMergedPredictions = (): Record<string, Prediction> => {
    const merged: Record<string, Prediction> = { ...predictions };
    
    // Override with local predictions where they exist
    Object.keys(localPredictions).forEach((matchId) => {
      const localPred = localPredictions[matchId];
      const existingPred = predictions[matchId];
      
      merged[matchId] = {
        ...(existingPred || {
          id: '',
          user_id: userId || '',
          match_id: matchId,
          prediction_type: 'ante_post' as const,
          home_score: null,
          away_score: null,
          predicted_winner_id: null,
          points_awarded: null,
          is_correct: null,
          created_at: '',
          updated_at: '',
        }),
        home_score: localPred.home_score,
        away_score: localPred.away_score,
      };
    });
    
    return merged;
  };

  // Handle score changes locally (updates table in real-time)
  const handleScoreChange = (matchId: string, homeScore: number | null, awayScore: number | null) => {
    if (isLocked) return; // Prevent changes when locked
    setLocalPredictions((prev) => ({
      ...prev,
      [matchId]: { home_score: homeScore, away_score: awayScore },
    }));
  };

  // Save all predictions for the active group to AsyncStorage
  const handleSaveGroup = async () => {
    if (isLocked) return; // Prevent saving when locked
    // Get all matches for the active group
    const groupMatches = fixtures.filter((f) => f.group?.group_name === activeGroup);
    
    // Check if all matches have predictions (0-0 is allowed)
    const allHavePredictions = groupMatches.every((match) => {
      const localPred = localPredictions[match.id];
      return localPred &&
             localPred.home_score !== null &&
             localPred.home_score !== undefined &&
             localPred.away_score !== null &&
             localPred.away_score !== undefined &&
             typeof localPred.home_score === 'number' &&
             typeof localPred.away_score === 'number';
    });

    if (!allHavePredictions) {
      alert('Please enter predictions for all matches in this group before saving.');
      return;
    }

    setSaving(true);
    try {
      // Import async predictions service
      const { saveGroupPredictions, getGroupPredictions } = await import('@/features/wc2026/services/async-predictions');
      
      // Get existing predictions
      const existingPredictions = await getGroupPredictions();
      
      // Update with new predictions for this group
      const updatedPredictions: Record<string, { match_id: string; home_score: number; away_score: number }> = {
        ...existingPredictions,
      };
      
      groupMatches.forEach((match) => {
        const localPred = localPredictions[match.id];
        if (localPred && 
            localPred.home_score !== null && 
            localPred.home_score !== undefined &&
            typeof localPred.home_score === 'number' &&
            localPred.away_score !== null && 
            localPred.away_score !== undefined &&
            typeof localPred.away_score === 'number') {
          updatedPredictions[match.id] = {
            match_id: match.id,
            home_score: localPred.home_score,
            away_score: localPred.away_score,
          };
        }
      });

      // Save to AsyncStorage
      await saveGroupPredictions(updatedPredictions);

      // Update local state to show saved status
      const updatedLocalPredictions = { ...predictions };
      groupMatches.forEach((match) => {
        const localPred = localPredictions[match.id];
        if (localPred) {
          updatedLocalPredictions[match.id] = {
            home_score: localPred.home_score,
            away_score: localPred.away_score,
          } as any;
        }
      });
      setPredictions(updatedLocalPredictions);

      // Re-check completion
      checkGroupCompletion();
      
      alert(`Group ${activeGroup} predictions saved! You can continue editing until you submit your final ante post selections.`);
    } catch (error) {
      console.error('Error saving group predictions:', error);
      alert('Error saving predictions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Handle confirmation to move to knockout stages
  const handleConfirmAllGroups = async () => {
    if (isLocked) return; // Prevent navigation when locked
    // Load predictions from AsyncStorage
    const { getGroupPredictions } = await import('@/features/wc2026/services/async-predictions');
    const asyncPredictions = await getGroupPredictions();
    
    // Check if all groups have saved predictions (0-0 is allowed)
    const allGroupsHaveSavedPredictions = GROUPS.every((group) => {
      const groupMatches = allFixtures.filter((f) => f.group?.group_name === group);
      return groupMatches.every((match) => {
        const pred = asyncPredictions[match.id] || predictions[match.id];
        return pred &&
               pred.home_score !== null &&
               pred.home_score !== undefined &&
               typeof pred.home_score === 'number' &&
               pred.away_score !== null &&
               pred.away_score !== undefined &&
               typeof pred.away_score === 'number';
      });
    });

    if (!allGroupsHaveSavedPredictions) {
      alert('Please save all group predictions before proceeding to knockout stages.');
      return;
    }

    // Show confirmation dialog
    Alert.alert(
      'Continue to Round of 32',
      'Your group stage predictions will be used to generate the Round of 32 fixtures. You can still edit them later until you submit your final ante post selections.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Continue',
          style: 'default',
          onPress: async () => {
            try {
              // Show loading state
              Alert.alert(
                'Calculating Round of 32',
                'Generating Round of 32 fixtures based on your predictions...',
                [],
                { cancelable: false }
              );
              
              // Convert AsyncStorage predictions to full Prediction format needed by generateRoundOf32
              const predictionsForCalculation: Record<string, Prediction> = {};
              Object.entries(asyncPredictions).forEach(([matchId, pred]) => {
                predictionsForCalculation[matchId] = {
                  id: '',
                  user_id: userId || '',
                  match_id: matchId,
                  match_number: null,
                  prediction_type: 'ante_post' as const,
                  home_score: pred.home_score,
                  away_score: pred.away_score,
                  predicted_winner_id: null,
                  points_awarded: null,
                  is_correct: null,
                  created_at: '',
                  updated_at: '',
                };
              });
              
              // Calculate Round of 32 bracket
              const result = await generateRoundOf32(allFixtures, predictionsForCalculation);
              
              // Determine advancing and knocked out teams
              const advancing = new Set<string>();
              const knockedOut = new Set<string>();
              
              // Collect all third-place team IDs first
              const allThirdPlace = new Set<string>();
              Object.values(result.groupStandings).forEach((standings) => {
                standings.forEach((team) => {
                  if (team.position === 1 || team.position === 2) {
                    advancing.add(team.teamId);
                  } else if (team.position === 3) {
                    allThirdPlace.add(team.teamId);
                  } else if (team.position === 4) {
                    knockedOut.add(team.teamId);
                  }
                });
              });
              
              // Add best 8 third-place teams to advancing
              const bestThirdPlaceIds = new Set(result.bestThirdPlace.map((t) => t.teamId));
              bestThirdPlaceIds.forEach((id) => advancing.add(id));
              
              // Mark remaining third-place teams as knocked out
              allThirdPlace.forEach((id) => {
                if (!bestThirdPlaceIds.has(id)) {
                  knockedOut.add(id);
                }
              });
              
              // Store data in AsyncStorage for persistence
              try {
                await AsyncStorage.setItem(ROUND_OF_32_STANDINGS_KEY, JSON.stringify(result.groupStandings));
                await AsyncStorage.setItem(ROUND_OF_32_ADVANCING_KEY, JSON.stringify(Array.from(advancing)));
                await AsyncStorage.setItem(ROUND_OF_32_KNOCKED_OUT_KEY, JSON.stringify(Array.from(knockedOut)));
                await AsyncStorage.setItem(`${WC2026_STORAGE_PREFIX}round_of_32_third_place`, JSON.stringify(result.bestThirdPlace));
              } catch (error) {
                console.error('Error storing Round of 32 data:', error);
              }
              
              // Navigate to results screen (bracket will be generated after user reviews/orders third-place teams)
              router.push(
                wcHrefWithParams('/(wc2026)/round-of-32-results', {
                  groupStandings: JSON.stringify(result.groupStandings),
                  advancingTeams: JSON.stringify(Array.from(advancing)),
                  knockedOutTeams: JSON.stringify(Array.from(knockedOut)),
                  bestThirdPlace: JSON.stringify(result.bestThirdPlace),
                })
              );
            } catch (error) {
              console.error('Error generating Round of 32:', error);
              Alert.alert('Error', 'Failed to calculate Round of 32 bracket. Please try again.');
            }
          },
        },
      ]
    );
  };

  const allGroupsCompleted = completedGroups.size === GROUPS.length;

  // Check if there are unsaved predictions
  const hasUnsavedPredictions = () => {
    const groupMatches = fixtures.filter((f) => f.group?.group_name === activeGroup);
    return groupMatches.some((match) => {
      const localPred = localPredictions[match.id];
      const savedPred = predictions[match.id];
      
      // Check if local prediction exists and differs from saved
      if (localPred && typeof localPred === 'object' && 'home_score' in localPred && 'away_score' in localPred) {
        const localHomeScore = localPred?.home_score ?? null;
        const localAwayScore = localPred?.away_score ?? null;
        const savedHomeScore = savedPred?.home_score ?? null;
        const savedAwayScore = savedPred?.away_score ?? null;
        
        const localHasScore = localHomeScore !== null && localAwayScore !== null;
        const savedHasScore = savedHomeScore !== null && savedAwayScore !== null;
        
        // If local has score but saved doesn't, or scores differ, there are unsaved changes
        if (localHasScore && !savedHasScore) {
          return true;
        }
        if (localHasScore && savedHasScore) {
          return localHomeScore !== savedHomeScore || 
                 localAwayScore !== savedAwayScore;
        }
      }
      return false;
    });
  };

  // Handle back button with warning
  const handleBackPress = () => {
    if (hasUnsavedPredictions()) {
      Alert.alert(
        'Unsaved Predictions',
        'You have unsaved predictions that will be lost if you go back. Are you sure you want to continue?',
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

  return (
    <View style={styles.container}>
      {/* Simple Back Button */}
      <View style={[styles.backButtonContainer, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackPress}
        >
          <IconSymbol name="chevron.left" size={24} color={DesignColors.text} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Ante Post</Text>
          <Text style={styles.headerSubtitle}>Group Stage</Text>
          {(() => {
            const groupMatches = fixtures.filter((f) => f.group?.group_name === activeGroup);
            const completedCount = groupMatches.filter((match) => {
              const localPred = localPredictions[match.id];
              const savedPred = predictions[match.id];
              const pred = localPred || savedPred;
              if (!pred) return false;
              const homeScore = localPred?.home_score ?? savedPred?.home_score;
              const awayScore = localPred?.away_score ?? savedPred?.away_score;
              return (homeScore !== null && homeScore !== undefined && typeof homeScore === 'number') &&
                     (awayScore !== null && awayScore !== undefined && typeof awayScore === 'number');
            }).length;
            return (
              <Text style={styles.progressText}>
                {completedCount} of {groupMatches.length} matches completed
              </Text>
            );
          })()}
        </View>
        <View style={styles.backButtonSpacer} />
      </View>

      {/* Group Tabs */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.tabsContainer}
        contentContainerStyle={styles.tabsContent}
      >
        {GROUPS.map((group) => (
          <TouchableOpacity
            key={group}
            style={[
              styles.tab,
              activeGroup === group && styles.activeTab,
            ]}
            onPress={() => setActiveGroup(group)}
          >
            <Text
              style={[
                styles.tabText,
                activeGroup === group && styles.activeTabText,
              ]}
            >
              Group {group}
            </Text>
            {completedGroups.has(group) && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.content}>

        {/* Group Table and Fixtures */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.keyboardAvoidingView}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? -120 : 0}
          >
            <View style={styles.mainContent}>
              {/* All Groups Completed Message - Above Tables */}
              {allGroupsCompleted && (
                <View style={styles.completionMessage}>
                  <Text style={styles.completionTitle}>All group stage predictions made</Text>
                  <Text style={styles.completionText}>
                    Select "Continue to next stage" below to proceed to the Knockout Round of 32.
                  </Text>
                </View>
              )}

              {/* Group Table - Fixed */}
              <View style={styles.tableSection}>
                <AntePostGroupTable
                  key={`table-${activeGroup}`}
                  groupName={activeGroup}
                  fixtures={fixtures}
                  predictions={getMergedPredictions()}
                />
              </View>

              {/* Fixtures - Scrollable */}
              <ScrollView
                ref={fixturesScrollViewRef}
                style={styles.fixturesScrollView}
                contentContainerStyle={styles.fixturesScrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={true}
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios' ? true : false}
              >
                <AntePostFixtures
                  fixtures={fixtures}
                  predictions={getMergedPredictions()}
                  onScoreChange={handleScoreChange}
                  disabled={isLocked}
                  scrollViewRef={fixturesScrollViewRef}
                />

                {/* Locked Message */}
                {isLocked && (
                  <View style={styles.lockedMessage}>
                    <Text style={styles.lockedMessageText}>
                      Predictions submitted and locked. You can view but not edit.
                    </Text>
                  </View>
                )}

                {/* Save Group Button */}
                <TouchableOpacity
                  style={[
                    styles.saveGroupButton,
                    (saving || isLocked) && styles.saveGroupButtonDisabled
                  ]}
                  onPress={handleSaveGroup}
                  disabled={saving || isLocked}
                >
                  <Text style={styles.saveGroupButtonText}>
                    {saving ? 'Saving...' : `Save Group ${activeGroup} Predictions`}
                  </Text>
                </TouchableOpacity>

                {/* Continue to Next Stage Button - Only show when all groups completed */}
                {allGroupsCompleted && !isLocked && (
                  <TouchableOpacity
                    style={styles.continueButton}
                    onPress={handleConfirmAllGroups}
                  >
                    <Text style={styles.continueButtonText}>Continue to next stage</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: DesignColors.surface,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingVertical: 8,
    minWidth: 80,
  },
  backButtonText: {
    color: DesignColors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  backButtonSpacer: {
    minWidth: 80,
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
  progressText: {
    color: DesignColors.primary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
  },
  content: {
    flex: 1,
  },
  tabsContainer: {
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: DesignColors.surface,
    backgroundColor: '#FFFFFF',
  },
  tabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: DesignColors.surface,
    marginRight: 8,
    gap: 6,
  },
  activeTab: {
    backgroundColor: DesignColors.primary,
  },
  tabText: {
    color: DesignColors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  activeTabText: {
    color: DesignColors.textOnDark,
  },
  checkmark: {
    color: DesignColors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
  },
  tableSection: {
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: DesignColors.surface,
    backgroundColor: '#FFFFFF',
  },
  fixturesScrollView: {
    flex: 1,
  },
  fixturesScrollContent: {
    padding: 20,
    paddingBottom: 100, // Extra padding for keyboard
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: DesignColors.text,
    fontSize: 16,
  },
  saveGroupButton: {
    backgroundColor: DesignColors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  saveGroupButtonDisabled: {
    opacity: 0.6,
  },
  lockedMessage: {
    backgroundColor: DesignColors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: DesignColors.primary,
  },
  lockedMessageText: {
    color: DesignColors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  saveGroupButtonText: {
    color: DesignColors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
  completionMessage: {
    backgroundColor: DesignColors.primary,
    borderRadius: 18,
    padding: 20,
    margin: 20,
    marginBottom: 0,
    alignItems: 'center',
    gap: 8,
  },
  completionTitle: {
    color: DesignColors.textOnDark,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  completionText: {
    color: DesignColors.textOnDark,
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    opacity: 0.9,
  },
  continueButton: {
    backgroundColor: DesignColors.actionButton,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  continueButtonText: {
    color: DesignColors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
  },
});
