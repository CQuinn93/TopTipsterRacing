// Third-place combination matrix lookup
// Maps combinations of 8 groups with third-place teams advancing to match assignments
// Based on FIFA World Cup 2026 Round of 32 schedule (495 possible combinations)

import { type FinalGroupStanding } from './group-standings';

export interface ThirdPlaceMatchAssignment {
  matchNumber: number; // 74, 77, 79, 80, 81, 82, 85, 87
  groupName: string; // Which group's third-place team plays in this match
}

/**
 * Parse a combination string and extract groups and match assignments
 * Format: "7 D E F G H I K L 3E 3G 3I 3D 3H 3F 3L 3K"
 * Returns: { groups: ['D','E','F','G','H','I','K','L'], assignments: ['E','G','I','D','H','F','L','K'] }
 */
const parseCombinationString = (combinationString: string): {
  groups: string[];
  assignments: string[];
} | null => {
  const parts = combinationString.trim().split(/\s+/);
  
  // First part is row number, then 8 groups, then 8 assignments (format: 3X)
  if (parts.length !== 17) { // 1 row number + 8 groups + 8 assignments
    console.warn(`Invalid combination string format: ${combinationString}`);
    return null;
  }

  // Extract groups (parts 1-8, skip row number at index 0)
  const groups = parts.slice(1, 9);
  
  // Extract assignments (parts 9-16, format: 3X -> extract X)
  const assignments = parts.slice(9, 17).map(assignment => {
    // Remove "3" prefix to get group letter
    return assignment.replace(/^3/, '');
  });

  return { groups, assignments };
};

/**
 * Get the match assignments for third-place teams based on which 8 groups advance
 * @param advancingGroups Sorted array of 8 group names (e.g., ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
 * @returns Array of match assignments for third-place teams
 */
export const getThirdPlaceMatchAssignments = (
  advancingGroups: string[]
): ThirdPlaceMatchAssignment[] => {
  // Sort groups to create a consistent key for comparison
  const sortedGroups = [...advancingGroups].sort();
  
  if (sortedGroups.length !== 8) {
    throw new Error('Exactly 8 groups must have third-place teams advancing');
  }

  // Match number mapping based on table column order (1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L)
  // Corresponds to matches: 79, 85, 81, 74, 82, 77, 87, 80
  const matchNumbers = [79, 85, 81, 74, 82, 77, 87, 80];

  // Loop through all combinations to find the matching one
  for (const comboString of COMBINATIONS_ARRAY) {
    const parsed = parseCombinationString(comboString);
    if (!parsed) continue;

    // Sort the groups from the combination for comparison
    const comboGroups = [...parsed.groups].sort();
    
    // Check if this combination matches (all groups match)
    const matches = sortedGroups.length === comboGroups.length &&
      sortedGroups.every((group, index) => group === comboGroups[index]);

    if (matches) {
      // Found the matching combination! Build the assignments
      const assignments: ThirdPlaceMatchAssignment[] = parsed.assignments.map((groupName, index) => ({
        matchNumber: matchNumbers[index],
        groupName: groupName,
      }));
      
      return assignments;
    }
  }

  // If no match found, use fallback
  console.warn(`Combination ${sortedGroups.join('')} not found in matrix, using fallback`);
  return getFallbackAssignments(sortedGroups);
};

/**
 * Get which groups have third-place teams advancing based on group standings
 * We still need to rank teams to determine which 8 advance, but then use the matrix
 * for match assignments (not the ranking order)
 * @param allGroupStandings All group standings
 * @returns Sorted array of 8 group names with third-place teams advancing
 */
