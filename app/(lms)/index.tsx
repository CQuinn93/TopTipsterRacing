import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  lmsGetHome,
  lmsJoinErrorMessage,
  lmsRequestJoin,
  type LmsCompetitionHomeSummary,
  type LmsFixture,
  type LmsGameweek,
  type LmsPendingJoin,
} from '@/lib/lms/api';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
// Crest images disabled — restore TeamCrest if logo rights obtained.
// import { TeamCrest } from '@/components/lms/TeamCrest';
import { LmsTrademarkDisclaimer } from '@/components/lms/LmsTrademarkDisclaimer';

type HomeTab = 'competitions' | 'join';

const FIXTURE_CYCLE_MS = 3500;

export default function LmsHomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [comps, setComps] = useState<LmsCompetitionHomeSummary[]>([]);
  const [pending, setPending] = useState<LmsPendingJoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [tab, setTab] = useState<HomeTab>('competitions');
  const [gw, setGw] = useState<LmsGameweek | null>(null);
  const [fixtures, setFixtures] = useState<LmsFixture[]>([]);
  const [fxIndex, setFxIndex] = useState(0);

  const upcomingFixtures = useMemo(() => {
    const open = fixtures.filter((f) => f.status !== 'finished' && !f.excluded_from_lms);
    return open.length ? open : fixtures.filter((f) => !f.excluded_from_lms);
  }, [fixtures]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const home = await lmsGetHome('2026/27');
      setComps(home.competitions);
      setPending(home.pending);
      setGw(home.nextUp.gameweek);
      setFixtures(home.nextUp.fixtures);
      setFxIndex(0);
      setTab((prev) => {
        if (prev === 'join') return prev;
        return home.competitions.length === 0 && home.pending.length === 0
          ? 'join'
          : 'competitions';
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load competitions';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (upcomingFixtures.length < 2) return;
    const id = setInterval(() => {
      setFxIndex((i) => (i + 1) % upcomingFixtures.length);
    }, FIXTURE_CYCLE_MS);
    return () => clearInterval(id);
  }, [upcomingFixtures.length]);

  useEffect(() => {
    if (fxIndex >= upcomingFixtures.length) setFxIndex(0);
  }, [fxIndex, upcomingFixtures.length]);

  const onJoin = async () => {
    if (!code.trim()) {
      Alert.alert('Access code', 'Enter the code from your admin.');
      return;
    }
    setJoining(true);
    try {
      const res = await lmsRequestJoin(code);
      if (!res.success) {
        Alert.alert('Join failed', lmsJoinErrorMessage(res.error));
        return;
      }
      setCode('');
      Alert.alert(
        'Request sent',
        `Your request to join ${res.competition_name ?? 'the competition'} is pending admin approval.`
      );
      await load();
      setTab('competitions');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Join failed');
    } finally {
      setJoining(false);
    }
  };

  const activeFixture = upcomingFixtures[fxIndex] ?? null;

  const statusLabel = (status: string) => {
    if (status === 'active') return 'Still standing';
    if (status === 'winner') return 'Champion';
    if (status === 'eliminated') return 'Eliminated';
    return status;
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        },
        back: { padding: 4 },
        titleBlock: { flex: 1 },
        title: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 20,
          color: theme.colors.text,
        },
        sub: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.accent,
          marginTop: 2,
        },
        spotlightWrap: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
        },
        spotlight: {
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.lg,
          borderWidth: 1.5,
          borderColor: theme.colors.accent,
          paddingVertical: 16,
          paddingHorizontal: 16,
          gap: 12,
          shadowColor: theme.colors.accent,
          shadowOpacity: 0.18,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        },
        spotlightHead: {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        },
        spotlightTitle: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 12,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: theme.colors.accent,
        },
        spotlightMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
          flexShrink: 1,
          textAlign: 'right',
        },
        cardTap: {
          paddingVertical: 6,
        },
        cardRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        },
        cardSide: {
          flex: 1,
          alignItems: 'center',
          gap: 6,
        },
        cardName: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.text,
          textAlign: 'center',
        },
        cardMid: {
          alignItems: 'center',
          minWidth: 64,
          gap: 4,
        },
        cardVs: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        cardTime: {
          fontFamily: theme.fontFamily.baiExtraLight,
          fontSize: 11,
          color: theme.colors.textMuted,
          textAlign: 'center',
        },
        dots: {
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 5,
          paddingTop: 2,
        },
        dot: {
          width: 5,
          height: 5,
          borderRadius: 2.5,
          backgroundColor: theme.colors.borderLight,
        },
        dotActive: {
          backgroundColor: theme.colors.accent,
          width: 14,
          borderRadius: 3,
        },
        tabs: {
          flexDirection: 'row',
          marginHorizontal: theme.spacing.lg,
          marginBottom: theme.spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        tab: {
          flex: 1,
          paddingVertical: 11,
          alignItems: 'center',
          borderBottomWidth: 2,
          borderBottomColor: 'transparent',
        },
        tabActive: { borderBottomColor: theme.colors.accent },
        tabText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 13,
          color: theme.colors.textMuted,
        },
        tabTextActive: { color: theme.colors.accent },
        content: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.lg,
        },
        sectionLabel: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 11,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          color: theme.colors.textMuted,
          marginBottom: 8,
        },
        joinRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        input: {
          flex: 1,
          fontFamily: theme.fontFamily.input,
          fontSize: 14,
          color: theme.colors.text,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
          paddingHorizontal: 12,
          paddingVertical: 8,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          backgroundColor: theme.colors.surface,
        },
        joinBtn: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.sm,
          paddingVertical: 9,
          paddingHorizontal: 14,
          minWidth: 72,
          alignItems: 'center',
        },
        joinBtnText: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.white,
        },
        joinHint: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginTop: 8,
          lineHeight: 16,
        },
        list: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        rowLast: { borderBottomWidth: 0 },
        rowCopy: { flex: 1, minWidth: 0, gap: 3 },
        rowTitle: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 15,
          color: theme.colors.text,
        },
        rowMeta: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textSecondary,
        },
        rowPickHint: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.accent,
          marginTop: 2,
        },
        pickCol: {
          alignItems: 'center',
          minWidth: 52,
          gap: 3,
        },
        pickAbbr: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 10,
          color: theme.colors.textSecondary,
          textTransform: 'uppercase',
        },
        empty: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
          paddingVertical: 8,
        },
        badge: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 11,
          color: theme.colors.statusAccent,
          textTransform: 'uppercase',
        },
      }),
    [theme, insets.top, insets.bottom]
  );

  const renderNextUp = () => {
    if (!gw) return null;
    return (
      <View style={styles.spotlightWrap}>
        <View style={styles.spotlight}>
          <View style={styles.spotlightHead}>
            <Text style={styles.spotlightTitle}>Next up · GW{gw.number}</Text>
            <Text style={styles.spotlightMeta} numberOfLines={1}>
              {upcomingFixtures.length
                ? `${fxIndex + 1}/${upcomingFixtures.length}`
                : 'No fixtures'}
            </Text>
          </View>

          {activeFixture ? (
            <Pressable
              style={styles.cardTap}
              onPress={() =>
                setFxIndex((i) =>
                  upcomingFixtures.length ? (i + 1) % upcomingFixtures.length : 0
                )
              }
              accessibilityRole="button"
              accessibilityLabel="Next fixture"
            >
              <View style={styles.cardRow}>
                <View style={styles.cardSide}>
                  <TeamColourChip
                    shortName={activeFixture.home_team?.short_name}
                    name={activeFixture.home_team?.name}
                    slug={activeFixture.home_team?.slug}
                    size={44}
                  />
                  <Text style={styles.cardName} numberOfLines={1}>
                    {activeFixture.home_team?.short_name ?? 'H'}
                  </Text>
                </View>
                <View style={styles.cardMid}>
                  <Text style={styles.cardVs}>vs</Text>
                  <Text style={styles.cardTime}>
                    {new Date(activeFixture.kickoff_at).toLocaleString(undefined, {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.cardSide}>
                  <TeamColourChip
                    shortName={activeFixture.away_team?.short_name}
                    name={activeFixture.away_team?.name}
                    slug={activeFixture.away_team?.slug}
                    size={44}
                  />
                  <Text style={styles.cardName} numberOfLines={1}>
                    {activeFixture.away_team?.short_name ?? 'A'}
                  </Text>
                </View>
              </View>
            </Pressable>
          ) : (
            <Text style={styles.empty}>Fixtures not loaded yet.</Text>
          )}

          {upcomingFixtures.length > 1 ? (
            <View style={styles.dots}>
              {upcomingFixtures.map((f, i) => (
                <Pressable
                  key={f.id}
                  onPress={() => setFxIndex(i)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Show fixture ${i + 1}`}
                >
                  <View style={[styles.dot, i === fxIndex && styles.dotActive]} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          onPress={() => router.replace('/competition-hub')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back to hub"
        >
          <Ionicons name="arrow-back" size={22} color={theme.colors.text} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Last Man Standing</Text>
          <Text style={styles.sub}>Premier League 2026/27</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.accent} />
      ) : (
        <>
          {renderNextUp()}

          <View style={styles.tabs}>
            {(
              [
                { key: 'competitions' as const, label: 'My competitions' },
                { key: 'join' as const, label: 'Join' },
              ] as const
            ).map((t) => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => setTab(t.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load();
                }}
                tintColor={theme.colors.accent}
              />
            }
          >
            {tab === 'competitions' ? (
              <>
                {pending.length > 0 ? (
                  <View>
                    <Text style={styles.sectionLabel}>Pending approval</Text>
                    <View style={styles.list}>
                      {pending.map((p, i) => (
                        <View
                          key={p.competition_id}
                          style={[styles.row, i === pending.length - 1 && styles.rowLast]}
                        >
                          <View style={styles.rowCopy}>
                            <Text style={styles.rowTitle}>{p.name}</Text>
                            <Text style={styles.rowMeta}>Waiting for admin</Text>
                          </View>
                          <Text style={styles.badge}>Pending</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                <View>
                  <Text style={styles.sectionLabel}>Your leagues</Text>
                  {comps.length === 0 ? (
                    <Text style={styles.empty}>
                      You’re not in a competition yet. Use the Join tab with your access code.
                    </Text>
                  ) : (
                    <View style={styles.list}>
                      {comps.map((c, i) => {
                        const remainLabel =
                          c.totalCount > 0
                            ? `${c.aliveCount} of ${c.totalCount} remain`
                            : statusLabel(c.participant_status);
                        return (
                          <Pressable
                            key={c.competition_id}
                            style={[styles.row, i === comps.length - 1 && styles.rowLast]}
                            onPress={() => router.push(`/(lms)/${c.competition_id}` as any)}
                          >
                            <View style={styles.rowCopy}>
                              <Text style={styles.rowTitle}>{c.name}</Text>
                              <Text style={styles.rowMeta}>{remainLabel}</Text>
                              {c.participant_status === 'active' && c.pickAvailable ? (
                                <Text style={styles.rowPickHint}>Pick available</Text>
                              ) : c.participant_status !== 'active' ? (
                                <Text style={styles.rowMeta}>
                                  {statusLabel(c.participant_status)}
                                </Text>
                              ) : null}
                            </View>
                            {c.pickTeam ? (
                              <View style={styles.pickCol}>
                                <TeamColourChip
                                  shortName={c.pickTeam.short_name}
                                  name={c.pickTeam.name}
                                  slug={c.pickTeam.slug}
                                  size={28}
                                />
                                <Text style={styles.pickAbbr} numberOfLines={1}>
                                  {c.pickTeam.short_name || c.pickTeam.name.slice(0, 3)}
                                </Text>
                              </View>
                            ) : (
                              <Ionicons
                                name="chevron-forward"
                                size={16}
                                color={theme.colors.textMuted}
                              />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              </>
            ) : null}

            {tab === 'join' ? (
              <View>
                <Text style={styles.sectionLabel}>Access code</Text>
                <View style={styles.joinRow}>
                  <TextInput
                    style={styles.input}
                    value={code}
                    onChangeText={setCode}
                    placeholder="CODE"
                    placeholderTextColor={theme.colors.textMuted}
                    autoCapitalize="characters"
                    maxLength={6}
                    autoCorrect={false}
                  />
                  <Pressable
                    style={styles.joinBtn}
                    onPress={() => void onJoin()}
                    disabled={joining}
                  >
                    {joining ? (
                      <ActivityIndicator color={theme.colors.white} size="small" />
                    ) : (
                      <Text style={styles.joinBtnText}>Join</Text>
                    )}
                  </Pressable>
                </View>
                <Text style={styles.joinHint}>
                  Enter the 6-character code from your competition admin. Requests need approval
                  before you can pick.
                </Text>
              </View>
            ) : null}

            <LmsTrademarkDisclaimer />
          </ScrollView>
        </>
      )}
    </View>
  );
}
