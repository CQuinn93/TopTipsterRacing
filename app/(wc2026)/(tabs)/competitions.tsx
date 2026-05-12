import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import {
  wcFootballJoinCompetition,
  wcFootballListMyCompetitions,
  type WcFootballCompetition,
} from '@/features/wc2026/services/football-competitions';
import { wcFootballLeaderboard, type WcFootballLeaderboardRow } from '@/features/wc2026/services/football-leaderboard';

function joinAlert(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message != null && message !== '' ? `${title}\n\n${message}` : title);
    return;
  }
  if (message) Alert.alert(title, message);
  else Alert.alert(title);
}

export default function WorldCupCompetitionsTab() {
  const theme = useTheme();
  const { session, userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [list, setList] = useState<WcFootballCompetition[]>([]);
  const [code, setCode] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);

  const [lbOpen, setLbOpen] = useState(false);
  const [lbTitle, setLbTitle] = useState('');
  const [lbRows, setLbRows] = useState<WcFootballLeaderboardRow[]>([]);
  const [lbNames, setLbNames] = useState<Record<string, string>>({});
  const [lbLoading, setLbLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setList([]);
      return;
    }
    const mine = await wcFootballListMyCompetitions();
    setList(mine);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const openLeaderboard = async (c: WcFootballCompetition) => {
    setLbTitle(c.name);
    setLbOpen(true);
    setLbLoading(true);
    setLbRows([]);
    setLbNames({});
    try {
      const rows = await wcFootballLeaderboard(c.id);
      setLbRows(rows);
      const ids = [...new Set(rows.map((r) => r.user_id))];
      if (ids.length) {
        const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', ids);
        const map: Record<string, string> = {};
        for (const p of profiles ?? []) {
          const row = p as { id: string; username: string | null };
          map[row.id] = row.username?.trim() || 'Player';
        }
        setLbNames(map);
      }
    } finally {
      setLbLoading(false);
    }
  };

  const join = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      joinAlert('Invalid code', 'Enter the 6-character access code.');
      return;
    }
    setJoinBusy(true);
    try {
      const res = await wcFootballJoinCompetition(trimmed);
      if (!res.success) {
        joinAlert('Could not join', res.error);
        return;
      }
      joinAlert('Joined', res.name);
      setCode('');
      await load();
    } finally {
      setJoinBusy(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: 32 },
        card: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
        },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 17,
          fontWeight: '700',
          color: theme.colors.text,
        },
        body: {
          marginTop: 6,
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textSecondary,
          lineHeight: 18,
        },
        input: {
          marginTop: 10,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontFamily: theme.fontFamily.regular,
          color: theme.colors.text,
          letterSpacing: 2,
          textTransform: 'uppercase',
        },
        row: { flexDirection: 'row', gap: 10, marginTop: 12 },
        btn: {
          flex: 1,
          backgroundColor: theme.colors.accent,
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        },
        btnText: { fontFamily: theme.fontFamily.regular, fontWeight: '700', color: theme.colors.black },
        compRow: {
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        },
        compName: { fontFamily: theme.fontFamily.regular, fontWeight: '700', color: theme.colors.text, flex: 1 },
        lbBtn: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.accent,
        },
        lbBtnText: { fontFamily: theme.fontFamily.regular, fontSize: 12, fontWeight: '700', color: theme.colors.accent },
        modalBackdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          padding: 20,
        },
        modalCard: {
          maxHeight: '80%',
          backgroundColor: theme.colors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 16,
        },
        modalTitle: { fontFamily: theme.fontFamily.regular, fontSize: 17, fontWeight: '700', color: theme.colors.text },
        modalClose: { alignSelf: 'flex-end', marginBottom: 8 },
        lbLine: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: 10,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
        lbRank: { width: 28, fontFamily: theme.fontFamily.regular, color: theme.colors.textMuted },
        lbUser: { flex: 1, fontFamily: theme.fontFamily.regular, color: theme.colors.text },
        lbPts: { fontFamily: theme.fontFamily.regular, fontWeight: '700', color: theme.colors.accent },
      }),
    [theme]
  );

  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={theme.colors.accent} />}
      >
        {loading ? <ActivityIndicator color={theme.colors.accent} /> : null}

        <View style={styles.card}>
          <Text style={styles.title}>Mini-leagues</Text>
          <Text style={styles.body}>
            Join with an access code from your organiser. Your World Cup picks are the same in every league; each
            mini-league has its own leaderboard based on points from those picks.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="ACCESS"
            placeholderTextColor={theme.colors.textMuted}
            value={code}
            onChangeText={setCode}
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <View style={styles.row}>
            <TouchableOpacity style={styles.btn} onPress={() => void join()} disabled={joinBusy}>
              {joinBusy ? <ActivityIndicator color={theme.colors.black} /> : <Text style={styles.btnText}>Join league</Text>}
            </TouchableOpacity>
          </View>
          {refreshing ? <ActivityIndicator style={{ marginTop: 8 }} color={theme.colors.accent} /> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Your leagues</Text>
          {list.length === 0 ? (
            <Text style={styles.body}>You have not joined a mini-league yet.</Text>
          ) : (
            list.map((c) => (
              <View key={c.id} style={styles.compRow}>
                <Text style={styles.compName} numberOfLines={2}>
                  {c.name}
                </Text>
                <TouchableOpacity style={styles.lbBtn} onPress={() => void openLeaderboard(c)}>
                  <Text style={styles.lbBtnText}>Leaderboard</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={lbOpen} transparent animationType="fade" onRequestClose={() => setLbOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setLbOpen(false)}>
              <Text style={{ color: theme.colors.accent, fontWeight: '700' }}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{lbTitle}</Text>
            {lbLoading ? (
              <ActivityIndicator style={{ marginTop: 16 }} color={theme.colors.accent} />
            ) : (
              <FlatList
                data={lbRows}
                keyExtractor={(item) => item.user_id}
                style={{ marginTop: 12 }}
                renderItem={({ item, index }) => (
                  <View style={styles.lbLine}>
                    <Text style={styles.lbRank}>{index + 1}</Text>
                    <Text style={styles.lbUser} numberOfLines={1}>
                      {lbNames[item.user_id] ?? (item.user_id === userId ? 'You' : 'Player')}
                    </Text>
                    <Text style={styles.lbPts}>{item.total_points}</Text>
                  </View>
                )}
                ListEmptyComponent={<Text style={styles.body}>No scores yet.</Text>}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
