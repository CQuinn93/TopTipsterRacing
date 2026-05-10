// Knockout bracket generator
// Generates knockout stage brackets based on group stage results

import { type FinalGroupStanding } from './group-standings';
import { type ThirdPlaceTeam } from './third-place-ranking';
import { getThirdPlaceMatchAssignments, getAdvancingThirdPlaceGroups } from './third-place-combinations';

export interface KnockoutMatch {
  matchNumber: number;
  homeTeam: {
    id: string;
    code: string;
    name: string;
    source: string;
  };
  awayTeam: {
    id: string;
    code: string;
    name: string;
    source: string;
  };
  stage: string;
  roundNumber: number;
}

// Generate Round of 32 bracket following FIFA World Cup 2026 schedule
// Matches 73-88 (16 matches total)
// Uses the FIFA combination matrix to assign third-place teams to matches
export const generateRoundOf32Bracket = (
  allGroupStandings: Record<string, FinalGroupStanding[]>,
  bestThirdPlace: ThirdPlaceTeam[]
): KnockoutMatch[] => {
  const matches: KnockoutMatch[] = [];
  
  // Get which 8 groups have third-place teams advancing
  const advancingGroups = getAdvancingThirdPlaceGroups(allGroupStandings);
  
  // Get match assignments from the combination matrix
  const matchAssignments = getThirdPlaceMatchAssignments(advancingGroups);
  
  // Create a map of group name to third-place team for quick lookup
  // Get third-place teams directly from allGroupStandings based on advancing groups
  const thirdPlaceByGroup = new Map<string, ThirdPlaceTeam>();
  advancingGroups.forEach(groupName => {
    const standings = allGroupStandings[groupName];
    if (standings) {
      const thirdPlace = standings.find(s => s.position === 3);
      if (thirdPlace) {
        thirdPlaceByGroup.set(groupName, {
          ...thirdPlace,
          groupName: groupName,
        });
      }
    }
  });
  
  // Verify all assigned groups have teams available
  matchAssignments.forEach(assignment => {
    if (!thirdPlaceByGroup.has(assignment.groupName)) {
      console.warn(`Third-place team from Group ${assignment.groupName} not found. Available groups: ${Array.from(thirdPlaceByGroup.keys()).join(', ')}`);
    }
  });
  
  // Helper to get team from group standing
  const getTeam = (groupName: string, position: 1 | 2): FinalGroupStanding | null => {
    const standings = allGroupStandings[groupName];
    if (!standings) return null;
    return standings.find((s) => s.position === position) || null;
  };
  
  // Helper to get third-place team for a specific match from the matrix
  const getThirdPlaceForMatch = (matchNumber: number): ThirdPlaceTeam | null => {
    const assignment = matchAssignments.find(a => a.matchNumber === matchNumber);
    if (!assignment) return null;
    return thirdPlaceByGroup.get(assignment.groupName) || null;
  };
  
  // Match 73: Group A runners-up v Group B runners-up
  const match73Home = getTeam('A', 2);
  const match73Away = getTeam('B', 2);
  if (match73Home && match73Away) {
    matches.push({
      matchNumber: 73,
      homeTeam: {
        id: match73Home.teamId,
        code: match73Home.teamCode,
        name: match73Home.teamName,
        source: 'Runner-up Group A',
      },
      awayTeam: {
        id: match73Away.teamId,
        code: match73Away.teamCode,
        name: match73Away.teamName,
        source: 'Runner-up Group B',
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 74: Group E winners v third place (from matrix)
  const match74Home = getTeam('E', 1);
  const match74ThirdPlace = getThirdPlaceForMatch(74);
  if (match74Home && match74ThirdPlace) {
    matches.push({
      matchNumber: 74,
      homeTeam: {
        id: match74Home.teamId,
        code: match74Home.teamCode,
        name: match74Home.teamName,
        source: 'Winner Group E',
      },
      awayTeam: {
        id: match74ThirdPlace.teamId,
        code: match74ThirdPlace.teamCode,
        name: match74ThirdPlace.teamName,
        source: `3rd Place Group ${match74ThirdPlace.groupName}`,
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 75: Group F winners v Group C runners-up
  const match75Home = getTeam('F', 1);
  const match75Away = getTeam('C', 2);
  if (match75Home && match75Away) {
    matches.push({
      matchNumber: 75,
      homeTeam: {
        id: match75Home.teamId,
        code: match75Home.teamCode,
        name: match75Home.teamName,
        source: 'Winner Group F',
      },
      awayTeam: {
        id: match75Away.teamId,
        code: match75Away.teamCode,
        name: match75Away.teamName,
        source: 'Runner-up Group C',
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 76: Group C winners v Group F runners-up
  const match76Home = getTeam('C', 1);
  const match76Away = getTeam('F', 2);
  if (match76Home && match76Away) {
    matches.push({
      matchNumber: 76,
      homeTeam: {
        id: match76Home.teamId,
        code: match76Home.teamCode,
        name: match76Home.teamName,
        source: 'Winner Group C',
      },
      awayTeam: {
        id: match76Away.teamId,
        code: match76Away.teamCode,
        name: match76Away.teamName,
        source: 'Runner-up Group F',
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 77: Group I winners v third place (from matrix)
  const match77Home = getTeam('I', 1);
  const match77ThirdPlace = getThirdPlaceForMatch(77);
  if (match77Home && match77ThirdPlace) {
    matches.push({
      matchNumber: 77,
      homeTeam: {
        id: match77Home.teamId,
        code: match77Home.teamCode,
        name: match77Home.teamName,
        source: 'Winner Group I',
      },
      awayTeam: {
        id: match77ThirdPlace.teamId,
        code: match77ThirdPlace.teamCode,
        name: match77ThirdPlace.teamName,
        source: `3rd Place Group ${match77ThirdPlace.groupName}`,
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 78: Group E runners-up v Group I runners-up
  const match78Home = getTeam('E', 2);
  const match78Away = getTeam('I', 2);
  if (match78Home && match78Away) {
    matches.push({
      matchNumber: 78,
      homeTeam: {
        id: match78Home.teamId,
        code: match78Home.teamCode,
        name: match78Home.teamName,
        source: 'Runner-up Group E',
      },
      awayTeam: {
        id: match78Away.teamId,
        code: match78Away.teamCode,
        name: match78Away.teamName,
        source: 'Runner-up Group I',
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 79: Group A winners v third place (from matrix)
  const match79Home = getTeam('A', 1);
  const match79ThirdPlace = getThirdPlaceForMatch(79);
  if (match79Home && match79ThirdPlace) {
    matches.push({
      matchNumber: 79,
      homeTeam: {
        id: match79Home.teamId,
        code: match79Home.teamCode,
        name: match79Home.teamName,
        source: 'Winner Group A',
      },
      awayTeam: {
        id: match79ThirdPlace.teamId,
        code: match79ThirdPlace.teamCode,
        name: match79ThirdPlace.teamName,
        source: `3rd Place Group ${match79ThirdPlace.groupName}`,
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 80: Group L winners v third place (from matrix)
  const match80Home = getTeam('L', 1);
  const match80ThirdPlace = getThirdPlaceForMatch(80);
  if (match80Home && match80ThirdPlace) {
    matches.push({
      matchNumber: 80,
      homeTeam: {
        id: match80Home.teamId,
        code: match80Home.teamCode,
        name: match80Home.teamName,
        source: 'Winner Group L',
      },
      awayTeam: {
        id: match80ThirdPlace.teamId,
        code: match80ThirdPlace.teamCode,
        name: match80ThirdPlace.teamName,
        source: `3rd Place Group ${match80ThirdPlace.groupName}`,
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 81: Group D winners v third place (from matrix)
  const match81Home = getTeam('D', 1);
  const match81ThirdPlace = getThirdPlaceForMatch(81);
  if (match81Home && match81ThirdPlace) {
    matches.push({
      matchNumber: 81,
      homeTeam: {
        id: match81Home.teamId,
        code: match81Home.teamCode,
        name: match81Home.teamName,
        source: 'Winner Group D',
      },
      awayTeam: {
        id: match81ThirdPlace.teamId,
        code: match81ThirdPlace.teamCode,
        name: match81ThirdPlace.teamName,
        source: `3rd Place Group ${match81ThirdPlace.groupName}`,
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 82: Group G winners v third place (from matrix)
  const match82Home = getTeam('G', 1);
  const match82ThirdPlace = getThirdPlaceForMatch(82);
  if (match82Home && match82ThirdPlace) {
    matches.push({
      matchNumber: 82,
      homeTeam: {
        id: match82Home.teamId,
        code: match82Home.teamCode,
        name: match82Home.teamName,
        source: 'Winner Group G',
      },
      awayTeam: {
        id: match82ThirdPlace.teamId,
        code: match82ThirdPlace.teamCode,
        name: match82ThirdPlace.teamName,
        source: `3rd Place Group ${match82ThirdPlace.groupName}`,
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 83: Group K runners-up v Group L runners-up
  const match83Home = getTeam('K', 2);
  const match83Away = getTeam('L', 2);
  if (match83Home && match83Away) {
    matches.push({
      matchNumber: 83,
      homeTeam: {
        id: match83Home.teamId,
        code: match83Home.teamCode,
        name: match83Home.teamName,
        source: 'Runner-up Group K',
      },
      awayTeam: {
        id: match83Away.teamId,
        code: match83Away.teamCode,
        name: match83Away.teamName,
        source: 'Runner-up Group L',
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 84: Group H winners v Group J runners-up
  const match84Home = getTeam('H', 1);
  const match84Away = getTeam('J', 2);
  if (match84Home && match84Away) {
    matches.push({
      matchNumber: 84,
      homeTeam: {
        id: match84Home.teamId,
        code: match84Home.teamCode,
        name: match84Home.teamName,
        source: 'Winner Group H',
      },
      awayTeam: {
        id: match84Away.teamId,
        code: match84Away.teamCode,
        name: match84Away.teamName,
        source: 'Runner-up Group J',
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 85: Group B winners v third place (from matrix)
  const match85Home = getTeam('B', 1);
  const match85ThirdPlace = getThirdPlaceForMatch(85);
  if (match85Home && match85ThirdPlace) {
    matches.push({
      matchNumber: 85,
      homeTeam: {
        id: match85Home.teamId,
        code: match85Home.teamCode,
        name: match85Home.teamName,
        source: 'Winner Group B',
      },
      awayTeam: {
        id: match85ThirdPlace.teamId,
        code: match85ThirdPlace.teamCode,
        name: match85ThirdPlace.teamName,
        source: `3rd Place Group ${match85ThirdPlace.groupName}`,
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 86: Group J winners v Group H runners-up
  const match86Home = getTeam('J', 1);
  const match86Away = getTeam('H', 2);
  if (match86Home && match86Away) {
    matches.push({
      matchNumber: 86,
      homeTeam: {
        id: match86Home.teamId,
        code: match86Home.teamCode,
        name: match86Home.teamName,
        source: 'Winner Group J',
      },
      awayTeam: {
        id: match86Away.teamId,
        code: match86Away.teamCode,
        name: match86Away.teamName,
        source: 'Runner-up Group H',
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Match 87: Group K winners v third place (from matrix)
  const match87Home = getTeam('K', 1);
  const match87ThirdPlace = getThirdPlaceForMatch(87);
  if (match87Home && match87ThirdPlace) {
    matches.push({
      matchNumber: 87,
      homeTeam: {
        id: match87Home.teamId,
        code: match87Home.teamCode,
        name: match87Home.teamName,
        source: 'Winner Group K',
      },
      awayTeam: {
        id: match87ThirdPlace.teamId,
        code: match87ThirdPlace.teamCode,
        name: match87ThirdPlace.teamName,
        source: `3rd Place Group ${match87ThirdPlace.groupName}`,
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  } else {
    // Debug logging for missing match 87
    console.warn('Match 87 could not be created:', {
      hasHome: !!match87Home,
      hasThirdPlace: !!match87ThirdPlace,
      homeTeamGroup: match87Home ? 'K' : 'none',
      matchAssignments: matchAssignments.filter(a => a.matchNumber === 87),
    });
  }
  
  // Match 88: Group D runners-up v Group G runners-up
  const match88Home = getTeam('D', 2);
  const match88Away = getTeam('G', 2);
  if (match88Home && match88Away) {
    matches.push({
      matchNumber: 88,
      homeTeam: {
        id: match88Home.teamId,
        code: match88Home.teamCode,
        name: match88Home.teamName,
        source: 'Runner-up Group D',
      },
      awayTeam: {
        id: match88Away.teamId,
        code: match88Away.teamCode,
        name: match88Away.teamName,
        source: 'Runner-up Group G',
      },
      stage: 'Round of 32',
      roundNumber: 1,
    });
  }
  
  // Sort matches by match number
  matches.sort((a, b) => a.matchNumber - b.matchNumber);
  
  // Debug: Log all created matches
  console.log('Generated Round of 32 matches:', matches.map(m => m.matchNumber).sort((a, b) => a - b));
  
  // Ensure we have exactly 16 matches (73-88)
  if (matches.length !== 16) {
    console.warn(`Warning: Expected 16 matches, but generated ${matches.length} matches`);
    const expectedMatches = [73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88];
    const createdMatches = matches.map(m => m.matchNumber);
    const missingMatches = expectedMatches.filter(m => !createdMatches.includes(m));
    console.warn('Missing matches:', missingMatches);
  }
  
  return matches;
};

// Generate Round of 16 bracket following FIFA World Cup 2026 schedule
// Matches 89-96 (8 matches total)
// Pairs winners from Round of 32 matches
export const generateRoundOf16Bracket = (
  r32Predictions: Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }>,
  r32Bracket: KnockoutMatch[]
): KnockoutMatch[] => {
  const matches: KnockoutMatch[] = [];
  
  // Helper to get winner from Round of 32 match
  const getR32Winner = (matchNumber: number): { id: string; code: string; name: string; source: string } | null => {
    const r32Match = r32Bracket.find(m => m.matchNumber === matchNumber);
    if (!r32Match) return null;
    
    const pred = r32Predictions[matchNumber];
    if (!pred) return null;
    
    const homeScore = pred.home_score;
    const awayScore = pred.away_score;
    
    // Determine winner
    if (homeScore > awayScore) {
      return r32Match.homeTeam;
    } else if (awayScore > homeScore) {
      return r32Match.awayTeam;
    } else if (pred.predicted_winner_id) {
      // Draw - use selected winner
      return r32Match.homeTeam.id === pred.predicted_winner_id ? r32Match.homeTeam : r32Match.awayTeam;
    }
    
    return null;
  };
  
  // Match 89: Winner Match 73 vs Winner Match 74
  const m89Home = getR32Winner(73);
  const m89Away = getR32Winner(74);
  if (m89Home && m89Away) {
    matches.push({
      matchNumber: 89,
      homeTeam: { ...m89Home, source: 'Winner Match 73' },
      awayTeam: { ...m89Away, source: 'Winner Match 74' },
      stage: 'Round of 16',
      roundNumber: 2,
    });
  }
  
  // Match 90: Winner Match 75 vs Winner Match 76
  const m90Home = getR32Winner(75);
  const m90Away = getR32Winner(76);
  if (m90Home && m90Away) {
    matches.push({
      matchNumber: 90,
      homeTeam: { ...m90Home, source: 'Winner Match 75' },
      awayTeam: { ...m90Away, source: 'Winner Match 76' },
      stage: 'Round of 16',
      roundNumber: 2,
    });
  }
  
  // Match 91: Winner Match 77 vs Winner Match 78
  const m91Home = getR32Winner(77);
  const m91Away = getR32Winner(78);
  if (m91Home && m91Away) {
    matches.push({
      matchNumber: 91,
      homeTeam: { ...m91Home, source: 'Winner Match 77' },
      awayTeam: { ...m91Away, source: 'Winner Match 78' },
      stage: 'Round of 16',
      roundNumber: 2,
    });
  }
  
  // Match 92: Winner Match 79 vs Winner Match 80
  const m92Home = getR32Winner(79);
  const m92Away = getR32Winner(80);
  if (m92Home && m92Away) {
    matches.push({
      matchNumber: 92,
      homeTeam: { ...m92Home, source: 'Winner Match 79' },
      awayTeam: { ...m92Away, source: 'Winner Match 80' },
      stage: 'Round of 16',
      roundNumber: 2,
    });
  }
  
  // Match 93: Winner Match 81 vs Winner Match 82
  const m93Home = getR32Winner(81);
  const m93Away = getR32Winner(82);
  if (m93Home && m93Away) {
    matches.push({
      matchNumber: 93,
      homeTeam: { ...m93Home, source: 'Winner Match 81' },
      awayTeam: { ...m93Away, source: 'Winner Match 82' },
      stage: 'Round of 16',
      roundNumber: 2,
    });
  }
  
  // Match 94: Winner Match 83 vs Winner Match 84
  const m94Home = getR32Winner(83);
  const m94Away = getR32Winner(84);
  if (m94Home && m94Away) {
    matches.push({
      matchNumber: 94,
      homeTeam: { ...m94Home, source: 'Winner Match 83' },
      awayTeam: { ...m94Away, source: 'Winner Match 84' },
      stage: 'Round of 16',
      roundNumber: 2,
    });
  }
  
  // Match 95: Winner Match 85 vs Winner Match 86
  const m95Home = getR32Winner(85);
  const m95Away = getR32Winner(86);
  if (m95Home && m95Away) {
    matches.push({
      matchNumber: 95,
      homeTeam: { ...m95Home, source: 'Winner Match 85' },
      awayTeam: { ...m95Away, source: 'Winner Match 86' },
      stage: 'Round of 16',
      roundNumber: 2,
    });
  }
  
  // Match 96: Winner Match 87 vs Winner Match 88
  const m96Home = getR32Winner(87);
  const m96Away = getR32Winner(88);
  if (m96Home && m96Away) {
    matches.push({
      matchNumber: 96,
      homeTeam: { ...m96Home, source: 'Winner Match 87' },
      awayTeam: { ...m96Away, source: 'Winner Match 88' },
      stage: 'Round of 16',
      roundNumber: 2,
    });
  }
  
  return matches;
};

// Generate Quarter Finals bracket following FIFA World Cup 2026 schedule
// Matches 97-100 (4 matches total)
// Pairs winners from Round of 16 matches
export const generateQuarterFinalsBracket = (
  r16Predictions: Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }>,
  r16Bracket: KnockoutMatch[]
): KnockoutMatch[] => {
  const matches: KnockoutMatch[] = [];
  
  // Helper to get winner from Round of 16 match
  const getR16Winner = (matchNumber: number): { id: string; code: string; name: string; source: string } | null => {
    const r16Match = r16Bracket.find(m => m.matchNumber === matchNumber);
    if (!r16Match) return null;
    
    const pred = r16Predictions[matchNumber];
    if (!pred) return null;
    
    const homeScore = pred.home_score;
    const awayScore = pred.away_score;
    
    // Determine winner
    if (homeScore > awayScore) {
      return r16Match.homeTeam;
    } else if (awayScore > homeScore) {
      return r16Match.awayTeam;
    } else if (pred.predicted_winner_id) {
      // Draw - use selected winner
      return r16Match.homeTeam.id === pred.predicted_winner_id ? r16Match.homeTeam : r16Match.awayTeam;
    }
    
    return null;
  };
  
  // Match 97: Winner Match 89 vs Winner Match 90
  const m97Home = getR16Winner(89);
  const m97Away = getR16Winner(90);
  if (m97Home && m97Away) {
    matches.push({
      matchNumber: 97,
      homeTeam: { ...m97Home, source: 'Winner Match 89' },
      awayTeam: { ...m97Away, source: 'Winner Match 90' },
      stage: 'Quarter Finals',
      roundNumber: 3,
    });
  }
  
  // Match 98: Winner Match 91 vs Winner Match 92
  const m98Home = getR16Winner(91);
  const m98Away = getR16Winner(92);
  if (m98Home && m98Away) {
    matches.push({
      matchNumber: 98,
      homeTeam: { ...m98Home, source: 'Winner Match 91' },
      awayTeam: { ...m98Away, source: 'Winner Match 92' },
      stage: 'Quarter Finals',
      roundNumber: 3,
    });
  }
  
  // Match 99: Winner Match 93 vs Winner Match 94
  const m99Home = getR16Winner(93);
  const m99Away = getR16Winner(94);
  if (m99Home && m99Away) {
    matches.push({
      matchNumber: 99,
      homeTeam: { ...m99Home, source: 'Winner Match 93' },
      awayTeam: { ...m99Away, source: 'Winner Match 94' },
      stage: 'Quarter Finals',
      roundNumber: 3,
    });
  }
  
  // Match 100: Winner Match 95 vs Winner Match 96
  const m100Home = getR16Winner(95);
  const m100Away = getR16Winner(96);
  if (m100Home && m100Away) {
    matches.push({
      matchNumber: 100,
      homeTeam: { ...m100Home, source: 'Winner Match 95' },
      awayTeam: { ...m100Away, source: 'Winner Match 96' },
      stage: 'Quarter Finals',
      roundNumber: 3,
    });
  }
  
  return matches;
};

// Generate Semi Finals bracket following FIFA World Cup 2026 schedule
// Matches 101-102 (2 matches total)
// Pairs winners from Quarter Finals matches
export const generateSemiFinalsBracket = (
  qfPredictions: Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }>,
  qfBracket: KnockoutMatch[]
): KnockoutMatch[] => {
  const matches: KnockoutMatch[] = [];
  
  // Helper to get winner from Quarter Finals match
  const getQFWinner = (matchNumber: number): { id: string; code: string; name: string; source: string } | null => {
    const qfMatch = qfBracket.find(m => m.matchNumber === matchNumber);
    if (!qfMatch) return null;
    
    const pred = qfPredictions[matchNumber];
    if (!pred) return null;
    
    const homeScore = pred.home_score;
    const awayScore = pred.away_score;
    
    // Determine winner
    if (homeScore > awayScore) {
      return qfMatch.homeTeam;
    } else if (awayScore > homeScore) {
      return qfMatch.awayTeam;
    } else if (pred.predicted_winner_id) {
      // Draw - use selected winner
      return qfMatch.homeTeam.id === pred.predicted_winner_id ? qfMatch.homeTeam : qfMatch.awayTeam;
    }
    
    return null;
  };
  
  // Match 101: Winner Match 97 vs Winner Match 98
  const m101Home = getQFWinner(97);
  const m101Away = getQFWinner(98);
  if (m101Home && m101Away) {
    matches.push({
      matchNumber: 101,
      homeTeam: { ...m101Home, source: 'Winner Match 97' },
      awayTeam: { ...m101Away, source: 'Winner Match 98' },
      stage: 'Semi Finals',
      roundNumber: 4,
    });
  }
  
  // Match 102: Winner Match 99 vs Winner Match 100
  const m102Home = getQFWinner(99);
  const m102Away = getQFWinner(100);
  if (m102Home && m102Away) {
    matches.push({
      matchNumber: 102,
      homeTeam: { ...m102Home, source: 'Winner Match 99' },
      awayTeam: { ...m102Away, source: 'Winner Match 100' },
      stage: 'Semi Finals',
      roundNumber: 4,
    });
  }
  
  return matches;
};

// Generate Bronze Final bracket following FIFA World Cup 2026 schedule
// Match 103 (1 match)
// Pairs losers from Semi Finals matches
export const generateBronzeFinalBracket = (
  sfPredictions: Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }>,
  sfBracket: KnockoutMatch[]
): KnockoutMatch[] => {
  const matches: KnockoutMatch[] = [];
  
  // Helper to get loser from Semi Finals match
  const getSFLoser = (matchNumber: number): { id: string; code: string; name: string; source: string } | null => {
    const sfMatch = sfBracket.find(m => m.matchNumber === matchNumber);
    if (!sfMatch) return null;
    
    const pred = sfPredictions[matchNumber];
    if (!pred) return null;
    
    const homeScore = pred.home_score;
    const awayScore = pred.away_score;
    
    // Determine loser (opposite of winner)
    if (homeScore > awayScore) {
      return sfMatch.awayTeam; // Away team lost
    } else if (awayScore > homeScore) {
      return sfMatch.homeTeam; // Home team lost
    } else if (pred.predicted_winner_id) {
      // Draw - loser is the team that didn't win
      return sfMatch.homeTeam.id === pred.predicted_winner_id ? sfMatch.awayTeam : sfMatch.homeTeam;
    }
    
    return null;
  };
  
  // Match 103: Loser Match 101 vs Loser Match 102
  const m103Home = getSFLoser(101);
  const m103Away = getSFLoser(102);
  if (m103Home && m103Away) {
    matches.push({
      matchNumber: 103,
      homeTeam: { ...m103Home, source: 'Loser Match 101' },
      awayTeam: { ...m103Away, source: 'Loser Match 102' },
      stage: 'Bronze Final',
      roundNumber: 5,
    });
  }
  
  return matches;
};

// Generate Final bracket following FIFA World Cup 2026 schedule
// Match 104 (1 match)
// Pairs winners from Semi Finals matches
export const generateFinalBracket = (
  sfPredictions: Record<number, { home_score: number; away_score: number; predicted_winner_id: string | null }>,
  sfBracket: KnockoutMatch[]
): KnockoutMatch[] => {
  const matches: KnockoutMatch[] = [];
  
  // Helper to get winner from Semi Finals match
  const getSFWinner = (matchNumber: number): { id: string; code: string; name: string; source: string } | null => {
    const sfMatch = sfBracket.find(m => m.matchNumber === matchNumber);
    if (!sfMatch) return null;
    
    const pred = sfPredictions[matchNumber];
    if (!pred) return null;
    
    const homeScore = pred.home_score;
    const awayScore = pred.away_score;
    
    // Determine winner
    if (homeScore > awayScore) {
      return sfMatch.homeTeam;
    } else if (awayScore > homeScore) {
      return sfMatch.awayTeam;
    } else if (pred.predicted_winner_id) {
      // Draw - use selected winner
      return sfMatch.homeTeam.id === pred.predicted_winner_id ? sfMatch.homeTeam : sfMatch.awayTeam;
    }
    
    return null;
  };
  
  // Match 104: Winner Match 101 vs Winner Match 102
  const m104Home = getSFWinner(101);
  const m104Away = getSFWinner(102);
  if (m104Home && m104Away) {
    matches.push({
      matchNumber: 104,
      homeTeam: { ...m104Home, source: 'Winner Match 101' },
      awayTeam: { ...m104Away, source: 'Winner Match 102' },
      stage: 'Final',
      roundNumber: 6,
    });
  }
  
  return matches;
};
