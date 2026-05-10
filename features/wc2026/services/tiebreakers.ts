// Tiebreaker service for resolving group stage standings
// Implements FIFA tiebreaker rules in order

import { type Match } from './fixtures';
import { type Prediction } from './predictions';

export interface TeamStanding {
  teamId: string;
  teamCode: string;
  teamName: string;
  fifaRanking: number | null; // For final tiebreaker
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  // Head-to-head stats (calculated when needed)
  headToHead?: {
    [opponentId: string]: {
      points: number;
      goalDifference: number;
      goalsFor: number;
    };
  };
}

// Calculate head-to-head stats between specific teams
export const calculateHeadToHead = (
  teams: TeamStanding[],
  fixtures: Match[],
  predictions: Record<string, Prediction>
): void => {
  const teamIds = teams.map((t) => t.teamId);
  
  teams.forEach((team) => {
    team.headToHead = {};
    
    // Find all matches between these teams
    fixtures.forEach((match) => {
      if (!match.home_team || !match.away_team) return;
      
      const isHome = match.home_team.id === team.teamId;
      const isAway = match.away_team.id === team.teamId;
      const opponentId = isHome ? match.away_team.id : match.home_team.id;
      
      // Only process if opponent is in the tied teams group
      if (!teamIds.includes(opponentId)) return;
      
      const prediction = predictions[match.id];
      if (!prediction || prediction.home_score === null || prediction.away_score === null) {
        return;
      }
      
      const homeScore = prediction.home_score;
      const awayScore = prediction.away_score;
      
      if (!team.headToHead![opponentId]) {
        team.headToHead![opponentId] = {
          points: 0,
          goalDifference: 0,
          goalsFor: 0,
        };
      }
      
      if (isHome) {
        // Team is home
        team.headToHead![opponentId].goalsFor += homeScore;
        team.headToHead![opponentId].goalDifference += (homeScore - awayScore);
        if (homeScore > awayScore) {
          team.headToHead![opponentId].points += 3;
        } else if (homeScore === awayScore) {
          team.headToHead![opponentId].points += 1;
        }
      } else {
        // Team is away
        team.headToHead![opponentId].goalsFor += awayScore;
        team.headToHead![opponentId].goalDifference += (awayScore - homeScore);
        if (awayScore > homeScore) {
          team.headToHead![opponentId].points += 3;
        } else if (awayScore === homeScore) {
          team.headToHead![opponentId].points += 1;
        }
      }
    });
  });
};

// Calculate aggregate head-to-head stats for a team against multiple opponents
export const getAggregateHeadToHead = (
  team: TeamStanding,
  opponentIds: string[]
): { points: number; goalDifference: number; goalsFor: number } => {
  let totalPoints = 0;
  let totalGD = 0;
  let totalGF = 0;
  
  opponentIds.forEach((opponentId) => {
    if (team.headToHead && team.headToHead[opponentId]) {
      totalPoints += team.headToHead[opponentId].points;
      totalGD += team.headToHead[opponentId].goalDifference;
      totalGF += team.headToHead[opponentId].goalsFor;
    }
  });
  
  return {
    points: totalPoints,
    goalDifference: totalGD,
    goalsFor: totalGF,
  };
};

// Apply tiebreakers to a group of tied teams
export const applyTiebreakers = (
  tiedTeams: TeamStanding[],
  allFixtures: Match[],
  predictions: Record<string, Prediction>
): TeamStanding[] => {
  if (tiedTeams.length <= 1) return tiedTeams;
  
  // Calculate head-to-head stats
  calculateHeadToHead(tiedTeams, allFixtures, predictions);
  
  // Step 1: Head-to-head points
  const sortedByH2HPoints = [...tiedTeams].sort((a, b) => {
    const aH2H = getAggregateHeadToHead(a, tiedTeams.map((t) => t.teamId));
    const bH2H = getAggregateHeadToHead(b, tiedTeams.map((t) => t.teamId));
    
    if (bH2H.points !== aH2H.points) {
      return bH2H.points - aH2H.points;
    }
    
    // Step 2: Head-to-head goal difference
    if (bH2H.goalDifference !== aH2H.goalDifference) {
      return bH2H.goalDifference - aH2H.goalDifference;
    }
    
    // Step 3: Head-to-head goals for
    if (bH2H.goalsFor !== aH2H.goalsFor) {
      return bH2H.goalsFor - aH2H.goalsFor;
    }
    
    // If still tied, we'll need to recursively apply to subset
    return 0;
  });
  
  // Group teams by their H2H stats to identify which are still tied
  const h2hStats = sortedByH2HPoints.map((t) => {
    const h2h = getAggregateHeadToHead(t, tiedTeams.map((t) => t.teamId));
    return { team: t, ...h2h };
  });
  
  // Group by identical H2H stats (points, GD, GF all match)
  const tiedGroups: TeamStanding[][] = [];
  let currentTiedGroup: TeamStanding[] = [h2hStats[0].team];
  
  for (let i = 1; i < h2hStats.length; i++) {
    const prev = h2hStats[i - 1];
    const curr = h2hStats[i];
    
    // Check if stats are identical
    if (prev.points === curr.points &&
        prev.goalDifference === curr.goalDifference &&
        prev.goalsFor === curr.goalsFor) {
      // Still tied - add to current group
      currentTiedGroup.push(curr.team);
    } else {
      // Different stats - save current group and start new one
      tiedGroups.push(currentTiedGroup);
      currentTiedGroup = [curr.team];
    }
  }
  tiedGroups.push(currentTiedGroup);
  
  // Process each tied group
  const result: TeamStanding[] = [];
  
  // Check if any progress was made - if all teams are still in one group, move to final tiebreakers
  const allStillTied = tiedGroups.length === 1 && tiedGroups[0].length === tiedTeams.length;
  
  tiedGroups.forEach((group) => {
    if (group.length === 1) {
      // Resolved
      result.push(group[0]);
    } else if (allStillTied || group.length === tiedTeams.length) {
      // If no progress was made (all teams still tied) or this is the entire original group,
      // move to final tiebreakers to prevent infinite recursion
      const finalSorted = applyFinalTiebreakers(group);
      result.push(...finalSorted);
    } else {
      // Subset is still tied - recursively apply tiebreakers to this subset
      // (but only if progress was made, i.e., group is smaller than original)
      const recursiveResult = applyTiebreakers(group, allFixtures, predictions);
      result.push(...recursiveResult);
    }
  });
  
  return result;
};

// Final tiebreaker sort (after head-to-head is exhausted)
export const applyFinalTiebreakers = (
  teams: TeamStanding[]
): TeamStanding[] => {
  return [...teams].sort((a, b) => {
    // Step 4: Overall goal difference
    if (b.goalDifference !== a.goalDifference) {
      return b.goalDifference - a.goalDifference;
    }
    
    // Step 5: Overall goals for
    if (b.goalsFor !== a.goalsFor) {
      return b.goalsFor - a.goalsFor;
    }
    
    // Step 6: Fair play (skipped - we don't track cards)
    
    // Step 7: FIFA ranking (lower number = better ranking)
    const aRank = a.fifaRanking ?? 999;
    const bRank = b.fifaRanking ?? 999;
    return aRank - bRank;
  });
};
