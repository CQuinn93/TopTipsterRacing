import { useMemo } from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { CountryFlag } from '@/features/wc2026/components/CountryFlag';
import { type Match } from '@/features/wc2026/services/fixtures';
import { type Prediction } from '@/features/wc2026/services/predictions';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_SMALL_SCREEN = SCREEN_WIDTH < 375; // iPhone SE, small Android phones
const IS_VERY_SMALL_SCREEN = SCREEN_WIDTH < 360; // Very small devices

interface AntePostGroupTableProps {
  groupName: string;
  fixtures: Match[];
  predictions: Record<string, Prediction>;
  standings?: Array<{
    teamId: string;
    teamCode: string;
    teamName: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalDifference: number;
    points: number;
    position: number;
  }>;
  advancingTeams?: Set<string>;
  knockedOutTeams?: Set<string>;
}

interface TeamStanding {
  teamId: string;
  teamCode: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export function AntePostGroupTable({ 
  groupName, 
  fixtures, 
  predictions,
  standings: providedStandings,
  advancingTeams,
  knockedOutTeams
}: AntePostGroupTableProps) {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        tableContainer: {
          borderRadius: 12,
          backgroundColor: theme.colors.surface,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        tableHeader: {
          flexDirection: 'row',
          backgroundColor: theme.colors.surfaceElevated,
          paddingVertical: 8,
          paddingHorizontal: 6,
          borderBottomWidth: 2,
          borderBottomColor: theme.colors.accent,
        },
        tableRow: {
          flexDirection: 'row',
          paddingVertical: 7,
          paddingHorizontal: 6,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          alignItems: 'center',
        },
        tableRowWithOverlay: {
          position: 'relative',
        },
        overlay: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 0,
        },
        advancingOverlay: {
          backgroundColor: theme.colors.accentMuted,
        },
        knockedOutOverlay: {
          backgroundColor: 'rgba(220, 38, 38, 0.18)',
        },
        headerCell: {
          color: theme.colors.text,
          fontSize: 10,
          fontWeight: '700',
          textAlign: 'center',
          fontFamily: theme.fontFamily.regular,
        },
        cell: {
          color: theme.colors.text,
          fontSize: 12,
          fontWeight: '600',
          textAlign: 'center',
          fontFamily: theme.fontFamily.regular,
        },
        positionCell: {
          width: 30,
        },
        teamCell: {
          flex: 2,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 2,
          minWidth: 108,
        },
        teamCellSmall: {
          flex: 1.5,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingLeft: 2,
          minWidth: 84,
        },
        teamName: {
          color: theme.colors.text,
          fontSize: 12,
          fontWeight: '600',
          flex: 1,
          fontFamily: theme.fontFamily.regular,
        },
        statsCell: {
          width: 30,
        },
        goalsCell: {
          width: 44,
        },
        pointsCell: {
          width: 40,
        },
        pointsText: {
          fontWeight: '700',
          color: theme.colors.accent,
          fontFamily: theme.fontFamily.regular,
        },
      }),
    [theme]
  );

  // Use provided standings if available, otherwise calculate
  const calculateStandings = (): TeamStanding[] => {
    // If standings are provided, use them (for results screen)
    if (providedStandings && providedStandings.length > 0) {
      return providedStandings.map((s) => ({
        teamId: s.teamId,
        teamCode: s.teamCode,
        teamName: s.teamName,
        played: s.played,
        won: s.won,
        drawn: s.drawn,
        lost: s.lost,
        goalsFor: 0, // Not needed for display
        goalsAgainst: 0, // Not needed for display
        goalDifference: s.goalDifference,
        points: s.points,
      }));
    }
    const standingsMap: Record<string, TeamStanding> = {};

    // Initialize all teams in the group from fixtures (all teams that appear in matches)
    fixtures.forEach((match) => {
      if (match.home_team && !standingsMap[match.home_team.id]) {
        standingsMap[match.home_team.id] = {
          teamId: match.home_team.id,
          teamCode: match.home_team.country_code,
          teamName: match.home_team.country_name,
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

      // Process match result if prediction exists with valid scores
      const prediction = predictions[match.id];
      if (prediction && match.home_team && match.away_team) {
        const homeScore = prediction.home_score ?? null;
        const awayScore = prediction.away_score ?? null;

        if (homeScore !== null && awayScore !== null && !isNaN(homeScore) && !isNaN(awayScore)) {
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

    // Convert to array and sort
    const standings = Object.values(standingsMap);
    standings.sort((a, b) => {
      // Sort by points (descending)
      if (b.points !== a.points) return b.points - a.points;
      // Then by goal difference (descending)
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      // Then by goals for (descending)
      return b.goalsFor - a.goalsFor;
    });

    return standings;
  };

  const standings = calculateStandings();
  
  // Sort by position if standings are provided
  const sortedStandings = providedStandings 
    ? standings.sort((a, b) => {
        const aPos = providedStandings.find((s) => s.teamId === a.teamId)?.position ?? 999;
        const bPos = providedStandings.find((s) => s.teamId === b.teamId)?.position ?? 999;
        return aPos - bPos;
      })
    : standings;

  return (
    <View style={styles.tableContainer}>
      {/* Table Header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.headerCell, styles.positionCell]}>Pos</Text>
        <Text style={[styles.headerCell, IS_SMALL_SCREEN ? styles.teamCellSmall : styles.teamCell]}>Team</Text>
        {!IS_VERY_SMALL_SCREEN && <Text style={[styles.headerCell, styles.statsCell]}>P</Text>}
        <Text style={[styles.headerCell, styles.statsCell]}>W</Text>
        <Text style={[styles.headerCell, styles.statsCell]}>D</Text>
        <Text style={[styles.headerCell, styles.statsCell]}>L</Text>
        <Text style={[styles.headerCell, styles.goalsCell]}>GD</Text>
        <Text style={[styles.headerCell, styles.pointsCell]}>Pts</Text>
      </View>

      {/* Table Rows */}
      {sortedStandings.map((team, index) => {
        const isAdvancing = advancingTeams?.has(team.teamId) ?? false;
        const isKnockedOut = knockedOutTeams?.has(team.teamId) ?? false;
        const position = providedStandings?.[index]?.position ?? (index + 1);
        
        return (
        <View key={team.teamId} style={[styles.tableRow, (isAdvancing || isKnockedOut) && styles.tableRowWithOverlay]}>
          {/* Overlay */}
          {(isAdvancing || isKnockedOut) && (
            <View 
              style={[
                styles.overlay,
                isAdvancing && styles.advancingOverlay,
                isKnockedOut && styles.knockedOutOverlay,
              ]}
            />
          )}
          <Text style={[styles.cell, styles.positionCell]}>{position}</Text>
          <View style={IS_SMALL_SCREEN ? styles.teamCellSmall : styles.teamCell}>
            <CountryFlag
              countryCode={team.teamCode}
              countryName={team.teamName}
              flagSize={22}
              showName={false}
            />
            <Text style={styles.teamName} numberOfLines={1} ellipsizeMode="tail">
              {team.teamName}
            </Text>
          </View>
          {!IS_VERY_SMALL_SCREEN && <Text style={[styles.cell, styles.statsCell]}>{team.played}</Text>}
          <Text style={[styles.cell, styles.statsCell]}>{team.won}</Text>
          <Text style={[styles.cell, styles.statsCell]}>{team.drawn}</Text>
          <Text style={[styles.cell, styles.statsCell]}>{team.lost}</Text>
          <Text style={[styles.cell, styles.goalsCell]}>
            {team.goalDifference > 0 ? '+' : ''}{team.goalDifference}
          </Text>
          <Text style={[styles.cell, styles.pointsCell, styles.pointsText]}>
            {team.points}
          </Text>
        </View>
        );
      })}
    </View>
  );
}
