import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import type { LmsCompletedPick, LmsParticipant, LmsTeam } from '@/lib/lms/api';

type Props = {
  players: LmsParticipant[];
  picksByUserId: Map<string, LmsCompletedPick[]>;
  onPressPlayer?: (userId: string) => void;
};

/** Between-GW standing: compact player cards (3 across) with used-team icons. */
export function StandingPlayerCards({ players, picksByUserId, onPressPlayer }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  return (
    <View style={styles.grid}>
      {players.map((p) => {
        const picks = [...(picksByUserId.get(p.user_id) ?? [])].sort(
          (a, b) => a.gameweek_number - b.gameweek_number
        );
        const name = p.username?.trim() || p.user_id.slice(0, 8);
        const alive = p.status === 'active' || p.status === 'winner';
        return (
          <Pressable
            key={p.id}
            style={[
              styles.card,
              {
                borderColor: alive ? theme.colors.accent : theme.colors.error,
                borderWidth: 1.5,
              },
            ]}
            onPress={() => onPressPlayer?.(p.user_id)}
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${alive ? 'still in' : 'eliminated'}, ${picks.length} teams used`}
          >
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {p.status === 'winner'
                ? 'Winner'
                : p.status === 'eliminated'
                  ? 'Out'
                  : 'Alive'}
              {picks.length ? ` · ${picks.length} used` : ''}
            </Text>
            {picks.length === 0 ? (
              <Text style={styles.empty}>No picks yet</Text>
            ) : (
              <View style={styles.iconGrid}>
                {picks.map((pick) => (
                  <View key={`${pick.gameweek_id}-${pick.team_id}`} style={styles.iconCell}>
                    <TeamColourChip
                      shortName={pick.team?.short_name}
                      name={pick.team?.name}
                      slug={pick.team?.slug}
                      size={22}
                    />
                    <Text style={styles.gwLabel}>GW{pick.gameweek_number}</Text>
                  </View>
                ))}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

type PoolRowProps = {
  player: LmsParticipant;
  poolTeams: LmsTeam[];
  picks: LmsCompletedPick[];
  onPress?: () => void;
  /** Larger type/chips for venue hub tablets. */
  large?: boolean;
};

/** One compact pool strip: 5 cols, check/X overlays for W/L picks. */
export function StandingPlayerPoolCard({
  player,
  poolTeams,
  picks,
  onPress,
  large = false,
}: PoolRowProps) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const pickByTeamId = new Map(picks.map((p) => [p.team_id, p]));
  const name = player.username?.trim() || player.user_id.slice(0, 8);
  const alive = player.status === 'active' || player.status === 'winner';
  const chipSize = large ? 32 : 22;
  const markSize = large ? 16 : 14;
  const markIcon = large ? 12 : 10;

  return (
    <Pressable
      style={[
        styles.poolCard,
        large && styles.poolCardLarge,
        {
          borderColor: alive ? theme.colors.accent : theme.colors.error,
          borderWidth: large ? 2 : 1.5,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} pool, ${alive ? 'still in' : 'eliminated'}`}
    >
      <View style={styles.poolHead}>
        <Text style={[styles.poolName, large && styles.poolNameLarge]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.poolMeta, large && styles.poolMetaLarge]}>
          {player.status === 'winner'
            ? 'Winner'
            : player.status === 'eliminated'
              ? 'Out'
              : 'Alive'}
        </Text>
      </View>
      <View style={styles.poolGrid}>
        {poolTeams.map((team) => {
          const pick = pickByTeamId.get(team.id);
          const won = pick?.result === 'correct';
          const lost = pick?.result === 'incorrect';
          return (
            <View key={team.id} style={[styles.poolCell, large && styles.poolCellLarge]}>
              <View style={[styles.crestWrap, large && styles.crestWrapLarge, pick && styles.crestUsed]}>
                <TeamColourChip
                  shortName={team.short_name}
                  name={team.name}
                  slug={team.slug}
                  size={chipSize}
                />
                {won ? (
                  <View
                    style={[
                      styles.mark,
                      large && styles.markLarge,
                      {
                        backgroundColor: theme.colors.accent,
                        width: markSize,
                        height: markSize,
                        borderRadius: markSize / 2,
                      },
                    ]}
                  >
                    <Ionicons name="checkmark" size={markIcon} color={theme.colors.white} />
                  </View>
                ) : null}
                {lost ? (
                  <View
                    style={[
                      styles.mark,
                      large && styles.markLarge,
                      {
                        backgroundColor: theme.colors.error,
                        width: markSize,
                        height: markSize,
                        borderRadius: markSize / 2,
                      },
                    ]}
                  >
                    <Ionicons name="close" size={markIcon} color={theme.colors.white} />
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.poolAbbrev,
                  large && styles.poolAbbrevLarge,
                  pick && styles.poolAbbrevUsed,
                ]}
                numberOfLines={1}
              >
                {team.short_name || team.name.slice(0, 3)}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    card: {
      width: '31.5%',
      flexGrow: 1,
      flexBasis: '30%',
      maxWidth: '32.5%',
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      paddingHorizontal: 8,
      paddingVertical: 8,
      gap: 4,
      minHeight: 96,
    },
    name: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 12,
      color: theme.colors.text,
    },
    meta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 10,
      color: theme.colors.textMuted,
    },
    empty: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 10,
      color: theme.colors.textMuted,
      marginTop: 6,
    },
    iconGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 4,
    },
    iconCell: {
      width: '30%',
      alignItems: 'center',
      gap: 1,
    },
    gwLabel: {
      fontFamily: theme.fontFamily.baiBold,
      fontSize: 8,
      color: theme.colors.accent,
      letterSpacing: 0.2,
    },
    poolCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      paddingHorizontal: 8,
      paddingVertical: 8,
      gap: 6,
    },
    poolCardLarge: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
      borderRadius: theme.radius.lg,
    },
    poolHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
    },
    poolName: {
      flex: 1,
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 13,
      color: theme.colors.text,
    },
    poolNameLarge: {
      fontSize: 20,
    },
    poolMeta: {
      fontFamily: theme.fontFamily.baiLight,
      fontSize: 11,
      color: theme.colors.textMuted,
    },
    poolMetaLarge: {
      fontSize: 15,
    },
    poolGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    poolCell: {
      width: '20%',
      alignItems: 'center',
      paddingVertical: 3,
      gap: 2,
    },
    poolCellLarge: {
      paddingVertical: 6,
      gap: 4,
    },
    crestWrap: {
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    crestWrapLarge: {
      width: 32,
      height: 32,
    },
    crestUsed: {
      opacity: 0.45,
    },
    mark: {
      position: 'absolute',
      right: -4,
      bottom: -3,
      width: 14,
      height: 14,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.surface,
    },
    markLarge: {
      right: -5,
      bottom: -4,
    },
    poolAbbrev: {
      fontFamily: theme.fontFamily.baiSemiBold,
      fontSize: 9,
      color: theme.colors.text,
      letterSpacing: 0.2,
    },
    poolAbbrevLarge: {
      fontSize: 12,
    },
    poolAbbrevUsed: {
      color: theme.colors.textMuted,
    },
  });
}
