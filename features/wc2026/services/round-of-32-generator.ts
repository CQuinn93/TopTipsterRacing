// Round of 32 bracket generator service
// Main entry point for generating Round of 32 bracket from group stage predictions

import { type Match } from './fixtures';
import { type Prediction } from './predictions';
import { calculateAllGroupStandings } from './group-standings';
import { selectBestThirdPlaceTeams } from './third-place-ranking';
import { generateRoundOf32Bracket, type KnockoutMatch } from './knockout-bracket';

export interface RoundOf32Result {
  bracket: KnockoutMatch[];
  groupStandings: Record<string, import('./group-standings').FinalGroupStanding[]>;
  bestThirdPlace: import('./third-place-ranking').ThirdPlaceTeam[];
}

/**
 * Generate Round of 32 bracket based on user's group stage predictions
 * @param allFixtures All group stage fixtures
 * @param predictions User's group stage predictions
 * @returns Round of 32 bracket with match numbers 73-88 (16 matches)
 */
export const generateRoundOf32 = async (
  allFixtures: Match[],
  predictions: Record<string, Prediction>
): Promise<RoundOf32Result> => {
  // Step 1: Calculate final standings for all groups with tiebreakers
  const groupStandings = await calculateAllGroupStandings(allFixtures, predictions);
  
  // Step 2: Select best 8 third-place teams
  const bestThirdPlace = selectBestThirdPlaceTeams(groupStandings);
  
  // Step 3: Generate Round of 32 bracket
  const bracket = generateRoundOf32Bracket(groupStandings, bestThirdPlace);
  
  return {
    bracket,
    groupStandings,
    bestThirdPlace,
  };
};
