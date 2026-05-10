// Third-place team ranking service
// Ranks all 12 third-place teams to select the best 8 for Round of 32

import { type FinalGroupStanding } from './group-standings';
import { applyFinalTiebreakers } from './tiebreakers';

export interface ThirdPlaceTeam extends FinalGroupStanding {
  groupName: string;
}

// Rank all third-place teams across all groups
export const rankThirdPlaceTeams = (
  allGroupStandings: Record<string, FinalGroupStanding[]>
): ThirdPlaceTeam[] => {
  // Collect all third-place teams
  const thirdPlaceTeams: ThirdPlaceTeam[] = [];
  
  Object.keys(allGroupStandings).forEach((groupName) => {
    const standings = allGroupStandings[groupName];
    const thirdPlace = standings.find((s) => s.position === 3);
    
    if (thirdPlace) {
      thirdPlaceTeams.push({
        ...thirdPlace,
        groupName,
      });
    }
  });
  
  // Apply tiebreakers (same rules as group standings)
  // For third-place ranking, we use overall stats (steps 4-7)
  // since head-to-head doesn't apply across groups
  const ranked = applyFinalTiebreakers(thirdPlaceTeams) as ThirdPlaceTeam[];
  
  return ranked;
};

// Select the best 8 third-place teams
export const selectBestThirdPlaceTeams = (
  allGroupStandings: Record<string, FinalGroupStanding[]>
): ThirdPlaceTeam[] => {
  const ranked = rankThirdPlaceTeams(allGroupStandings);
  return ranked.slice(0, 8); // Top 8
};
