import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { TeamColourChip } from '@/components/lms/TeamColourChip';
import { loadFootballNextUp } from '@/lib/lms/loadFootballNextUp';
import type { LmsFixture, LmsGameweek } from '@/lib/lms/api';

const FIXTURE_CYCLE_MS = 6500;
const FIXTURE_SLIDE_MS = 380;

type Props = {
  season?: string;
  /** Bump to refetch next-up (e.g. parent pull-to-refresh). */
  refreshKey?: number;
};

export function FootballNextUpSpotlight({ season = '2026/27', refreshKey = 0 }: Props) {
  const theme = useTheme();
  const [gw, setGw] = useState<LmsGameweek | null>(null);
  const [fixtures, setFixtures] = useState<LmsFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [fxIndex, setFxIndex] = useState(0);
  const [fixtureCardWidth, setFixtureCardWidth] = useState(280);

  const fixtureSlideAnim = useRef(new Animated.Value(0)).current;
  const fixtureAnimatingRef = useRef(false);
  const fxIndexRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const next = await loadFootballNextUp(season);
      setGw(next.gameweek);
      setFixtures(next.fixtures);
      fxIndexRef.current = 0;
      setFxIndex(0);
      fixtureSlideAnim.setValue(0);
      fixtureAnimatingRef.current = false;
    } catch {
      setGw(null);
      setFixtures([]);
    } finally {
      setLoading(false);
    }
  }, [season]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, refreshKey]);

  const upcomingFixtures = useMemo(() => {
    const open = fixtures.filter((f) => f.status !== 'finished' && !f.excluded_from_lms);
    const list = open.length ? open : fixtures.filter((f) => !f.excluded_from_lms);
    return [...list].sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (b.status === 'live' && a.status !== 'live') return 1;
      return new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime();
    });
  }, [fixtures]);

  const activeFixture = upcomingFixtures[fxIndex] ?? null;

  useEffect(() => {
    fxIndexRef.current = fxIndex;
  }, [fxIndex]);

  const goToFixture = useCallback(
    (nextIndex: number, opts?: { animated?: boolean; direction?: 'left' | 'right' }) => {
      const count = upcomingFixtures.length;
      if (count < 1) return;
      const target = ((nextIndex % count) + count) % count;
      const animated = opts?.animated !== false;
      const current = fxIndexRef.current;
      if (target === current) return;
      if (fixtureAnimatingRef.current) return;

      if (!animated || count < 2) {
        fxIndexRef.current = target;
        setFxIndex(target);
        fixtureSlideAnim.setValue(0);
        return;
      }

      const direction =
        opts?.direction ??
        (target === (current + 1) % count || (current === count - 1 && target === 0)
          ? 'left'
          : target === (current - 1 + count) % count || (current === 0 && target === count - 1)
            ? 'right'
            : 'left');

      const exitTo = direction === 'left' ? -1 : 1;
      const enterFrom = direction === 'left' ? 1 : -1;

      fixtureAnimatingRef.current = true;
      Animated.timing(fixtureSlideAnim, {
        toValue: exitTo,
        duration: FIXTURE_SLIDE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) {
          fixtureAnimatingRef.current = false;
          return;
        }
        fxIndexRef.current = target;
        setFxIndex(target);
        fixtureSlideAnim.setValue(enterFrom);
        Animated.timing(fixtureSlideAnim, {
          toValue: 0,
          duration: FIXTURE_SLIDE_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          fixtureAnimatingRef.current = false;
        });
      });
    },
    [upcomingFixtures.length, fixtureSlideAnim]
  );

  useEffect(() => {
    if (upcomingFixtures.length < 2) return;
    const id = setInterval(() => {
      const next = (fxIndexRef.current + 1) % upcomingFixtures.length;
      goToFixture(next, { direction: 'left' });
    }, FIXTURE_CYCLE_MS);
    return () => clearInterval(id);
  }, [upcomingFixtures.length, goToFixture]);

  const fixtureSlideStyle = useMemo(() => {
    const travel = Math.max(120, fixtureCardWidth * 0.55);
    return {
      opacity: fixtureSlideAnim.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
      }),
      transform: [
        {
          translateX: fixtureSlideAnim.interpolate({
            inputRange: [-1, 0, 1],
            outputRange: [-travel, 0, travel],
          }),
        },
      ],
    };
  }, [fixtureSlideAnim, fixtureCardWidth]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        spotlightWrap: {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
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
        cardTap: { paddingVertical: 6, overflow: 'hidden' },
        cardSlide: { width: '100%' },
        cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        cardSide: { flex: 1, alignItems: 'center', gap: 6 },
        cardName: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 13,
          color: theme.colors.text,
          textAlign: 'center',
        },
        cardMid: { alignItems: 'center', minWidth: 64, gap: 4 },
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
        cardScoreLive: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 16,
          color: theme.colors.accent,
        },
        cardInPlay: {
          fontFamily: theme.fontFamily.baiSemiBold,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: theme.colors.accent,
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
        empty: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textMuted,
          paddingVertical: 8,
          lineHeight: 18,
        },
        loading: { paddingVertical: 24, alignItems: 'center' },
      }),
    [theme]
  );

  if (loading) {
    return (
      <View style={styles.spotlightWrap}>
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      </View>
    );
  }

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
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - fixtureCardWidth) > 1) setFixtureCardWidth(w);
            }}
            onPress={() =>
              goToFixture(
                upcomingFixtures.length ? (fxIndex + 1) % upcomingFixtures.length : 0,
                { direction: 'left' }
              )
            }
            accessibilityRole="button"
            accessibilityLabel="Next fixture"
          >
            <Animated.View style={[styles.cardSlide, fixtureSlideStyle]}>
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
                  {activeFixture.status === 'live' ? (
                    <>
                      {activeFixture.home_goals != null && activeFixture.away_goals != null ? (
                        <Text style={styles.cardScoreLive}>
                          {activeFixture.home_goals}–{activeFixture.away_goals}
                        </Text>
                      ) : null}
                      <Text style={styles.cardInPlay}>In play</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.cardVs}>vs</Text>
                      <Text style={styles.cardTime}>
                        {new Date(activeFixture.kickoff_at).toLocaleString(undefined, {
                          weekday: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </>
                  )}
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
            </Animated.View>
          </Pressable>
        ) : (
          <Text style={styles.empty}>Fixtures not loaded yet.</Text>
        )}

        {upcomingFixtures.length > 1 ? (
          <View style={styles.dots}>
            {upcomingFixtures.map((f, i) => (
              <Pressable
                key={f.id}
                onPress={() => goToFixture(i)}
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
}
