import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import {
  wcFootballListAdminCompetitions,
  type WcFootballCompetition,
} from '@/features/wc2026/services/football-competitions';
import {
  wcAdminFetchUserAntePostPredictions,
  wcAdminListAntePostEntrants,
  wcAdminSetAntePostReopen,
  wcAdminUpsertAntePostPrediction,
  type WcAntePostEntrantRow,
} from '@/features/wc2026/services/ante-post-admin';
import type { WcLeaderboardPredictionRow } from '@/features/wc2026/services/football-leaderboard';

function adminAlert(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message != null && message !== '' ? `${title}\n\n${message}` : title);
    return;
  }
  if (message) Alert.alert(title, message);
  else Alert.alert(title);
}

function statusLabel(row: WcAntePostEntrantRow): { text: string; tone: 'muted' | 'warn' | 'ok' | 'edit' } {
  if (row.admin_reopened) return { text: 'Reopened for edit', tone: 'edit' };
  if (row.locked) return { text: 'Locked in', tone: 'ok' };
  if (row.submitted) return { text: 'Submitted', tone: 'ok' };
  if (row.ante_prediction_count > 0) return { text: 'In progress', tone: 'warn' };
  return { text: 'Not started', tone: 'muted' };
}

export default function AdminWcFootballEntriesScreen() {
  const theme = useTheme();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [comps, setComps] = useState<WcFootballCompetition[]>([]);
  const [compId, setCompId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [entrants, setEntrants] = useState<WcAntePostEntrantRow[]>([]);
  const [loadingEntrants, setLoadingEntrants] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<WcLeaderboardPredictionRow[]>([]);
  const [loadingPreds, setLoadingPreds] = useState(false);
  const [reopenModal, setReopenModal] = useState<{ userId: string; username: string } | null>(null);
  const [reopenNote, setReopenNote] = useState('');
  const [overrideMatch, setOverrideMatch] = useState('');
  const [overrideHome, setOverrideHome] = useState('');
  const [overrideAway, setOverrideAway] = useState('');
  const [busy, setBusy] = useState(false);

  const loadMeta = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      if (!uid) {
        setRole(null);
        return;
      }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
      setRole((prof as { role?: string } | null)?.role ?? 'User');
      const list = await wcFootballListAdminCompetitions();
      setComps(list);
      setCompId((prev) => (prev ?? (list.length > 0 ? list[0].id : null)));
    } catch {
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEntrants = useCallback(async () => {
    if (!compId) {
      setEntrants([]);
      return;
    }
    setLoadingEntrants(true);
    try {
      const rows = await wcAdminListAntePostEntrants(compId, search);
      setEntrants(rows);
    } catch (e) {
      adminAlert('Could not load entrants', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoadingEntrants(false);
    }
  }, [compId, search]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadEntrants();
  }, [loadEntrants]);

  const loadPredictions = async (userId: string) => {
    if (!compId) return;
    setLoadingPreds(true);
    try {
      const rows = await wcAdminFetchUserAntePostPredictions(compId, userId);
      setPredictions(rows);
    } catch (e) {
      adminAlert('Could not load picks', e instanceof Error ? e.message : 'Unknown error');
      setPredictions([]);
    } finally {
      setLoadingPreds(false);
    }
  };

  const toggleExpand = async (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setPredictions([]);
      setOverrideMatch('');
      setOverrideHome('');
      setOverrideAway('');
      return;
    }
    setExpandedUserId(userId);
    setOverrideMatch('');
    setOverrideHome('');
    setOverrideAway('');
    await loadPredictions(userId);
  };

  const confirmReopen = async () => {
    if (!reopenModal) return;
    setBusy(true);
    try {
      const res = await wcAdminSetAntePostReopen(reopenModal.userId, true, reopenNote.trim() || undefined);
      if (!res.success) {
        adminAlert('Reopen failed', res.error);
        return;
      }
      adminAlert('Reopened', `${reopenModal.username} can edit their ante-post picks again on any device.`);
      setReopenModal(null);
      setReopenNote('');
      await loadEntrants();
    } finally {
      setBusy(false);
    }
  };

  const relock = async (row: WcAntePostEntrantRow) => {
    setBusy(true);
    try {
      const res = await wcAdminSetAntePostReopen(row.user_id, false);
      if (!res.success) {
        adminAlert('Lock failed', res.error);
        return;
      }
      adminAlert('Locked again', `${row.username}'s entries are read-only again.`);
      await loadEntrants();
    } finally {
      setBusy(false);
    }
  };

  const applyOverride = async (userId: string) => {
    const mn = parseInt(overrideMatch.trim(), 10);
    const home = parseInt(overrideHome.trim(), 10);
    const away = parseInt(overrideAway.trim(), 10);
    if (!Number.isFinite(mn) || !Number.isFinite(home) || !Number.isFinite(away)) {
      adminAlert('Invalid scores', 'Enter match number, home score, and away score.');
      return;
    }
    setBusy(true);
    try {
      const res = await wcAdminUpsertAntePostPrediction(userId, mn, home, away);
      if (!res.success) {
        adminAlert('Override failed', res.error);
        return;
      }
      adminAlert('Saved', `Match ${mn} updated to ${home}–${away}.`);
      await loadPredictions(userId);
      await loadEntrants();
    } finally {
      setBusy(false);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
          gap: 12,
        },
        title: { fontFamily: theme.fontFamily.regular, fontSize: 18, fontWeight: '700', color: theme.colors.text, flex: 1 },
        body: { padding: theme.spacing.md, gap: theme.spacing.md, paddingBottom: 48 },
        muted: { fontFamily: theme.fontFamily.light, fontSize: 13, color: theme.colors.textSecondary },
        input: {
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 8,
          padding: 12,
          color: theme.colors.text,
          fontFamily: theme.fontFamily.regular,
        },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        chip: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        chipActive: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent + '22' },
        chipText: { fontFamily: theme.fontFamily.regular, fontSize: 13, color: theme.colors.text },
        card: {
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.surface,
        },
        rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
        name: { fontFamily: theme.fontFamily.regular, fontWeight: '700', fontSize: 15, color: theme.colors.text },
        badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
        badgeText: { fontFamily: theme.fontFamily.regular, fontSize: 11, fontWeight: '600' },
        actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
        btn: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: theme.colors.accent,
        },
        btnOutline: {
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        btnText: { fontFamily: theme.fontFamily.regular, fontSize: 13, fontWeight: '600', color: theme.colors.white },
        btnOutlineText: { fontFamily: theme.fontFamily.regular, fontSize: 13, fontWeight: '600', color: theme.colors.text },
        predRow: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingVertical: 6,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.border,
        },
        overrideRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
        smallInput: {
          flex: 1,
          minWidth: 64,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 8,
          padding: 8,
          color: theme.colors.text,
          fontFamily: theme.fontFamily.regular,
        },
        modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
        modalCard: {
          backgroundColor: theme.colors.surface,
          borderRadius: 12,
          padding: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        modalTitle: { fontFamily: theme.fontFamily.regular, fontWeight: '700', fontSize: 16, color: theme.colors.text },
      }),
    [theme]
  );

  const badgeColors = (tone: ReturnType<typeof statusLabel>['tone']) => {
    switch (tone) {
      case 'edit':
        return { bg: '#E8F4FD', fg: '#1565C0' };
      case 'ok':
        return { bg: '#E8F5E9', fg: '#2E7D32' };
      case 'warn':
        return { bg: '#FFF8E1', fg: '#F57F17' };
      default:
        return { bg: theme.colors.border, fg: theme.colors.textSecondary };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.accent} />
      </SafeAreaView>
    );
  }

  if (role !== 'Admin') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={theme.colors.accent} />
          </TouchableOpacity>
          <Text style={styles.title}>Ante-post entries</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.muted}>Admin access required.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.accent} />
        </TouchableOpacity>
        <Text style={styles.title}>Ante-post entries</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>
          Reopen locked-in picks so a user can fix a genuine mistake, or override a single match score directly.
        </Text>

        {comps.length === 0 ? (
          <Text style={styles.muted}>No WC football competitions yet. Create one in WC Football admin.</Text>
        ) : (
          <>
            <Text style={{ fontFamily: theme.fontFamily.regular, fontWeight: '600', color: theme.colors.text }}>Mini-league</Text>
            <View style={styles.chipRow}>
              {comps.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, compId === c.id && styles.chipActive]}
                  onPress={() => {
                    setCompId(c.id);
                    setExpandedUserId(null);
                  }}
                >
                  <Text style={styles.chipText}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Search by username"
              placeholderTextColor={theme.colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {loadingEntrants ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : entrants.length === 0 ? (
              <Text style={styles.muted}>No participants match your search.</Text>
            ) : (
              entrants.map((row) => {
                const st = statusLabel(row);
                const colors = badgeColors(st.tone);
                const expanded = expandedUserId === row.user_id;
                return (
                  <View key={row.user_id} style={styles.card}>
                    <View style={styles.rowTop}>
                      <Text style={styles.name}>{row.username}</Text>
                      <View style={[styles.badge, { backgroundColor: colors.bg }]}>
                        <Text style={[styles.badgeText, { color: colors.fg }]}>{st.text}</Text>
                      </View>
                    </View>
                    <Text style={styles.muted}>
                      {row.ante_prediction_count} ante-post pick{row.ante_prediction_count === 1 ? '' : 's'}
                      {row.reopen_note ? ` · Note: ${row.reopen_note}` : ''}
                    </Text>
                    <View style={styles.actions}>
                      {row.locked && !row.admin_reopened ? (
                        <TouchableOpacity
                          style={styles.btn}
                          disabled={busy}
                          onPress={() => {
                            setReopenNote('');
                            setReopenModal({ userId: row.user_id, username: row.username });
                          }}
                        >
                          <Text style={styles.btnText}>Reopen for editing</Text>
                        </TouchableOpacity>
                      ) : null}
                      {row.admin_reopened ? (
                        <TouchableOpacity style={styles.btnOutline} disabled={busy} onPress={() => void relock(row)}>
                          <Text style={styles.btnOutlineText}>Lock again</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity style={styles.btnOutline} onPress={() => void toggleExpand(row.user_id)}>
                        <Text style={styles.btnOutlineText}>{expanded ? 'Hide picks' : 'View / override'}</Text>
                      </TouchableOpacity>
                    </View>

                    {expanded ? (
                      <View style={{ marginTop: 12 }}>
                        {loadingPreds ? (
                          <ActivityIndicator color={theme.colors.accent} />
                        ) : predictions.length === 0 ? (
                          <Text style={styles.muted}>No ante-post predictions saved yet.</Text>
                        ) : (
                          predictions.slice(0, 40).map((p) => (
                            <View key={p.id} style={styles.predRow}>
                              <Text style={{ fontFamily: theme.fontFamily.regular, color: theme.colors.text }}>
                                M{p.match_number ?? '?'}
                              </Text>
                              <Text style={{ fontFamily: theme.fontFamily.regular, color: theme.colors.textSecondary }}>
                                {p.home_score ?? '–'} : {p.away_score ?? '–'}
                              </Text>
                            </View>
                          ))
                        )}
                        {predictions.length > 40 ? (
                          <Text style={styles.muted}>Showing first 40 matches.</Text>
                        ) : null}
                        <Text style={[styles.muted, { marginTop: 10 }]}>Override one match (admin)</Text>
                        <View style={styles.overrideRow}>
                          <TextInput
                            style={styles.smallInput}
                            placeholder="Match #"
                            placeholderTextColor={theme.colors.textMuted}
                            value={overrideMatch}
                            onChangeText={setOverrideMatch}
                            keyboardType="number-pad"
                          />
                          <TextInput
                            style={styles.smallInput}
                            placeholder="Home"
                            placeholderTextColor={theme.colors.textMuted}
                            value={overrideHome}
                            onChangeText={setOverrideHome}
                            keyboardType="number-pad"
                          />
                          <TextInput
                            style={styles.smallInput}
                            placeholder="Away"
                            placeholderTextColor={theme.colors.textMuted}
                            value={overrideAway}
                            onChangeText={setOverrideAway}
                            keyboardType="number-pad"
                          />
                          <TouchableOpacity
                            style={styles.btn}
                            disabled={busy}
                            onPress={() => void applyOverride(row.user_id)}
                          >
                            <Text style={styles.btnText}>Save</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={reopenModal != null} transparent animationType="fade" onRequestClose={() => setReopenModal(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setReopenModal(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Reopen for {reopenModal?.username}</Text>
            <Text style={[styles.muted, { marginTop: 8 }]}>
              They can edit all ante-post stages again until you lock them or they resubmit the final.
            </Text>
            <TextInput
              style={[styles.input, { marginTop: 12 }]}
              placeholder="Optional note (e.g. wrong bronze pick)"
              placeholderTextColor={theme.colors.textMuted}
              value={reopenNote}
              onChangeText={setReopenNote}
            />
            <View style={[styles.actions, { justifyContent: 'flex-end' }]}>
              <TouchableOpacity style={styles.btnOutline} onPress={() => setReopenModal(null)}>
                <Text style={styles.btnOutlineText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btn} disabled={busy} onPress={() => void confirmReopen()}>
                <Text style={styles.btnText}>Reopen</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
