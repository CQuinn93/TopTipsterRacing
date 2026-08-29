import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import type { F2tSelectablePlayer, F2tSelectionRow } from '@/lib/f2t/api';
import {
  formatFplAvailability,
  fplStatusAccentColor,
} from '@/lib/f2t/fplAvailability';

type PositionFilter = 'ALL' | 'GK' | 'DEF' | 'MID' | 'FWD';
type SortKey = 'name' | 'goals' | 'assists' | 'form' | 'xg';
type DropdownKey = 'position' | 'team' | 'sort' | null;

const POSITION_OPTIONS: { value: PositionFilter; label: string }[] = [
  { value: 'ALL', label: 'All positions' },
  { value: 'GK', label: 'GK' },
  { value: 'DEF', label: 'DEF' },
  { value: 'MID', label: 'MID' },
  { value: 'FWD', label: 'FWD' },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'goals', label: 'Goals' },
  { value: 'assists', label: 'Assists' },
  { value: 'form', label: 'Form' },
  { value: 'xg', label: 'xG' },
  { value: 'name', label: 'Name' },
];

function numStat(stats: Record<string, unknown> | undefined, ...keys: string[]): number | null {
  if (!stats) return null;
  for (const k of keys) {
    const v = stats[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function formatStat(value: number | null, decimals = 0): string {
  if (value == null) return '—';
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}

/** FPL form bands: low / mid / strong recent points. */
function formTone(form: number | null): { fg: string; bg: string } | null {
  if (form == null) return null;
  if (form < 3) return { fg: '#ef4444', bg: 'rgba(239, 68, 68, 0.18)' };
  if (form < 7) return { fg: '#f97316', bg: 'rgba(249, 115, 22, 0.18)' };
  return { fg: '#15803d', bg: 'rgba(21, 128, 61, 0.2)' };
}

function playerStatValue(p: F2tSelectablePlayer, key: SortKey): number {
  const stats = p.picker_stats;
  switch (key) {
    case 'goals':
      return numStat(stats, 'season_goals', 'goals_scored') ?? -1;
    case 'assists':
      return numStat(stats, 'season_assists', 'assists') ?? -1;
    case 'form':
      return numStat(stats, 'form') ?? -1;
    case 'xg':
      return numStat(stats, 'expected_goals') ?? -1;
    default:
      return 0;
  }
}

type Props = {
  visible: boolean;
  title: string;
  players: F2tSelectablePlayer[];
  loading?: boolean;
  selectedIds: string[];
  submitting?: boolean;
  subMode?: boolean;
  /** Player being substituted out — shown at top of the picker in sub mode. */
  outPlayer?: F2tSelectionRow | null;
  onClose: () => void;
  onToggle: (playerId: string) => void;
  onSubmit: () => void;
};

export function F2tPlayerPicker({
  visible,
  title,
  players,
  loading,
  selectedIds,
  submitting,
  subMode,
  outPlayer,
  onClose,
  onToggle,
  onSubmit,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('ALL');
  const [teamFilterId, setTeamFilterId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('goals');
  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null);

  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setPositionFilter('ALL');
    setTeamFilterId(null);
    setSortKey('goals');
    setOpenDropdown(null);
  }, [visible]);

  const teamOptions = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; name: string; short_name: string; slug: string }
    >();
    for (const p of players) {
      if (!byId.has(p.team_id)) {
        byId.set(p.team_id, {
          id: p.team_id,
          name: p.team_name,
          short_name: p.team_short_name,
          slug: p.team_slug,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = players.filter((p) => {
      if (positionFilter !== 'ALL' && (p.position ?? '').toUpperCase() !== positionFilter) {
        return false;
      }
      if (teamFilterId && p.team_id !== teamFilterId) return false;
      if (!q) return true;
      return (
        p.display_name.toLowerCase().includes(q) ||
        (p.full_name ?? '').toLowerCase().includes(q) ||
        p.team_name.toLowerCase().includes(q) ||
        p.team_short_name.toLowerCase().includes(q) ||
        (p.position ?? '').toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      if (sortKey === 'name') {
        return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' });
      }
      const diff = playerStatValue(b, sortKey) - playerStatValue(a, sortKey);
      if (diff !== 0) return diff;
      return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' });
    });
    return list;
  }, [players, search, positionFilter, teamFilterId, sortKey]);

  const positionLabel =
    POSITION_OPTIONS.find((o) => o.value === positionFilter)?.label ?? 'Position';
  const teamLabel = teamFilterId
    ? teamOptions.find((t) => t.id === teamFilterId)?.short_name ?? 'Team'
    : 'All teams';
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? 'Sort';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: theme.colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          gap: theme.spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        title: {
          flex: 1,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 18,
          color: theme.colors.text,
        },
        outWrap: {
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          gap: theme.spacing.sm,
        },
        outLabel: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          color: theme.colors.textMuted,
        },
        outCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
        },
        outMain: {
          flex: 1,
          minWidth: 0,
          gap: 4,
        },
        outName: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 16,
          color: theme.colors.text,
        },
        outTeamRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        outTeam: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        outBadge: {
          flexShrink: 0,
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: theme.radius.sm,
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
        },
        outBadgeText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 11,
          color: '#ef4444',
        },
        controls: {
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
          gap: theme.spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          zIndex: 20,
        },
        search: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: Platform.OS === 'web' ? 10 : 11,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 14,
          color: theme.colors.text,
          backgroundColor: theme.colors.surface,
        },
        dropdownRow: {
          flexDirection: 'row',
          alignItems: 'stretch',
          gap: 8,
        },
        dropdownWrap: {
          flex: 1,
          minWidth: 0,
        },
        dropdownBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          paddingVertical: 10,
          paddingHorizontal: 10,
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          minHeight: 42,
        },
        dropdownBtnOpen: {
          borderColor: theme.colors.accent,
        },
        dropdownBtnText: {
          flex: 1,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.text,
        },
        dropdownPanel: {
          maxHeight: 220,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          overflow: 'hidden',
        },
        dropdownOption: {
          paddingVertical: 11,
          paddingHorizontal: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        dropdownOptionActive: {
          backgroundColor: theme.colors.accentMuted,
        },
        dropdownOptionText: {
          flex: 1,
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
          color: theme.colors.text,
        },
        list: {
          flex: 1,
        },
        listContent: {
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.lg,
          gap: 10,
        },
        card: {
          borderRadius: theme.radius.md,
          borderWidth: 1.5,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          overflow: 'hidden',
        },
        cardSelected: {
          borderColor: theme.colors.accent,
          backgroundColor: theme.colors.accentMuted,
        },
        cardPress: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingVertical: 10,
          paddingHorizontal: theme.spacing.md,
        },
        cardMain: {
          flex: 1,
          minWidth: 0,
          gap: 2,
        },
        nameRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        name: {
          flexShrink: 1,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 14,
          color: theme.colors.text,
        },
        meta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
        },
        statsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
        statCell: {
          minWidth: 36,
          alignItems: 'center',
        },
        statValue: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 13,
          color: theme.colors.text,
          lineHeight: 16,
        },
        formBadge: {
          minWidth: 36,
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 6,
          alignItems: 'center',
          justifyContent: 'center',
        },
        formBadgeText: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 12,
          lineHeight: 15,
        },
        statLabel: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 9,
          letterSpacing: 0.2,
          textTransform: 'uppercase',
          color: theme.colors.accent,
          marginTop: 1,
        },
        checkSlot: {
          width: 22,
          alignItems: 'center',
        },
        empty: {
          paddingVertical: 40,
          alignItems: 'center',
        },
        emptyText: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
        },
        footer: {
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          gap: 8,
        },
        pickCount: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
        primaryBtn: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: 13,
          alignItems: 'center',
        },
        primaryBtnText: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 14,
          color: theme.colors.white,
        },
      }),
    [theme, insets]
  );

  const positionDropdownOptions = POSITION_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
  }));
  const teamDropdownOptions = [
    { value: '', label: 'All teams' as string, icon: undefined as ReactNode },
    ...teamOptions.map((t) => ({
      value: t.id,
      label: t.short_name,
      icon: (
        <TeamColourChip shortName={t.short_name} name={t.name} slug={t.slug} size={18} />
      ) as ReactNode,
    })),
  ];
  const sortDropdownOptions = SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

  const activeDropdownOptions =
    openDropdown === 'position'
      ? positionDropdownOptions
      : openDropdown === 'team'
        ? teamDropdownOptions
        : openDropdown === 'sort'
          ? sortDropdownOptions
          : [];
  const activeDropdownValue =
    openDropdown === 'position'
      ? positionFilter
      : openDropdown === 'team'
        ? teamFilterId ?? ''
        : openDropdown === 'sort'
          ? sortKey
          : '';

  const onSelectDropdownValue = (value: string) => {
    if (openDropdown === 'position') setPositionFilter(value as PositionFilter);
    else if (openDropdown === 'team') setTeamFilterId(value || null);
    else if (openDropdown === 'sort') setSortKey(value as SortKey);
    setOpenDropdown(null);
  };

  const renderDropdownTrigger = (
    key: Exclude<DropdownKey, null>,
    label: string
  ) => {
    const open = openDropdown === key;
    return (
      <View style={styles.dropdownWrap}>
        <Pressable
          style={[styles.dropdownBtn, open && styles.dropdownBtnOpen]}
          onPress={() => setOpenDropdown(open ? null : key)}
        >
          <Text style={styles.dropdownBtnText} numberOfLines={1}>
            {label}
          </Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={theme.colors.textMuted}
          />
        </Pressable>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={theme.colors.text} />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        </View>

        {subMode && outPlayer ? (
          <View style={styles.outWrap}>
            <Text style={styles.outLabel}>Substituting out</Text>
            <View style={styles.outCard}>
              <View style={styles.outMain}>
                <Text style={styles.outName} numberOfLines={1}>
                  {outPlayer.display_name}
                </Text>
                <View style={styles.outTeamRow}>
                  <TeamColourChip
                    shortName={outPlayer.team_short_name}
                    name={outPlayer.team_name}
                    slug={outPlayer.team_slug}
                    size={22}
                  />
                  <Text style={styles.outTeam}>{outPlayer.team_short_name}</Text>
                </View>
              </View>
              <View style={styles.outBadge}>
                <Text style={styles.outBadgeText}>Out</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.controls}>
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={(text) => {
              setSearch(text);
              setOpenDropdown(null);
            }}
            placeholder="Search by player name"
            placeholderTextColor={theme.colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          <View style={styles.dropdownRow}>
            {renderDropdownTrigger('position', positionLabel)}
            {renderDropdownTrigger('team', teamLabel)}
            {renderDropdownTrigger('sort', `Sort: ${sortLabel}`)}
          </View>
          {openDropdown ? (
            <View style={styles.dropdownPanel}>
              <FlatList
                data={activeDropdownOptions}
                keyExtractor={(item) => item.value}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                renderItem={({ item }) => {
                  const active = item.value === activeDropdownValue;
                  return (
                    <Pressable
                      style={[styles.dropdownOption, active && styles.dropdownOptionActive]}
                      onPress={() => onSelectDropdownValue(item.value)}
                    >
                      {'icon' in item ? item.icon : null}
                      <Text style={styles.dropdownOptionText} numberOfLines={1}>
                        {item.label}
                      </Text>
                      {active ? (
                        <Ionicons name="checkmark" size={16} color={theme.colors.accent} />
                      ) : null}
                    </Pressable>
                  );
                }}
              />
            </View>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.accent} />
        ) : (
          <FlatList
            style={styles.list}
            contentContainerStyle={styles.listContent}
            data={filteredPlayers}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => setOpenDropdown(null)}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No players match these filters.</Text>
              </View>
            }
            renderItem={({ item: p }) => {
              const selected = selectedIds.includes(p.id);
              const stats = p.picker_stats as Record<string, unknown>;
              const goals = numStat(stats, 'season_goals', 'goals_scored');
              const assists = numStat(stats, 'season_assists', 'assists');
              const form = numStat(stats, 'form');
              const xg = numStat(stats, 'expected_goals');
              const availability = formatFplAvailability(stats);
              const showNewsIcon =
                Boolean(availability.news) ||
                (availability.statusCode !== 'a' && availability.statusCode !== '');
              const newsColor = fplStatusAccentColor(availability.statusCode);
              const formColors = formTone(form);

              return (
                <View style={[styles.card, selected && styles.cardSelected]}>
                  <Pressable
                    style={styles.cardPress}
                    onPress={() => {
                      setOpenDropdown(null);
                      onToggle(p.id);
                    }}
                  >
                    <TeamColourChip
                      shortName={p.team_short_name}
                      name={p.team_name}
                      slug={p.team_slug}
                      size={36}
                    />
                    <View style={styles.cardMain}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>
                          {p.display_name}
                        </Text>
                        {showNewsIcon ? (
                          <Pressable
                            hitSlop={10}
                            onPress={(e) => {
                              e?.stopPropagation?.();
                              const body = [availability.chanceSummary, availability.news]
                                .filter(Boolean)
                                .join('\n\n');
                              const title = availability.statusLabel || 'Player update';
                              const message = body || availability.statusLabel || 'No further details.';
                              if (Platform.OS === 'web') {
                                window.alert(`${title}\n\n${message}`);
                              } else {
                                Alert.alert(title, message);
                              }
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={
                              availability.news || availability.statusLabel || 'Player availability'
                            }
                          >
                            <Ionicons
                              name="information-circle"
                              size={20}
                              color={newsColor}
                            />
                          </Pressable>
                        ) : null}
                      </View>
                      <Text style={styles.meta} numberOfLines={1}>
                        {[p.position, p.team_short_name].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={styles.statsRow}>
                      <View style={styles.statCell}>
                        <Text style={styles.statValue}>{formatStat(goals)}</Text>
                        <Text style={styles.statLabel}>Goals</Text>
                      </View>
                      <View style={styles.statCell}>
                        <Text style={styles.statValue}>{formatStat(assists)}</Text>
                        <Text style={styles.statLabel}>Assists</Text>
                      </View>
                      <View style={styles.statCell}>
                        <View
                          style={[
                            styles.formBadge,
                            {
                              backgroundColor: formColors?.bg ?? theme.colors.background,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.formBadgeText,
                              { color: formColors?.fg ?? theme.colors.text },
                            ]}
                          >
                            {formatStat(form, 1)}
                          </Text>
                        </View>
                        <Text style={styles.statLabel}>Form</Text>
                      </View>
                      <View style={styles.statCell}>
                        <Text style={styles.statValue}>{formatStat(xg, 1)}</Text>
                        <Text style={styles.statLabel}>xG</Text>
                      </View>
                    </View>
                    <View style={styles.checkSlot}>
                      {selected ? (
                        <Ionicons name="checkmark-circle" size={22} color={theme.colors.accent} />
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              );
            }}
          />
        )}

        <View style={styles.footer}>
          {!subMode ? (
            <Text style={styles.pickCount}>{selectedIds.length} / 20 selected</Text>
          ) : null}
          <Pressable style={styles.primaryBtn} onPress={onSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color={theme.colors.white} size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>
                {subMode ? 'Confirm substitution' : 'Save selections'}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
