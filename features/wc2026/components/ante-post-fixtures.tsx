import { StyleSheet, Text, View, TextInput } from 'react-native';

import { DesignColors } from '@/features/wc2026/constants/design-colors';
import { type Match } from '@/features/wc2026/services/fixtures';
import { type Prediction } from '@/features/wc2026/services/predictions';
import { CountryFlag } from '@/features/wc2026/components/CountryFlag';

interface AntePostFixturesProps {
  fixtures: Match[];
  predictions: Record<string, Prediction>;
  onScoreChange: (matchId: string, homeScore: number | null, awayScore: number | null) => void;
  disabled?: boolean;
  scrollViewRef?: React.RefObject<any>;
}

export function AntePostFixtures({ fixtures, predictions, onScoreChange, disabled = false, scrollViewRef }: AntePostFixturesProps) {
  return (
    <View style={styles.container}>
      <View style={styles.groupCard}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <Text style={styles.headerText}>Fixtures</Text>
        </View>

        {/* All matches in the group */}
        <View style={styles.fixturesList}>
          {fixtures.map((match, index) => (
            <FixtureInput
              key={match.id}
              match={match}
              prediction={predictions[match.id]}
              onScoreChange={onScoreChange}
              disabled={disabled}
              scrollViewRef={scrollViewRef}
              isLast={index === fixtures.length - 1}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

interface FixtureInputProps {
  match: Match;
  prediction?: Prediction;
  onScoreChange: (matchId: string, homeScore: number | null, awayScore: number | null) => void;
  disabled?: boolean;
  scrollViewRef?: React.RefObject<any>;
  isLast?: boolean;
}

function FixtureInput({ match, prediction, onScoreChange, disabled = false, scrollViewRef, isLast = false }: FixtureInputProps) {
  const hasPrediction = 
    prediction && 
    prediction.home_score !== null && 
    prediction.home_score !== undefined &&
    prediction.away_score !== null && 
    prediction.away_score !== undefined;

  const homeScore = prediction?.home_score?.toString() || '';
  const awayScore = prediction?.away_score?.toString() || '';

  const handleHomeScoreChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    const score = cleaned === '' ? null : parseInt(cleaned, 10);
    const awayScoreNum = awayScore === '' ? null : parseInt(awayScore, 10);
    onScoreChange(match.id, score, awayScoreNum);
  };

  const handleAwayScoreChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    const score = cleaned === '' ? null : parseInt(cleaned, 10);
    const homeScoreNum = homeScore === '' ? null : parseInt(homeScore, 10);
    onScoreChange(match.id, homeScoreNum, score);
  };

  // Get country codes for flags (using ISO codes from country names)
  const getCountryCode = (countryName: string): string => {
    // This is a simplified mapping - you may need to expand this based on your data
    // The CountryFlag component should handle the mapping, but we pass the name as a fallback
    return countryName.toUpperCase().slice(0, 2);
  };

  return (
    <View style={[
      styles.matchRow, 
      hasPrediction && styles.matchRowFilled,
      isLast && styles.lastMatchRow
    ]}>
      {/* Content */}
      <View style={styles.matchContent}>
        {/* Home Team */}
        <View style={styles.teamSection}>
          <View style={styles.teamInfo}>
            {match.home_team && (
              <>
                <CountryFlag
                  countryCode={match.home_team.country_code || getCountryCode(match.home_team.country_name)}
                  countryName={match.home_team.country_name}
                  flagSize={30}
                  showName={false}
                  align="center"
                />
                <Text style={styles.teamName} numberOfLines={2} ellipsizeMode="tail">
                  {match.home_team.country_name}
                </Text>
              </>
            )}
          </View>
          <TextInput
            style={[styles.scoreInput, hasPrediction && styles.scoreInputFilled]}
            value={homeScore}
            onChangeText={handleHomeScoreChange}
            placeholder="0"
            placeholderTextColor="rgba(170, 173, 173, 0.5)"
            keyboardType="numeric"
            maxLength={2}
            textAlign="center"
            editable={!disabled}
          />
        </View>

        {/* VS */}
        <Text style={styles.vsText}> - </Text>

        {/* Away Team */}
        <View style={styles.teamSection}>
          <TextInput
            style={[styles.scoreInput, hasPrediction && styles.scoreInputFilled]}
            value={awayScore}
            onChangeText={handleAwayScoreChange}
            placeholder="0"
            placeholderTextColor="rgba(170, 173, 173, 0.5)"
            keyboardType="numeric"
            maxLength={2}
            textAlign="center"
            editable={!disabled}
          />
          <View style={styles.teamInfo}>
            {match.away_team && (
              <>
                <CountryFlag
                  countryCode={match.away_team.country_code || getCountryCode(match.away_team.country_name)}
                  countryName={match.away_team.country_name}
                  flagSize={30}
                  showName={false}
                  align="center"
                />
                <Text style={styles.teamName} numberOfLines={2} ellipsizeMode="tail">
                  {match.away_team.country_name}
                </Text>
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  groupCard: {
    backgroundColor: DesignColors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: DesignColors.primary,
  },
  cardHeader: {
    backgroundColor: DesignColors.text,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 2,
    borderBottomColor: DesignColors.text,
  },
  headerText: {
    color: DesignColors.textOnDark,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  fixturesList: {
    gap: 0,
  },
  matchRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(71, 74, 74, 0.1)',
  },
  matchRowFilled: {
    backgroundColor: DesignColors.primary + '10',
  },
  lastMatchRow: {
    borderBottomWidth: 0,
  },
  matchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamInfo: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  teamName: {
    color: DesignColors.text,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 100,
  },
  vsText: {
    color: DesignColors.text,
    fontSize: 18,
    fontWeight: '700',
    marginHorizontal: 12,
    opacity: 0.5,
  },
  scoreInput: {
    width: 60,
    height: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: DesignColors.text,
    backgroundColor: DesignColors.surface,
    fontSize: 20,
    fontWeight: '700',
    color: DesignColors.primary,
  },
  scoreInputFilled: {
    borderColor: DesignColors.primary,
    backgroundColor: DesignColors.primary + '20',
  },
});