export const getAdvancingThirdPlaceGroups = (
  allGroupStandings: Record<string, FinalGroupStanding[]>
): string[] => {
  // Collect all third-place teams with their group names
  const thirdPlaceTeams: Array<{ groupName: string; standing: FinalGroupStanding }> = [];
  
  Object.keys(allGroupStandings).forEach((groupName) => {
    const standings = allGroupStandings[groupName];
    const thirdPlace = standings.find((s) => s.position === 3);
    if (thirdPlace) {
      thirdPlaceTeams.push({ groupName, standing: thirdPlace });
    }
  });

  // Rank them to determine which 8 advance (we still need ranking for this)
  // Sort by: points, goal difference, goals for, goals against, etc.
  thirdPlaceTeams.sort((a, b) => {
    const s1 = a.standing;
    const s2 = b.standing;
    
    // Points (descending)
    if (s1.points !== s2.points) return s2.points - s1.points;
    
    // Goal difference (descending)
    if (s1.goalDifference !== s2.goalDifference) return s2.goalDifference - s1.goalDifference;
    
    // Goals for (descending)
    if (s1.goalsFor !== s2.goalsFor) return s2.goalsFor - s1.goalsFor;
    
    // Goals against (ascending - fewer is better)
    if (s1.goalsAgainst !== s2.goalsAgainst) return s1.goalsAgainst - s2.goalsAgainst;
    
    // FIFA ranking (ascending - lower number is better)
    // Note: FIFA ranking would need to be in the standing data
    // For now, we'll use team code as a tiebreaker
    return a.groupName.localeCompare(b.groupName);
  });

  // Take the top 8 groups
  const advancingGroups = thirdPlaceTeams.slice(0, 8).map(t => t.groupName);
  
  // Sort to create consistent key for matrix lookup
  return advancingGroups.sort();
};

/**
 * Fallback assignment if combination not found in matrix
 * This should not be needed if the matrix is complete
 */
const getFallbackAssignments = (groups: string[]): ThirdPlaceMatchAssignment[] => {
  // Default assignments based on FIFA schedule patterns
  // Match 74: E winners v A/B/C/D/F third place
  // Match 77: I winners v C/D/F/G/H third place
  // Match 79: A winners v C/E/F/H/I third place
  // Match 80: L winners v E/H/I/J/K third place
  // Match 81: D winners v B/E/F/I/J third place
  // Match 82: G winners v A/E/H/I/J third place
  // Match 85: B winners v E/F/G/I/J third place
  // Match 87: K winners v D/E/I/J/L third place
  
  const assignments: ThirdPlaceMatchAssignment[] = [];
  const available = [...groups];
  
  // Match 74: prefer A, B, C, D, F
  const match74 = available.find(g => ['A', 'B', 'C', 'D', 'F'].includes(g)) || available.shift()!;
  if (available.includes(match74)) {
    assignments.push({ matchNumber: 74, groupName: match74 });
    available.splice(available.indexOf(match74), 1);
  }
  
  // Match 77: prefer C, D, F, G, H
  const match77 = available.find(g => ['C', 'D', 'F', 'G', 'H'].includes(g)) || available.shift()!;
  if (available.includes(match77)) {
    assignments.push({ matchNumber: 77, groupName: match77 });
    available.splice(available.indexOf(match77), 1);
  }
  
  // Continue for other matches...
  // This is a fallback, so we'll keep it simple
  const matchNumbers = [79, 80, 81, 82, 85, 87];
  matchNumbers.forEach((matchNum, idx) => {
    if (available.length > 0) {
      assignments.push({ matchNumber: matchNum, groupName: available.shift()! });
    }
  });
  
  return assignments;
};

// Import combinations from data file
import { COMBINATIONS } from './third-place-matrix-data';

// Third-place combination matrix as a simple string array
// Format: "ROW_NUM GROUP1 GROUP2 ... GROUP8 3ASSIGN1 3ASSIGN2 ... 3ASSIGN8"
// Example: "7 D E F G H I K L 3E 3G 3I 3D 3H 3F 3L 3K"
// 
// Match assignments order in table: 1A vs, 1B vs, 1D vs, 1E vs, 1G vs, 1I vs, 1K vs, 1L vs
// Which correspond to matches: 79, 85, 81, 74, 82, 77, 87, 80
const COMBINATIONS_ARRAY: string[] = COMBINATIONS;

// Legacy object format (not used, but kept for reference)
const THIRD_PLACE_COMBINATIONS: Record<string, ThirdPlaceMatchAssignment[]> = {};
