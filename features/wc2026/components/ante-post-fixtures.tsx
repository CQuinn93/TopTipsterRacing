import { useMemo } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextStyle,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { type Match } from '@/features/wc2026/services/fixtures';
import { type Prediction } from '@/features/wc2026/services/predictions';
import { CountryFlag } from '@/features/wc2026/components/CountryFlag';

/** Inner field only — border lives on `scoreInputShell` for consistent layout. */
const scoreFieldPlatformStyle = Platform.select<TextStyle | undefined>({
  android: { textAlignVertical: 'center', includeFontPadding: false },
  ios: {},
  // RN TextStyle typings omit web-only outline props; cast keeps focus ring off on web.
  web: { outlineStyle: 'none' } as unknown as TextStyle,
  default: {},
});

/** Common scorelines — tap to fill both boxes for this match. */
const QUICK_SCORE_PRESETS: ReadonlyArray<{ label: string; home: number; away: number }> = [
  { label: '1–0', home: 1, away: 0 },
  { label: '0–0', home: 0, away: 0 },
  { label: '0–1', home: 0, away: 1 },
  { label: '2–1', home: 2, away: 1 },
  { label: '2–0', home: 2, away: 0 },
  { label: '0–2', home: 0, away: 2 },
  { label: '1–2', home: 1, away: 2 },
];

interface AntePostFixturesProps {
  fixtures: Match[];
  predictions: Record<string, Prediction>;
  onScoreChange: (matchId: string, homeScore: number | null, awayScore: number | null) => void;
  disabled?: boolean;
  scrollViewRef?: React.RefObject<any>;
}

