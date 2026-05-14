import { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { CountryFlag } from '@/features/wc2026/components/CountryFlag';
import type { Match, Team } from '@/features/wc2026/services/fixtures';
import type { WcLeaderboardPredictionRow } from '@/features/wc2026/services/football-leaderboard';

/** Slightly smaller than group-stage picks (26) — leaderboard stays compact. */
const FLAG_SIZE = 18;

function abbrevTeam(t: Team | undefined): string {
  if (!t) return '—';
  const c = (t.country_code ?? '').trim().toUpperCase();
  if (c.length >= 2 && c.length <= 3) return c;
  return t.country_name.slice(0, 3).toUpperCase();
}

function countryCodeForFlag(t: Team | undefined, countryName: string): string {
  const c = (t?.country_code ?? '').trim();
  if (c.length >= 2) return c;
  return countryName.toUpperCase().slice(0, 2);
}

function formatPoints(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return rounded.toFixed(1);
}

function outcomeLetter(o: 'H' | 'D' | 'A' | null | undefined): string {
  if (o === 'H') return 'H';
  if (o === 'D') return 'D';
  if (o === 'A') return 'A';
  return '—';
}

function resultLabel(
  match: Match | null,
  pointsAwarded: number | null
): 'Win' | 'Loss' | null {
  if (!match || match.status !== 'finished' || match.home_score == null || match.away_score == null) return null;
  if (pointsAwarded == null) return null;
  if (pointsAwarded > 0) return 'Win';
  return 'Loss';
}

type Props = {
  prediction: WcLeaderboardPredictionRow;
  match: Match | null;
  /** When fixtures omit embedded `home_team` / `away_team` (e.g. stale cache), resolve by id. */
  teamsById?: Record<string, Team>;
};

function resolveTeam(
  m: Match | null,
  side: 'home' | 'away',
  teamsById?: Record<string, Team>
): Team | undefined {
  if (!m) return undefined;
  if (side === 'home') {
    return m.home_team ?? (m.home_team_id ? teamsById?.[m.home_team_id] : undefined);
  }
  return m.away_team ?? (m.away_team_id ? teamsById?.[m.away_team_id] : undefined);
}

export function WcLeaderboardPickRow({ prediction: p, match, teamsById }: Props) {
  const theme = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingLeft: 4,
          paddingRight: 2,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          gap: 6,
        },
        /** Same idea as AntePostFixtures `matchContent`: home | scores | away — flexes; rail stays fixed. */
        matchLine: {
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
        },
        sideColumn: {
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
        },
        homeSide: {
          justifyContent: 'flex-end',
          paddingRight: 4,
          gap: 5,
        },
        awaySide: {
          justifyContent: 'flex-start',
          paddingLeft: 4,
          gap: 5,
        },
        abbr: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          color: theme.colors.text,
          maxWidth: 40,
        },
        scorePair: {
          flexDirection: 'row',
          alignItems: 'center',
          flexShrink: 0,
          gap: 2,
        },
        scoreBox: {
          minWidth: 26,
          height: 30,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
          textAlign: 'center',
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '900',
          color: theme.colors.text,
          lineHeight: Platform.OS === 'android' ? 28 : 30,
          overflow: 'hidden',
          paddingHorizontal: 2,
        },
        dash: {
          width: 14,
          textAlign: 'center',
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '700',
          color: theme.colors.textMuted,
        },
        ftHint: {
          marginTop: 2,
          fontFamily: theme.fontFamily.light,
          fontSize: 9,
          color: theme.colors.textMuted,
          textAlign: 'center',
        },
        liveCenter: {
          flexShrink: 0,
          paddingHorizontal: 4,
          maxWidth: 100,
        },
        liveMeta: {
          fontFamily: theme.fontFamily.light,
          fontSize: 10,
          color: theme.colors.textSecondary,
          textAlign: 'center',
        },
        matchLineWrap: {
          flex: 1,
          minWidth: 0,
        },
        rail: {
          width: 76,
          flexShrink: 0,
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingLeft: 4,
          gap: 2,
        },
        pts: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          color: theme.colors.accent,
        },
        win: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '800',
          color: theme.colors.accent,
        },
        loss: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '800',
          color: theme.colors.error,
        },
      }),
    [theme]
  );

  const home = resolveTeam(match, 'home', teamsById);
  const away = resolveTeam(match, 'away', teamsById);
  const label = resultLabel(match, p.points_awarded);
  const pts = p.points_awarded != null ? formatPoints(p.points_awarded) : '—';

  const homeFlagEl = home ? (
    <CountryFlag
      countryCode={countryCodeForFlag(home, home.country_name)}
      countryName={home.country_name}
      flagSize={FLAG_SIZE}
      showName={false}
      align="center"
    />
  ) : null;
  const awayFlagEl = away ? (
    <CountryFlag
      countryCode={countryCodeForFlag(away, away.country_name)}
      countryName={away.country_name}
      flagSize={FLAG_SIZE}
      showName={false}
      align="center"
    />
  ) : null;

  const rail = (
    <View style={styles.rail}>
      <Text style={styles.pts}>{pts} pts</Text>
      {label === 'Win' ? <Text style={styles.win}>Win</Text> : null}
      {label === 'Loss' ? <Text style={styles.loss}>Loss</Text> : null}
    </View>
  );

  if (p.prediction_type === 'ante_post') {
    const hs = p.home_score != null ? String(p.home_score) : '—';
    const as = p.away_score != null ? String(p.away_score) : '—';
    const showFt =
      match?.status === 'finished' && match.home_score != null && match.away_score != null;

    return (
      <View style={styles.row}>
        <View style={styles.matchLineWrap}>
          <View style={styles.matchLine}>
            <View style={[styles.sideColumn, styles.homeSide]}>
              {homeFlagEl}
              <Text style={styles.abbr} numberOfLines={1}>
                {abbrevTeam(home)}
              </Text>
            </View>
            <View style={styles.scorePair}>
              <Text style={styles.scoreBox}>{hs}</Text>
              <Text style={styles.dash}>–</Text>
              <Text style={styles.scoreBox}>{as}</Text>
            </View>
            <View style={[styles.sideColumn, styles.awaySide]}>
              <Text style={styles.abbr} numberOfLines={1}>
                {abbrevTeam(away)}
              </Text>
              {awayFlagEl}
            </View>
          </View>
          {showFt ? (
            <Text style={styles.ftHint}>
              FT {match.home_score}-{match.away_score}
            </Text>
          ) : null}
        </View>
        {rail}
      </View>
    );
  }

  const g = p.live_total_goals != null ? String(p.live_total_goals) : '—';
  const b = p.live_btts === true ? 'Y' : p.live_btts === false ? 'N' : '—';
  const showFt =
    match?.status === 'finished' && match.home_score != null && match.away_score != null;

  return (
    <View style={styles.row}>
      <View style={styles.matchLineWrap}>
        <View style={styles.matchLine}>
          <View style={[styles.sideColumn, styles.homeSide]}>
            {homeFlagEl}
            <Text style={styles.abbr} numberOfLines={1}>
              {abbrevTeam(home)}
            </Text>
          </View>
          <View style={styles.liveCenter}>
            <Text style={styles.liveMeta} numberOfLines={2}>
              {outcomeLetter(p.live_outcome ?? null)} · {g}g · BTTS {b}
            </Text>
          </View>
          <View style={[styles.sideColumn, styles.awaySide]}>
            <Text style={styles.abbr} numberOfLines={1}>
              {abbrevTeam(away)}
            </Text>
            {awayFlagEl}
          </View>
        </View>
        {showFt ? (
          <Text style={styles.ftHint}>
            FT {match.home_score}-{match.away_score}
          </Text>
        ) : null}
      </View>
      {rail}
    </View>
  );
}
