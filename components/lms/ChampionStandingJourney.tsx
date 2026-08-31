import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import { lmsDisplayTeamName } from '@/lib/lms/teamColours';
import type { LmsCompletedPick, LmsParticipant, LmsTeam } from '@/lib/lms/api';

export type ChampionJourneyStep = {
  gameweekNumber: number;
  team: LmsTeam | undefined;
  result: string;
  knockedOut: number;
  remaining: number;
};

type Props = {
  champion: LmsParticipant;
  steps: ChampionJourneyStep[];
  totalPlayers: number;
  isYou?: boolean;
};

function resultLabel(result: string): string {
  if (result === 'correct') return 'Won';
  if (result === 'incorrect') return 'Out';
  if (!result) return '—';
  return result;
}

function resultColor(result: string, accent: string, error: string, muted: string): string {
  if (result === 'correct') return accent;
  if (result === 'incorrect') return error;
  return muted;
}

/** Standing view when a competition has a champion — GW-by-GW road to the title. */
export function ChampionStandingJourney({ champion, steps, totalPlayers, isYou }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const name = champion.username?.trim() || champion.user_id.slice(0, 8);

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="trophy" size={22} color={theme.colors.accent} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>Champion</Text>
          <Text style={styles.heroName}>
            {name}
            {isYou ? ' (you)' : ''}
          </Text>
          <Text style={styles.heroMeta}>
            {steps.length} gameweek{steps.length === 1 ? '' : 's'} · started with {totalPlayers}{' '}
            player{totalPlayers === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      <Text style={styles.intro}>
        The winning run — each card is a gameweek pick, how many were knocked out that week, and
        how many were still standing after.
      </Text>

      <View style={styles.timeline}>
        {steps.map((step, index) => (
          <View key={`gw-${step.gameweekNumber}`} style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <Text style={styles.stepGw}>Gameweek {step.gameweekNumber}</Text>
              <Text
                style={[
                  styles.stepResult,
                  {
                    color: resultColor(
                      step.result,
                      theme.colors.accent,
                      theme.colors.error,
                      theme.colors.textMuted
                    ),
                  },
                ]}
              >
                {resultLabel(step.result)}
              </Text>
            </View>

            <View style={styles.teamRow}>
              {step.team ? (
                <>
                  <TeamColourChip
                    shortName={step.team.short_name}
                    name={step.team.name}
                    slug={step.team.slug}
                    size={36}
                  />
                  <View style={styles.teamCopy}>
                    <Text style={styles.teamLabel}>Team selected</Text>
                    <Text style={styles.teamName} numberOfLines={2}>
                      {lmsDisplayTeamName(step.team.name)}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={styles.teamMissing}>No pick recorded</Text>
              )}
            </View>

            <View style={styles.stepFooter}>
              <Text style={styles.stepStat}>
                {step.knockedOut} knocked out
              </Text>
              <Text style={styles.stepDot}>·</Text>
              <Text style={styles.stepStat}>{step.remaining} remaining</Text>
            </View>

            {index < steps.length - 1 ? <View style={styles.connector} /> : null}
          </View>
        ))}

        <View style={[styles.stepCard, styles.championCard]}>
          <View style={styles.championRow}>
            <View style={styles.championBadge}>
              <Ionicons name="trophy" size={20} color={theme.colors.accent} />
            </View>
            <View style={styles.championCopy}>
              <Text style={styles.championTitle}>Champion</Text>
              <Text style={styles.championName} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.championMeta}>1 remaining · last one standing</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

export function buildChampionJourney(
  champion: LmsParticipant,
  picks: LmsCompletedPick[],
  participants: LmsParticipant[]
): ChampionJourneyStep[] {
  const ordered = [...picks].sort((a, b) => a.gameweek_number - b.gameweek_number);
  if (!ordered.length) return [];

  const knockedOutByGwId = new Map<string, number>();
  for (const p of participants) {
    if (!p.eliminated_gameweek_id) continue;
    knockedOutByGwId.set(
      p.eliminated_gameweek_id,
      (knockedOutByGwId.get(p.eliminated_gameweek_id) ?? 0) + 1
    );
  }

  let remaining = participants.length;
  return ordered.map((pick) => {
    const knockedOut = knockedOutByGwId.get(pick.gameweek_id) ?? 0;
    remaining = Math.max(1, remaining - knockedOut);
    return {
      gameweekNumber: pick.gameweek_number,
      team: pick.team,
      result: pick.result,
      knockedOut,
      remaining,
    };
  });
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    wrap: {
      gap: theme.spacing.md,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accent,
      padding: theme.spacing.md,
    },
    heroIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentMuted,
    },
    heroCopy: {
      flex: 1,
      gap: 2,
    },
    heroEyebrow: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: theme.colors.accent,
    },
    heroName: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 20,
      color: theme.colors.text,
    },
    heroMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    intro: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
    timeline: {
      gap: theme.spacing.sm,
    },
    stepCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.md,
    },
    stepHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    stepGw: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 16,
      color: theme.colors.text,
    },
    stepResult: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    teamRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      minHeight: 52,
    },
    teamCopy: {
      flex: 1,
      gap: 2,
    },
    teamLabel: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: theme.colors.textMuted,
    },
    teamName: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 16,
      color: theme.colors.text,
    },
    teamMissing: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    stepFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.border,
    },
    stepStat: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    stepDot: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    connector: {
      alignSelf: 'center',
      width: 2,
      height: 10,
      marginTop: -6,
      marginBottom: -6,
      backgroundColor: theme.colors.border,
    },
    championCard: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentMuted,
    },
    championRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    championBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.accent,
    },
    championCopy: {
      flex: 1,
      gap: 2,
    },
    championTitle: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: theme.colors.accent,
    },
    championName: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 18,
      color: theme.colors.text,
    },
    championMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
  });
}
