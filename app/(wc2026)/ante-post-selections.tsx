import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
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
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [activeGroup, setActiveGroup] = useState<string>('A');
  const [fixtures, setFixtures] = useState<Match[]>([]);
  const [allFixtures, setAllFixtures] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [localPredictions, setLocalPredictions] = useState<Record<string, { home_score: number | null; away_score: number | null }>>({});
  const [completedGroups, setCompletedGroups] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const fixturesScrollViewRef = useRef<ScrollView>(null);
  const dbPredictionsLoadedRef = useRef(false);
  /** Set true after the first getFixtures() attempt finishes (success or error). */
  const fixturesFetchCompletedRef = useRef(false);
  const [fixturesError, setFixturesError] = useState<string | null>(null);

  const localPredictionsRef = useRef(localPredictions);
  const userIdRef = useRef(userId);
  const activeGroupRef = useRef(activeGroup);
  const isLockedRef = useRef(isLocked);
  const prevActiveGroupRef = useRef<string | null>(null);

  useEffect(() => {
    localPredictionsRef.current = localPredictions;
    userIdRef.current = userId;
    activeGroupRef.current = activeGroup;
    isLockedRef.current = isLocked;
  });

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
    if (allFixtures.length > 0) {
      loadGroupData();
    } else if (fixturesFetchCompletedRef.current) {
      // Important: when the DB returns zero matches, loadGroupData never ran — without this,
      // `loading` stayed true forever and the screen looked stuck on "Loading...".
      setFixtures([]);
      setLoading(false);
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
      setFixturesError(null);
      // Group data will be loaded automatically by useEffect when allFixtures is set
    } catch (error) {
      console.error('Error loading all fixtures:', error);
      setAllFixtures([]);
      const message =
        error instanceof Error ? error.message : 'Could not load fixtures from the server.';
      setFixturesError(message);
      setLoading(false);
    } finally {
      fixturesFetchCompletedRef.current = true;
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

            setPredictions((prev) => ({ ...dbMap, ...prev }));
            setLocalPredictions((prev) => ({ ...localMap, ...prev }));
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

      setLocalPredictions((prev) => ({ ...localMap, ...prev }));
    } catch (error) {
      console.error('Error loading predictions from AsyncStorage:', error);
    }
  };

  /** Persist fully scored matches for a group to AsyncStorage + Supabase (used when switching groups / leaving). */
  const persistOutgoingGroupScores = useCallback(
    async (groupLetter: string) => {
      if (isLockedRef.current || allFixtures.length === 0) return;
      const groupMatches = allFixtures.filter((f) => f.group?.group_name === groupLetter);
      if (!groupMatches.length) return;
      const lp = localPredictionsRef.current;
      const uid = userIdRef.current;

      const toSync: Array<{ match: Match; hs: number; as: number }> = [];
      for (const match of groupMatches) {
        const localPred = lp[match.id];
        if (
          !localPred ||
          localPred.home_score === null ||
          localPred.away_score === null ||
          typeof localPred.home_score !== 'number' ||
          typeof localPred.away_score !== 'number'
        ) {
          continue;
        }
        toSync.push({ match, hs: localPred.home_score, as: localPred.away_score });
      }

      if (toSync.length === 0) return;

      const { getGroupPredictions, saveGroupPredictions } = await import('@/features/wc2026/services/async-predictions');
      const existing = await getGroupPredictions();
      const updated = { ...existing };
      for (const { match, hs, as } of toSync) {
        updated[match.id] = { match_id: match.id, home_score: hs, away_score: as };
      }
      await saveGroupPredictions(updated);

      if (uid) {
        try {
          const { upsertPrediction } = await import('@/features/wc2026/services/predictions');
          await Promise.all(
            toSync.map(({ match, hs, as }) => upsertPrediction(uid, match.id, 'ante_post', hs, as, null))
          );
        } catch (e) {
          console.warn('Autosave: server sync failed for group', groupLetter, e);
        }
      }

      setPredictions((prevPred) => {
        const next = { ...prevPred };
        for (const { match, hs, as } of toSync) {
          const existingPred = next[match.id];
          next[match.id] = {
            ...(existingPred || {
              id: '',
              user_id: uid || '',
              match_id: match.id,
              prediction_type: 'ante_post' as const,
              predicted_winner_id: null,
              points_awarded: null,
              is_correct: null,
              created_at: '',
              updated_at: '',
              match_number: null,
            }),
            home_score: hs,
            away_score: as,
          };
        }
        return next;
      });
    },
    [allFixtures]
  );

  const persistRef = useRef(persistOutgoingGroupScores);
  persistRef.current = persistOutgoingGroupScores;

  useEffect(() => {
    const prev = prevActiveGroupRef.current;
    prevActiveGroupRef.current = activeGroup;
    if (prev == null) return;
    if (prev === activeGroup) return;
    if (isLocked || allFixtures.length === 0) return;
    void persistOutgoingGroupScores(prev);
  }, [activeGroup, allFixtures.length, isLocked, persistOutgoingGroupScores]);

  useEffect(() => {
    return () => {
      if (isLockedRef.current) return;
      const g = activeGroupRef.current;
      void persistRef.current(g);
    };
  }, []);

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

  // Handle confirmation to move to knockout stages
  const handleConfirmAllGroups = async () => {
    if (isLocked) return; // Prevent navigation when locked
    const { getGroupPredictions } = await import('@/features/wc2026/services/async-predictions');

    if (!isLocked) {
      await Promise.all(GROUPS.map((g) => persistOutgoingGroupScores(g)));
    }

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
      alert(
        'Please enter home and away scores for every group-stage match. Fully scored games save when you change group tab or leave this screen.'
      );
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
              if (!userId) {
                Alert.alert('Sign in required', 'You must be signed in to continue and save predictions to your account.');
                return;
              }

              Alert.alert(
                'Calculating Round of 32',
                'Generating Round of 32 fixtures based on your predictions...',
                [],
                { cancelable: false }
              );

              // Ensure every group-stage pick is on the server before bracket generation
              try {
                const { upsertPrediction } = await import('@/features/wc2026/services/predictions');
                await Promise.all(
                  Object.entries(asyncPredictions).map(([matchId, pred]) =>
                    upsertPrediction(userId, matchId, 'ante_post', pred.home_score, pred.away_score, null)
                  )
                );
              } catch (syncErr) {
                console.error('Failed to sync group predictions before R32:', syncErr);
                const msg = syncErr instanceof Error ? syncErr.message : 'Sync failed';
                Alert.alert(
                  'Could not save to server',
                  `All groups must be saved to your account before continuing. (${msg})`
                );
                return;
              }

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

  /** True if any match has only one score filled (not persisted). */
  const hasAnyPartialScore = () => {
    if (allFixtures.length === 0) return false;
    return allFixtures.some((match) => {
      const lp = localPredictions[match.id];
      if (!lp) return false;
      const h = lp.home_score;
      const a = lp.away_score;
      const hNum = h !== null && h !== undefined && typeof h === 'number';
      const aNum = a !== null && a !== undefined && typeof a === 'number';
      if (hNum && aNum) return false;
      const hTouched = h !== null && h !== undefined;
      const aTouched = a !== null && a !== undefined;
      return hTouched || aTouched;
    });
  };

  const handleBackPress = () => {
    const leave = () => {
      void persistOutgoingGroupScores(activeGroup).finally(() =>
        router.replace(wcHref('/(wc2026)/ante-post-navigation'))
      );
    };
    if (hasAnyPartialScore()) {
      Alert.alert(
        'Incomplete scores',
        'Some matches only have one score entered. Those scores are not saved. Leave anyway?',
        [
          { text: 'Stay', style: 'cancel' },
          { text: 'Leave', style: 'destructive', onPress: leave },
        ]
      );
    } else {
      leave();
    }
  };

  const headerGroupMatches = fixtures.filter((f) => f.group?.group_name === activeGroup);
  const headerCompletedCount = headerGroupMatches.filter((match) => {
    const localPred = localPredictions[match.id];
    const savedPred = predictions[match.id];
    const pred = localPred || savedPred;
    if (!pred) return false;
    const homeScore = localPred?.home_score ?? savedPred?.home_score;
    const awayScore = localPred?.away_score ?? savedPred?.away_score;
    return (
      homeScore !== null &&
      homeScore !== undefined &&
      typeof homeScore === 'number' &&
      awayScore !== null &&
      awayScore !== undefined &&
      typeof awayScore === 'number'
    );
  }).length;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.background,
        },
        headerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingBottom: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        backText: { fontFamily: theme.fontFamily.regular, color: theme.colors.accent, fontSize: 16 },
        headerCenter: { flex: 1, alignItems: 'center', minWidth: 0 },
        h1: {
          fontFamily: theme.fontFamily.regular,
          fontWeight: '700',
          fontSize: 17,
          color: theme.colors.text,
          textAlign: 'center',
        },
        progressText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '600',
          color: theme.colors.accent,
          textAlign: 'center',
          marginTop: 4,
        },
        headerSpacer: { width: 72 },
        content: {
          flex: 1,
        },
        tabsContainer: {
          maxHeight: 56,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
        tabsContent: {
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.sm,
          gap: theme.spacing.sm,
        },
        tab: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
          marginRight: theme.spacing.sm,
          gap: 6,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        activeTab: {
          backgroundColor: theme.colors.accent,
          borderColor: theme.colors.accent,
        },
        tabText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 14,
          fontWeight: '600',
        },
        activeTabText: {
          color: theme.colors.white,
        },
        checkmark: {
          fontSize: 16,
          fontWeight: '700',
        },
        checkmarkOnAccent: {
          color: theme.colors.white,
        },
        checkmarkMuted: {
          color: theme.colors.accent,
        },
        keyboardAvoidingView: {
          flex: 1,
        },
        mainContent: {
          flex: 1,
        },
        tableSection: {
          padding: theme.spacing.sm,
          paddingBottom: theme.spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
        fixturesScrollView: {
          flex: 1,
        },
        fixturesScrollContent: {
          padding: theme.spacing.sm,
          paddingBottom: 100 + insets.bottom,
          gap: theme.spacing.sm,
        },
        loadingContainer: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: theme.spacing.lg,
        },
        loadingText: {
          marginTop: theme.spacing.md,
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.textSecondary,
        },
        emptyStateContainer: {
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.xl,
        },
        emptyStateTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 18,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
          textAlign: 'center',
        },
        emptyStateBody: {
          fontFamily: theme.fontFamily.light,
          fontSize: 14,
          lineHeight: 22,
          color: theme.colors.textSecondary,
          textAlign: 'left',
        },
        lockedMessage: {
          backgroundColor: theme.colors.surface,
          padding: theme.spacing.md,
          borderRadius: theme.radius.md,
          marginBottom: theme.spacing.md,
          borderLeftWidth: 4,
          borderLeftColor: theme.colors.accent,
        },
        lockedMessageText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          fontSize: 14,
          fontWeight: '600',
          textAlign: 'center',
        },
        completionMessage: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.lg,
          margin: theme.spacing.md,
          marginBottom: 0,
          alignItems: 'center',
          gap: theme.spacing.sm,
        },
        completionTitle: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.white,
          fontSize: 17,
          fontWeight: '700',
          textAlign: 'center',
        },
        completionText: {
          fontFamily: theme.fontFamily.light,
          color: theme.colors.white,
          fontSize: 14,
          textAlign: 'center',
          opacity: 0.95,
          lineHeight: 20,
        },
        continueButton: {
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          alignItems: 'center',
          marginTop: theme.spacing.md,
          marginBottom: theme.spacing.sm,
        },
        continueButtonText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.accent,
          fontSize: 16,
          fontWeight: '700',
        },
      }),
    [theme, insets.bottom]
  );

  return (
    <View style={styles.container}>
      <View style={[styles.headerRow, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={handleBackPress}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.h1}>Group stage</Text>
          <Text style={styles.progressText}>
            {headerCompletedCount} of {headerGroupMatches.length} matches in this group
          </Text>
        </View>
        <View style={styles.headerSpacer} />
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
              <Text
                style={[
                  styles.checkmark,
                  activeGroup === group ? styles.checkmarkOnAccent : styles.checkmarkMuted,
                ]}
              >
                ✓
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.content}>

        {/* Group Table and Fixtures */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : allFixtures.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateTitle}>No group fixtures loaded</Text>
            {fixturesError ? (
              <Text style={styles.emptyStateBody}>{fixturesError}</Text>
            ) : (
              <Text style={styles.emptyStateBody}>
                The app loads group-stage matches from your Supabase project (schema wc2026, table matches).
                {'\n\n'}
                If this is unexpected: run the WC2026 SQL seeds in order (see supabase/sql/wc2026_00_run_order.sql),
                ensure the wc2026 schema is exposed in Supabase API settings, and sign in (RLS requires an
                authenticated session to read matches).
              </Text>
            )}
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
                    Fully scored matches save automatically when you switch group tab. When every group is complete, use
                    Continue to next stage below.
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
