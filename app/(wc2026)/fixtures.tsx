import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getFixtures, type Match } from '@/features/wc2026/services/fixtures';

export default function WorldCupFixturesRoute() {
  const theme = useTheme();
  const { session } = useAuth();
  const [fixtures, setFixtures] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const data = await getFixtures();
        if (!cancelled) setFixtures(data);
      } catch {
        if (!cancelled) {
          setErrorMessage('Unable to load fixtures. Confirm wc2026 schema tables are populated.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { padding: theme.spacing.md, gap: theme.spacing.sm },
        card: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
        },
        teams: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.text,
          fontWeight: '700',
        },
        meta: {
          marginTop: 4,
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
      <ScrollView contentContainerStyle={styles.content}>
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
          fixtures.map((fixture) => (
            <View style={styles.card} key={fixture.id}>
              <Text style={styles.teams}>
                {fixture.home_team?.country_name ?? fixture.home_team_id} vs{' '}
                {fixture.away_team?.country_name ?? fixture.away_team_id}
              </Text>
              <Text style={styles.meta}>{new Date(fixture.match_date).toLocaleString()}</Text>
              <Text style={styles.meta}>
                {fixture.tournament_stage?.stage_name ?? 'Stage TBC'}
                {fixture.group?.group_name ? ` • Group ${fixture.group.group_name}` : ''}
              </Text>
            </View>
          ))}
      </ScrollView>
    </View>
  );
}
