import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { getUpcomingFixtures, type Match } from '@/features/wc2026/services/fixtures';
import { getSharedProfile } from '@/features/wc2026/services/profile';

export function WorldCupHomeScreen() {
  const theme = useTheme();
  const { userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('Manager');
  const [upcomingFixtures, setUpcomingFixtures] = useState<Match[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        if (userId) {
          const profile = await getSharedProfile(userId);
          if (!cancelled && profile?.username) {
            setUsername(profile.username);
          }
        }

        const fixtures = await getUpcomingFixtures(8);
        if (!cancelled) {
          setUpcomingFixtures(fixtures);
        }
      } catch {
        if (!cancelled) {
          setErrorMessage(
            'World Cup data is not available yet. Once wc2026 tables are created in Supabase, fixtures will load here.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: theme.colors.background,
        },
        content: {
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 26,
          fontWeight: '700',
          color: theme.colors.text,
          textAlign: 'center',
        },
        body: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          color: theme.colors.textSecondary,
          textAlign: 'center',
          lineHeight: 21,
        },
        chip: {
          alignSelf: 'center',
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
        },
        chipText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        button: {
          marginTop: theme.spacing.sm,
          alignSelf: 'center',
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
        },
        buttonText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 14,
          fontWeight: '600',
          color: theme.colors.black,
        },
        sectionTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '700',
          color: theme.colors.text,
          marginTop: theme.spacing.md,
        },
        fixtureCard: {
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          gap: theme.spacing.xs,
        },
        fixtureTeams: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          color: theme.colors.text,
          fontWeight: '600',
        },
        fixtureMeta: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          color: theme.colors.textMuted,
        },
        errorCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
        },
        errorText: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textSecondary,
          lineHeight: 20,
        },
        loadingWrap: {
          paddingVertical: theme.spacing.md,
          alignItems: 'center',
        },
      }),
    [theme]
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Top Tipster World Cup</Text>
        <Text style={styles.body}>
          Welcome {username}. This module now runs inside the shared Top Tipster app and will use the dedicated
          `wc2026` schema in the same Supabase project.
        </Text>
        <View style={styles.chip}>
          <Ionicons name="checkmark-circle-outline" size={14} color={theme.colors.accent} />
          <Text style={styles.chipText}>Shared auth with Top Tipster Racing enabled</Text>
        </View>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/competition-hub')}>
          <Ionicons name="swap-horizontal-outline" size={18} color={theme.colors.black} />
          <Text style={styles.buttonText}>Switch competition</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Upcoming fixtures</Text>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : null}

        {!loading && errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {!loading && !errorMessage && upcomingFixtures.length === 0 ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>No fixtures available yet in the wc2026 schema.</Text>
          </View>
        ) : null}

        {!loading &&
          !errorMessage &&
          upcomingFixtures.map((fixture) => (
            <View key={fixture.id} style={styles.fixtureCard}>
              <Text style={styles.fixtureTeams}>
                {fixture.home_team?.country_name ?? fixture.home_team_id} vs{' '}
                {fixture.away_team?.country_name ?? fixture.away_team_id}
              </Text>
              <Text style={styles.fixtureMeta}>
                {new Date(fixture.match_date).toLocaleString()}
              </Text>
              <Text style={styles.fixtureMeta}>
                {fixture.venue?.name ? `${fixture.venue.name}, ${fixture.venue.city}` : 'Venue TBC'}
              </Text>
            </View>
          ))}
      </ScrollView>
    </View>
  );
}
