import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import type { LmsUserPoolTeam } from '@/lib/lms/api';

const COLS = 5;

type Props = {
  competitionName: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  competitions: { competition_id: string; name: string }[];
  selectedCompetitionId: string | null;
  onSelectCompetition: (id: string) => void;
  teams: LmsUserPoolTeam[];
  loading?: boolean;
};

export function LmsUserPoolGrid({
  competitionName,
  menuOpen,
  onToggleMenu,
  competitions,
  selectedCompetitionId,
  onSelectCompetition,
  teams,
  loading,
}: Props) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.colors.textMuted, fontFamily: theme.fontFamily.baiBold }]}>
          Your pool
        </Text>
        {competitions.length > 1 ? (
          <Pressable
            style={[styles.dropdown, { borderColor: theme.colors.border }]}
            onPress={onToggleMenu}
            accessibilityRole="button"
            accessibilityState={{ expanded: menuOpen }}
            accessibilityLabel="Choose competition for pool view"
          >
            <Text style={[styles.dropdownText, { color: theme.colors.text }]} numberOfLines={1}>
              {competitionName}
            </Text>
            <Ionicons
              name={menuOpen ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={theme.colors.textMuted}
            />
          </Pressable>
        ) : (
          <Text style={[styles.singleLeague, { color: theme.colors.textMuted }]} numberOfLines={1}>
            {competitionName}
          </Text>
        )}
      </View>

      {menuOpen && competitions.length > 1 ? (
        <View style={[styles.menu, { borderColor: theme.colors.border }]}>
          {competitions.map((c, i) => {
            const active = c.competition_id === selectedCompetitionId;
            return (
              <Pressable
                key={c.competition_id}
                style={[
                  styles.menuItem,
                  { borderBottomColor: theme.colors.border },
                  i === competitions.length - 1 && styles.menuItemLast,
                  active && { backgroundColor: theme.colors.accentMuted },
                ]}
                onPress={() => onSelectCompetition(c.competition_id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.menuItemText,
                    { color: active ? theme.colors.accent : theme.colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {loading && teams.length === 0 ? (
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>Loading…</Text>
      ) : teams.length === 0 ? (
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
          No teams in this competition pool.
        </Text>
      ) : (
        <View style={styles.grid}>
          {teams.map((entry) => {
            const abbrev =
              entry.team.short_name ||
              entry.team.name?.slice(0, 3).toUpperCase() ||
              '—';
            return (
              <View
                key={entry.team_id}
                style={[styles.cell, { width: `${100 / COLS}%` }]}
                accessibilityLabel={
                  entry.used
                    ? `${abbrev}, used in gameweek ${entry.gameweek_number}`
                    : `${abbrev}, still available`
                }
              >
                <View style={styles.crestStack}>
                  <View style={[styles.chipWrap, entry.used && styles.chipWrapUsed]}>
                    <TeamColourChip
                      shortName={entry.team.short_name}
                      name={entry.team.name}
                      slug={entry.team.slug}
                      size={34}
                    />
                  </View>
                  {entry.used && entry.gameweek_number != null ? (
                    <View
                      style={[
                        styles.gwBadge,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: theme.colors.accent,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.gwTag,
                          {
                            color: theme.colors.accent,
                            fontFamily: theme.fontFamily.baiBold,
                          },
                        ]}
                      >
                        GW{entry.gameweek_number}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.abbrev,
                    {
                      color: entry.used ? theme.colors.textMuted : theme.colors.text,
                      fontFamily: theme.fontFamily.baiSemiBold,
                      opacity: entry.used ? 0.55 : 1,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {abbrev}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  dropdown: {
    flex: 1,
    maxWidth: '62%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
  },
  dropdownText: {
    flex: 1,
    fontFamily: 'BaiJamjuree-Medium',
    fontSize: 12,
    textAlign: 'right',
  },
  singleLeague: {
    flex: 1,
    fontFamily: 'BaiJamjuree-Light',
    fontSize: 11,
    textAlign: 'right',
  },
  menu: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemText: {
    fontFamily: 'BaiJamjuree-Medium',
    fontSize: 13,
  },
  meta: {
    fontFamily: 'BaiJamjuree-Light',
    fontSize: 12,
    paddingVertical: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -2,
  },
  cell: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    gap: 3,
    minWidth: 0,
  },
  crestStack: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipWrap: {
    opacity: 1,
  },
  chipWrapUsed: {
    opacity: 0.22,
  },
  gwBadge: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  abbrev: {
    fontSize: 10,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  gwTag: {
    fontSize: 9,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
