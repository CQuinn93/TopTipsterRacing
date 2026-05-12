import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { getFixtures, type Match } from '@/features/wc2026/services/fixtures';
import { getUserPredictionsForMatch, upsertLiveMatchDayPrediction } from '@/features/wc2026/services/predictions';
import { getMatchDayTipsUnlocked } from '@/features/wc2026/services/tournament-gates';
import { wcHref } from '@/features/wc2026/utils/href';

type Outcome = 'H' | 'D' | 'A';

function MatchRowEditor({
  match,
  userId,
  theme,
  onSaved,
}: {
  match: Match;
  userId: string;
  theme: ReturnType<typeof useTheme>;
  onSaved: () => void;
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [goals, setGoals] = useState('');
  const [btts, setBtts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { live } = await getUserPredictionsForMatch(userId, match.id);
      if (live?.live_outcome && (live.live_outcome === 'H' || live.live_outcome === 'D' || live.live_outcome === 'A')) {
        setOutcome(live.live_outcome);
      } else setOutcome(null);
      setGoals(live?.live_total_goals != null ? String(live.live_total_goals) : '');
      setBtts(Boolean(live?.live_btts));
    } catch {
      setErr('Could not load tip');
    } finally {
      setLoading(false);
    }
  }, [match.id, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const homeName = match.home_team?.country_name ?? 'Home';
  const awayName = match.away_team?.country_name ?? 'Away';

  const save = async () => {
    if (!outcome) {
      setErr('Pick home, draw, or away');
      return;
    }
    const g = parseInt(goals, 10);
    if (Number.isNaN(g) || g < 0 || g > 20) {
      setErr('Enter total goals (0–20)');
      return;
    }
    if (match.match_number == null) {
      setErr('Missing match number');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await upsertLiveMatchDayPrediction(userId, match.id, match.match_number, {
        outcome,
        totalGoals: g,
        btts,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.md,
          backgroundColor: theme.colors.surface,
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 15,
          fontWeight: '700',
          color: theme.colors.text,
          marginBottom: 8,
        },
        row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
        pill: {
          flex: 1,
          paddingVertical: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: theme.colors.border,
          alignItems: 'center',
        },
        pillOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
        pillText: { fontFamily: theme.fontFamily.regular, fontSize: 12, color: theme.colors.text },
        pillTextOn: { color: theme.colors.white, fontWeight: '700' },
        label: {
          fontFamily: theme.fontFamily.light,
          fontSize: 12,
          color: theme.colors.textMuted,
          marginTop: 10,
          marginBottom: 4,
        },
        input: {
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: Platform.OS === 'web' ? 10 : 8,
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          backgroundColor: theme.colors.background,
        },
        saveBtn: {
          marginTop: 12,
          backgroundColor: theme.colors.accent,
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        },
        saveText: { fontFamily: theme.fontFamily.regular, fontWeight: '700', color: theme.colors.white },
        err: { color: theme.colors.error, fontSize: 12, marginTop: 8, fontFamily: theme.fontFamily.regular },
      }),
    [theme]
  );

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {homeName} vs {awayName}
      </Text>
      <Text style={[styles.label, { marginTop: 0 }]}>Result (90 min)</Text>
      <View style={styles.row}>
        {(['H', 'D', 'A'] as const).map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.pill, outcome === k && styles.pillOn]}
            onPress={() => setOutcome(k)}
            activeOpacity={0.85}
          >
            <Text style={[styles.pillText, outcome === k && styles.pillTextOn]}>
              {k === 'H' ? 'Home' : k === 'D' ? 'Draw' : 'Away'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Total goals (90 min)</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={goals}
        onChangeText={setGoals}
        placeholder="e.g. 2"
        placeholderTextColor={theme.colors.textMuted}
      />
      <View style={[styles.row, { marginTop: 10, justifyContent: 'space-between' }]}>
        <Text style={{ fontFamily: theme.fontFamily.regular, color: theme.colors.text }}>Both teams to score</Text>
        <Switch value={btts} onValueChange={setBtts} trackColor={{ true: theme.colors.accent }} />
      </View>
      {err ? <Text style={styles.err}>{err}</Text> : null}
      <TouchableOpacity style={styles.saveBtn} onPress={() => void save()} disabled={saving}>
        {saving ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.saveText}>Save tip</Text>}
      </TouchableOpacity>
    </View>
  );
}

export default function MatchDayTipsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let c = false;
    (async () => {
      setChecking(true);
      try {
        const u = await getMatchDayTipsUnlocked();
        if (!c) setUnlocked(u);
        if (!u) return;
        const all = await getFixtures();
        const ko = all.filter((m) => m.is_knockout && m.match_number != null && m.match_number >= 73);
        if (!c) setMatches(ko);
      } catch (e) {
        if (!c) setLoadErr(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!c) setChecking(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [refresh]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        backText: { fontFamily: theme.fontFamily.regular, color: theme.colors.accent, fontSize: 16 },
        h1: {
          flex: 1,
          textAlign: 'center',
          fontFamily: theme.fontFamily.regular,
          fontWeight: '700',
          fontSize: 17,
          color: theme.colors.text,
        },
        body: { padding: theme.spacing.md, paddingBottom: insets.bottom + 24 },
        locked: { fontFamily: theme.fontFamily.light, color: theme.colors.textSecondary, fontSize: 14, lineHeight: 22 },
      }),
    [theme, insets.bottom]
  );

  if (!userId) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 20, paddingHorizontal: 16 }]}>
        <Text style={styles.locked}>Sign in to enter Match Day Tips.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.back} onPress={() => router.replace(wcHref('/(wc2026)/(tabs)/selections'))}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.accent} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.h1}>Match Day Tips</Text>
        <View style={{ width: 72 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {checking ? (
          <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 24 }} />
        ) : !unlocked ? (
          <Text style={styles.locked}>
            Match Day Tips open after the group stage, when admins enable live predictions. Check back later.
          </Text>
        ) : loadErr ? (
          <Text style={[styles.locked, { color: theme.colors.error }]}>{loadErr}</Text>
        ) : matches.length === 0 ? (
          <Text style={styles.locked}>
            Knockout fixtures are not in the database yet. They will appear here once the official draw is loaded.
          </Text>
        ) : (
          matches.map((m) => (
            <MatchRowEditor key={m.id} match={m} userId={userId} theme={theme} onSaved={() => setRefresh((x) => x + 1)} />
          ))
        )}
      </ScrollView>
    </View>
  );
}
