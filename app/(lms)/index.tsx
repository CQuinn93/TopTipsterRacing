import { useCallback, useMemo, useState } from 'react';
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
import {
  lmsJoinErrorMessage,
  lmsListMyCompetitions,
  lmsListMyPendingJoins,
  lmsRequestJoin,
  type LmsCompetitionRow,
  type LmsPendingJoin,
} from '@/lib/lms/api';
import { LmsTrademarkDisclaimer } from '@/components/lms/LmsTrademarkDisclaimer';

export default function LmsHomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [comps, setComps] = useState<LmsCompetitionRow[]>([]);
  const [pending, setPending] = useState<LmsPendingJoin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([lmsListMyCompetitions(), lmsListMyPendingJoins()]);
      setComps(c);
      setPending(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load competitions';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

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
      Alert.alert('Request sent', `Your request to join ${res.competition_name ?? 'the competition'} is pending admin approval.`);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Join failed');
    } finally {
      setJoining(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
        },
        back: { padding: 4 },
        titleBlock: { flex: 1 },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          fontWeight: '700',
          color: theme.colors.text,
        },
        sub: {
          fontFamily: theme.fontFamily.light,
          fontSize: 13,
          color: theme.colors.accent,
          marginTop: 2,
        },
        content: {
          padding: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
          gap: theme.spacing.lg,
        },
        sectionLabel: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: theme.colors.accent,
          marginBottom: theme.spacing.sm,
        },
        card: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          gap: theme.spacing.sm,
        },
        input: {
          fontFamily: theme.fontFamily.input,
          fontSize: 16,
          color: theme.colors.text,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          letterSpacing: 2,
          textTransform: 'uppercase',
        },
        primaryBtn: {
          backgroundColor: theme.colors.accent,
          borderRadius: theme.radius.md,
          paddingVertical: 12,
          alignItems: 'center',
        },
        primaryBtnText: {
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.white,
          fontWeight: '700',
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        rowLast: { borderBottomWidth: 0 },
        rowCopy: { flex: 1, minWidth: 0 },
        rowTitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 16,
          fontWeight: '600',
          color: theme.colors.text,
        },
        rowMeta: {
          fontFamily: theme.fontFamily.light,
          fontSize: 13,
          color: theme.colors.textSecondary,
          marginTop: 2,
        },
        empty: {
          fontFamily: theme.fontFamily.light,
          fontSize: 14,
          color: theme.colors.textMuted,
        },
        badge: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.textMuted,
          textTransform: 'capitalize',
        },
      }),
    [theme, insets.top, insets.bottom]
  );

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
          <View>
            <Text style={styles.sectionLabel}>Join with code</Text>
            <View style={styles.card}>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="ACCESS"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="characters"
                maxLength={6}
              />
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void onJoin()}
                disabled={joining}
              >
                {joining ? (
                  <ActivityIndicator color={theme.colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Request to join</Text>
                )}
              </Pressable>
            </View>
          </View>

          {pending.length > 0 ? (
            <View>
              <Text style={styles.sectionLabel}>Pending approval</Text>
              <View style={styles.card}>
                {pending.map((p, i) => (
                  <View key={p.competition_id} style={[styles.row, i === pending.length - 1 && styles.rowLast]}>
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
            <Text style={styles.sectionLabel}>My competitions</Text>
            <View style={styles.card}>
              {comps.length === 0 ? (
                <Text style={styles.empty}>You are not in any LMS competitions yet.</Text>
              ) : (
                comps.map((c, i) => (
                  <Pressable
                    key={c.competition_id}
                    style={[styles.row, i === comps.length - 1 && styles.rowLast]}
                    onPress={() => router.push(`/(lms)/${c.competition_id}` as any)}
                  >
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{c.name}</Text>
                      <Text style={styles.rowMeta}>
                        {c.season}
                        {c.start_gameweek_number != null ? ` · starts GW${c.start_gameweek_number}` : ''}
                        {` · you are ${c.participant_status}`}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
                  </Pressable>
                ))
              )}
            </View>
          </View>

          <LmsTrademarkDisclaimer />
        </ScrollView>
      )}
    </View>
  );
}
