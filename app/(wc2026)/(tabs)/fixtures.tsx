import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { CountryFlag } from '@/features/wc2026/components/CountryFlag';
import { getFixtures, type Match, type Team } from '@/features/wc2026/services/fixtures';
import { getUserPredictions, type Prediction } from '@/features/wc2026/services/predictions';

const FLAG_SIZE = 26;

function flagCode(team: Team | undefined): string {
  if (!team) return 'UN';
  const c = (team.country_code ?? '').trim();
  if (c.length >= 2) return c.toUpperCase();
  return (team.country_name ?? 'UN').toUpperCase().slice(0, 2);
}

function formatLivePick(p: Prediction): string | null {
  const parts: string[] = [];
  if (p.live_outcome === 'H') parts.push('Home win');
  else if (p.live_outcome === 'D') parts.push('Draw');
  else if (p.live_outcome === 'A') parts.push('Away win');
  if (p.live_total_goals != null) parts.push(`${p.live_total_goals} goals`);
  if (p.live_btts === true) parts.push('BTTS Yes');
  else if (p.live_btts === false) parts.push('BTTS No');
  return parts.length > 0 ? parts.join(' · ') : null;
}

function buildLivePickMap(predictions: Prediction[]): {
  byMatchId: Map<string, string>;
  byMatchNumber: Map<number, string>;
} {
  const byMatchId = new Map<string, string>();
  const byMatchNumber = new Map<number, string>();
  for (const p of predictions) {
    if (p.prediction_type !== 'live') continue;
    const label = formatLivePick(p);
    if (!label) continue;
    if (p.match_id) byMatchId.set(p.match_id, label);
    const mn = p.match_number != null ? Number(p.match_number) : null;
    if (mn != null && Number.isFinite(mn)) byMatchNumber.set(mn, label);
  }
  return { byMatchId, byMatchNumber };
}

function livePickFromMaps(
  fixture: Match,
  byMatchId: Map<string, string>,
  byMatchNumber: Map<number, string>
): string | null {
  return byMatchId.get(fixture.id) ?? byMatchNumber.get(Number(fixture.match_number)) ?? null;
}

export default function WorldCupFixturesRoute() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [fixtures, setFixtures] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErrorMessage(null);
    try {
      const data = await getFixtures();
      setFixtures(data);
      if (userId) {
        const preds = await getUserPredictions(userId);
        setPredictions(preds ?? []);
      } else {
        setPredictions([]);
      }
    } catch {
      setErrorMessage('Unable to load fixtures. Confirm wc2026 schema tables are populated.');
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const livePickMaps = useMemo(() => buildLivePickMap(predictions), [predictions]);

  const sortedFixtures = useMemo(() => {
    return [...fixtures].sort((a, b) => {
      const ta = new Date(a.match_date).getTime();
      const tb = new Date(b.match_date).getTime();
      if (ta !== tb) return ta - tb;
      return (a.match_number ?? 0) - (b.match_number ?? 0);
    });
  }, [fixtures]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
        card: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
        },
        matchRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.xs,
        },
        side: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minWidth: 0,
        },
        sideLeft: { justifyContent: 'flex-start' },
        sideRight: { justifyContent: 'flex-end' },
        teamName: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '700',
          color: theme.colors.text,
          flexShrink: 1,
        },
        centerCol: {
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 4,
          flexShrink: 0,
        },
        pickCaption: {
          fontFamily: theme.fontFamily.light,
          fontSize: 10,
          color: theme.colors.textMuted,
          marginBottom: 4,
          textAlign: 'center',
        },
        pickCapsule: {
          backgroundColor: theme.colors.accent,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: theme.radius.full,
        },
        pickCapsuleText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '800',
          color: theme.colors.white,
          letterSpacing: 0.5,
        },
        pickMissing: {
          fontFamily: theme.fontFamily.light,
          fontSize: 11,
          color: theme.colors.textMuted,
          textAlign: 'center',
          maxWidth: 100,
        },
        meta: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        message: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textSecondary,
        },
        loadingWrap: {
          paddingTop: theme.spacing.lg,
          alignItems: 'center',
        },
      }),
    [theme]
  );

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} />}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : null}

        {!loading && errorMessage ? <Text style={styles.message}>{errorMessage}</Text> : null}

        {!loading && !errorMessage && fixtures.length === 0 ? (
          <Text style={styles.message}>No fixtures found in wc2026.matches yet.</Text>
        ) : null}

        {!loading &&
          !errorMessage &&
          sortedFixtures.map((fixture) => {
            const home = fixture.home_team;
            const away = fixture.away_team;
            const pick = userId ? livePickFromMaps(fixture, livePickMaps.byMatchId, livePickMaps.byMatchNumber) : null;

            return (
              <View style={styles.card} key={fixture.id}>
                <View style={styles.matchRow}>
                  <View style={[styles.side, styles.sideLeft]}>
                    {home ? (
                      <CountryFlag
                        countryCode={flagCode(home)}
                        countryName={home.country_name}
                        flagSize={FLAG_SIZE}
                        showName={false}
                        align="center"
                      />
                    ) : null}
                    <Text style={styles.teamName} numberOfLines={2}>
                      {home?.country_name ?? fixture.home_team_id}
                    </Text>
                  </View>

                  <View style={styles.centerCol}>
                    {pick ? (
                      <>
                        <Text style={styles.pickCaption}>Your match day pick</Text>
                        <View style={styles.pickCapsule}>
                          <Text style={styles.pickCapsuleText}>{pick}</Text>
                        </View>
                      </>
                    ) : userId ? (
                      <Text style={styles.pickMissing}>No match day pick</Text>
                    ) : (
                      <Text style={styles.pickMissing}>Sign in to see your pick</Text>
                    )}
                  </View>

                  <View style={[styles.side, styles.sideRight]}>
                    <Text style={[styles.teamName, { textAlign: 'right' }]} numberOfLines={2}>
                      {away?.country_name ?? fixture.away_team_id}
                    </Text>
                    {away ? (
                      <CountryFlag
                        countryCode={flagCode(away)}
                        countryName={away.country_name}
                        flagSize={FLAG_SIZE}
                        showName={false}
                        align="center"
                      />
                    ) : null}
                  </View>
                </View>

                <Text style={styles.meta}>{new Date(fixture.match_date).toLocaleString()}</Text>
                <Text style={styles.meta}>
                  {fixture.tournament_stage?.stage_name ?? 'Stage TBC'}
                  {fixture.group?.group_name ? ` • Group ${fixture.group.group_name}` : ''}
                </Text>
              </View>
            );
          })}
      </ScrollView>
    </View>
  );
}
