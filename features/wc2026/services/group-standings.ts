// Group standings calculator with full tiebreaker implementation
// Calculates final standings for each group based on predictions

import { type Match } from './fixtures';
import { type Prediction } from './predictions';
import { type TeamStanding, applyTiebreakers, applyFinalTiebreakers } from './tiebreakers';

export interface FinalGroupStanding extends TeamStanding {
  position: number; // Final position in group (1, 2, 3, or 4)
  groupName: string;
}

// Calculate standings for a single group
export const calculateGroupStandings = async (
  groupName: string,
  fixtures: Match[],
  predictions: Record<string, Prediction>
): Promise<FinalGroupStanding[]> => {
  // Use team data from fixtures (no database call needed - FIFA ranking is already included)
  const standingsMap: Record<string, TeamStanding> = {};
  
  // Initialize all teams in the group
  fixtures.forEach((match) => {
    if (match.home_team && !standingsMap[match.home_team.id]) {
      standingsMap[match.home_team.id] = {
        teamId: match.home_team.id,
        teamCode: match.home_team.country_code,
        teamName: match.home_team.country_name,
        fifaRanking: match.home_team.fifa_ranking ?? null,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };
    }
    if (match.away_team && !standingsMap[match.away_team.id]) {
      standingsMap[match.away_team.id] = {
        teamId: match.away_team.id,
        teamCode: match.away_team.country_code,
        teamName: match.away_team.country_name,
        fifaRanking: match.away_team.fifa_ranking ?? null,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };
    }
    
    // Process match result
    const prediction = predictions[match.id];
    if (prediction && match.home_team && match.away_team) {
      const homeScore = prediction.home_score;
      const awayScore = prediction.away_score;
      
      if (homeScore !== null && awayScore !== null && 
          typeof homeScore === 'number' && typeof awayScore === 'number') {
        const homeTeam = standingsMap[match.home_team.id];
        const awayTeam = standingsMap[match.away_team.id];
        
        // Update played
        homeTeam.played++;
        awayTeam.played++;
        
        // Update goals
        homeTeam.goalsFor += homeScore;
        homeTeam.goalsAgainst += awayScore;
        awayTeam.goalsFor += awayScore;
        awayTeam.goalsAgainst += homeScore;
        
        // Update goal difference
        homeTeam.goalDifference = homeTeam.goalsFor - homeTeam.goalsAgainst;
        awayTeam.goalDifference = awayTeam.goalsFor - awayTeam.goalsAgainst;
        
        // Update results and points
        if (homeScore > awayScore) {
          homeTeam.won++;
          awayTeam.lost++;
          homeTeam.points += 3;
        } else if (awayScore > homeScore) {
          awayTeam.won++;
          homeTeam.lost++;
          awayTeam.points += 3;
        } else {
          homeTeam.drawn++;
          awayTeam.drawn++;
          homeTeam.points += 1;
          awayTeam.points += 1;
        }
      }
    }
  });
  
  // Convert to array
  const standings = Object.values(standingsMap);
  
  // Group by points
  const pointsMap: Record<number, TeamStanding[]> = {};
  standings.forEach((team) => {
    if (!pointsMap[team.points]) {
      pointsMap[team.points] = [];
    }
    pointsMap[team.points].push(team);
  });
  
  // Sort by points (descending)
  const sortedPoints = Object.keys(pointsMap)
    .map(Number)
    .sort((a, b) => b - a);
  
  // Apply tiebreakers and build final standings
  const finalStandings: FinalGroupStanding[] = [];
  let position = 1;
  
  sortedPoints.forEach((points) => {
    const teamsWithPoints = pointsMap[points];
    
    if (teamsWithPoints.length === 1) {
      // No tie, just add the team
      finalStandings.push({
        ...teamsWithPoints[0],
        position,
        groupName,
      });
      position++;
    } else {
      // Teams are tied - apply tiebreakers
      const resolved = applyTiebreakers(teamsWithPoints, fixtures, predictions);
      
      // Apply final tiebreakers to any teams that are still tied after H2H
      // (This handles cases where H2H didn't fully resolve)
      const finalResolved = applyFinalTiebreakers(resolved);
      
      finalResolved.forEach((team) => {
        finalStandings.push({
          ...team,
          position,
          groupName,
        });
        position++;
      });
    }
  });
  
  // Ensure we have exactly 4 positions
  while (finalStandings.length < 4) {
    const remainingTeams = standings.filter(
      (t) => !finalStandings.some((fs) => fs.teamId === t.teamId)
    );
    if (remainingTeams.length > 0) {
      const sorted = applyFinalTiebreakers(remainingTeams);
      sorted.forEach((team) => {
        finalStandings.push({
          ...team,
          position: finalStandings.length + 1,
          groupName,
        });
      });
    } else {
      break;
    }
  }
  
  // Sort by position to ensure correct order
  return finalStandings.sort((a, b) => a.position - b.position);
};

// Calculate standings for all groups
export const calculateAllGroupStandings = async (
  allFixtures: Match[],
  predictions: Record<string, Prediction>
): Promise<Record<string, FinalGroupStanding[]>> => {
  const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const allStandings: Record<string, FinalGroupStanding[]> = {};
  
  // Calculate standings for each group in parallel
  const standingsPromises = GROUPS.map(async (groupName) => {
    const groupFixtures = allFixtures.filter(
      (f) => f.group?.group_name === groupName
    );
    
    if (groupFixtures.length > 0) {
      return {
        groupName,
        standings: await calculateGroupStandings(groupName, groupFixtures, predictions),
      };
    }
    return { groupName, standings: [] };
  });
  
  const results = await Promise.all(standingsPromises);
  results.forEach(({ groupName, standings }) => {
    if (standings.length > 0) {
      allStandings[groupName] = standings;
    }
  });
  
  return allStandings;
};