export function AntePostFixtures({
  fixtures,
  predictions,
  onScoreChange,
  disabled = false,
  scrollViewRef,
}: AntePostFixturesProps) {
  const theme = useTheme();
  const layoutStyles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          gap: theme.spacing.sm,
        },
        groupCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        cardHeader: {
          backgroundColor: theme.colors.surfaceElevated,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        headerText: {
          color: theme.colors.text,
          fontSize: 13,
          fontWeight: '700',
          textAlign: 'center',
          fontFamily: theme.fontFamily.regular,
        },
        fixturesList: {
          gap: 0,
        },
      }),
    [theme]
  );

  return (
    <View style={layoutStyles.container}>
      <View style={layoutStyles.groupCard}>
        <View style={layoutStyles.cardHeader}>
          <Text style={layoutStyles.headerText}>Fixtures</Text>
        </View>

        <View style={layoutStyles.fixturesList}>
          {fixtures.map((match, index) => (
            <FixtureInput
              key={match.id}
              match={match}
              matchIndexInGroup={index}
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
  /** 0-based order within the current group tab (for labelling if `match_number` is missing). */
  matchIndexInGroup: number;
  prediction?: Prediction;
  onScoreChange: (matchId: string, homeScore: number | null, awayScore: number | null) => void;
  disabled?: boolean;
  scrollViewRef?: React.RefObject<any>;
  isLast?: boolean;
}

function FixtureInput({
  match,
  matchIndexInGroup,
  prediction,
  onScoreChange,
  disabled = false,
  scrollViewRef,
  isLast = false,
}: FixtureInputProps) {
  const theme = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        matchCell: {
          width: '100%',
          paddingHorizontal: theme.spacing.sm,
          paddingTop: theme.spacing.md,
        },
        matchRowInner: {
          borderRadius: theme.radius.sm,
          paddingBottom: theme.spacing.sm,
        },
        matchRowFilled: {
          backgroundColor: theme.colors.accentMuted,
        },
        matchHeaderText: {
          width: '100%',
          textAlign: 'center',
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '800',
          color: theme.colors.text,
          marginBottom: theme.spacing.sm,
        },
        matchContentOuter: {
          width: '100%',
          alignItems: 'stretch',
        },
        /** Symmetric grid: home block | score | vs | score | away block — keeps inputs on one vertical line. */
        matchContent: {
          flexDirection: 'row',
          alignItems: 'center',
          width: '100%',
          minHeight: 56,
        },
        sideColumn: {
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
        },
        homeSideColumn: {
          justifyContent: 'flex-end',
          paddingRight: 6,
        },
        awaySideColumn: {
          justifyContent: 'flex-start',
          paddingLeft: 6,
        },
        teamBlock: {
          width: 124,
          maxWidth: '100%',
          flexShrink: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        },
        teamInfo: {
          alignItems: 'center',
          gap: 4,
          width: '100%',
        },
        teamName: {
          color: theme.colors.text,
          fontSize: 12,
          fontWeight: '600',
          textAlign: 'center',
          width: '100%',
          lineHeight: 15,
          fontFamily: theme.fontFamily.regular,
        },
        vsText: {
          width: 22,
          flexShrink: 0,
          textAlign: 'center',
          color: theme.colors.textMuted,
          fontSize: 14,
          fontWeight: '700',
          fontFamily: theme.fontFamily.regular,
        },
        scoreInputShell: {
          width: 48,
          height: 40,
          flexShrink: 0,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          justifyContent: 'center',
          overflow: 'hidden',
        },
        scoreInputShellFilled: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        scoreInputField: {
          flex: 1,
          width: '100%',
          height: 40,
          margin: 0,
          paddingHorizontal: 0,
          paddingVertical: 0,
          borderWidth: 0,
          backgroundColor: 'transparent',
          fontSize: 20,
          fontWeight: '900',
          color: theme.colors.text,
          textAlign: 'center',
          fontFamily: theme.fontFamily.regular,
          ...(Platform.OS === 'ios' ? { paddingTop: 2 } : {}),
          ...(Platform.OS === 'web' ? { lineHeight: 22 } : {}),
        },
        quickPickBlock: {
          marginTop: theme.spacing.sm,
          paddingTop: theme.spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          width: '100%',
          alignItems: 'center',
        },
        quickPickLabel: {
          width: '100%',
          textAlign: 'center',
          fontFamily: theme.fontFamily.light,
          fontSize: 11,
          color: theme.colors.textMuted,
          marginBottom: 4,
        },
        quickPickHint: {
          width: '100%',
          textAlign: 'center',
          fontFamily: theme.fontFamily.light,
          fontSize: 10,
          color: theme.colors.accent,
          marginBottom: 8,
          lineHeight: 14,
        },
        quickPickScrollContent: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingHorizontal: 4,
          flexGrow: 1,
          minWidth: '100%',
        },
        quickPickChip: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
        quickPickChipActive: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        quickPickChipText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          fontWeight: '600',
          color: theme.colors.text,
        },
        quickPickChipTextActive: {
          color: theme.colors.accent,
        },
        matchDivider: {
          marginTop: theme.spacing.md,
          height: 3,
          width: '100%',
          borderRadius: 2,
          backgroundColor: theme.colors.accent,
          opacity: 0.85,
        },
      }),
    [theme]
  );

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

  const getCountryCode = (countryName: string): string => {
    return countryName.toUpperCase().slice(0, 2);
  };

  const curHome = prediction?.home_score;
  const curAway = prediction?.away_score;
  const hasNumericPair =
    typeof curHome === 'number' &&
    typeof curAway === 'number' &&
    curHome !== null &&
    curAway !== null;

  const groupLabel = match.group?.group_name ?? '—';
  const matchNo = match.match_number ?? matchIndexInGroup + 1;

  return (
    <View style={styles.matchCell}>
      <View style={[styles.matchRowInner, hasPrediction && styles.matchRowFilled]}>
        <Text style={styles.matchHeaderText}>{`Group ${groupLabel} · Match ${matchNo}`}</Text>
        <View style={styles.matchContentOuter}>
          <View style={styles.matchContent}>
            <View style={[styles.sideColumn, styles.homeSideColumn]}>
              <View style={styles.teamBlock}>
                <View style={styles.teamInfo}>
                  {match.home_team && (
                    <>
                      <CountryFlag
                        countryCode={match.home_team.country_code || getCountryCode(match.home_team.country_name)}
                        countryName={match.home_team.country_name}
                        flagSize={26}
                        showName={false}
                        align="center"
                      />
                      <Text style={styles.teamName} numberOfLines={2} ellipsizeMode="tail">
                        {match.home_team.country_name}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>

            <View style={[styles.scoreInputShell, hasPrediction && styles.scoreInputShellFilled]}>
              <TextInput
                style={[styles.scoreInputField, scoreFieldPlatformStyle]}
                value={homeScore}
                onChangeText={handleHomeScoreChange}
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
                maxLength={2}
                textAlign="center"
                editable={!disabled}
                multiline={false}
              />
            </View>

            <Text style={styles.vsText}>–</Text>

            <View style={[styles.scoreInputShell, hasPrediction && styles.scoreInputShellFilled]}>
              <TextInput
                style={[styles.scoreInputField, scoreFieldPlatformStyle]}
                value={awayScore}
                onChangeText={handleAwayScoreChange}
                placeholder="0"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
                maxLength={2}
                textAlign="center"
                editable={!disabled}
                multiline={false}
              />
            </View>

            <View style={[styles.sideColumn, styles.awaySideColumn]}>
              <View style={styles.teamBlock}>
                <View style={styles.teamInfo}>
                  {match.away_team && (
                    <>
                      <CountryFlag
                        countryCode={match.away_team.country_code || getCountryCode(match.away_team.country_name)}
                        countryName={match.away_team.country_name}
                        flagSize={26}
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
        </View>

      {!disabled && (
        <View style={styles.quickPickBlock}>
          <Text style={styles.quickPickLabel}>Quick scores for this match</Text>
          <Text style={styles.quickPickHint}>
            You can also tap the boxes above and type any score you want.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ width: '100%' }}
            contentContainerStyle={styles.quickPickScrollContent}
          >
            {QUICK_SCORE_PRESETS.map((p) => {
              const isActive = hasNumericPair && curHome === p.home && curAway === p.away;
              return (
                <TouchableOpacity
                  key={`${p.home}-${p.away}`}
                  style={[styles.quickPickChip, isActive && styles.quickPickChipActive]}
                  onPress={() => onScoreChange(match.id, p.home, p.away)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Set score ${p.label}`}
                >
                  <Text style={[styles.quickPickChipText, isActive && styles.quickPickChipTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
      </View>
      {!isLast ? <View style={styles.matchDivider} /> : null}
    </View>
  );
}
