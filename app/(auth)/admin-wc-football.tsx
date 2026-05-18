import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import { wcSupabase } from '@/features/wc2026/lib/supabase';
import {
  wcFootballCreateCompetition,
  wcFootballListAdminCompetitions,
  wcAdminSetTournamentFlag,
  type WcFootballCompetition,
} from '@/features/wc2026/services/football-competitions';

function adminAlert(title: string, message?: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message != null && message !== '' ? `${title}\n\n${message}` : title);
    return;
  }
  if (message) Alert.alert(title, message);
  else Alert.alert(title);
}

export default function AdminWcFootballScreen() {
  const theme = useTheme();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [comps, setComps] = useState<WcFootballCompetition[]>([]);
  const [matchDay, setMatchDay] = useState(false);

  const load = useCallback(async () => {
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

      const { data: flags } = await wcSupabase.from('tournament_flags').select('flag_key, flag_value');
      for (const row of flags ?? []) {
        const r = row as { flag_key: string; flag_value: boolean };
        if (r.flag_key === 'match_day_tips_unlocked') setMatchDay(Boolean(r.flag_value));
      }

      const list = await wcFootballListAdminCompetitions();
      setComps(list);
    } catch {
      setRole(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
        title: { fontFamily: theme.fontFamily.regular, fontSize: 18, fontWeight: '700', color: theme.colors.text },
        body: { padding: theme.spacing.md, gap: theme.spacing.lg },
        card: {
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.surface,
        },
        cardTitle: { fontFamily: theme.fontFamily.regular, fontWeight: '700', fontSize: 15, color: theme.colors.text },
        input: {
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: 8,
          padding: 12,
          marginTop: 8,
          color: theme.colors.text,
          fontFamily: theme.fontFamily.regular,
        },
        btn: {
          marginTop: 12,
          backgroundColor: theme.colors.accent,
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        },
        btnText: { fontFamily: theme.fontFamily.regular, fontWeight: '700', color: theme.colors.white },
        row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
        muted: { fontFamily: theme.fontFamily.light, fontSize: 13, color: theme.colors.textSecondary, marginTop: 6 },
        code: { fontFamily: theme.fontFamily.regular, fontSize: 20, fontWeight: '800', letterSpacing: 2, color: theme.colors.accent },
      }),
    [theme]
  );

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
          <Text style={styles.title}>WC Football admin</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.muted}>You need an Admin profile to manage World Cup football competitions.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const create = async () => {
    if (!name.trim()) {
      adminAlert('Name required');
      return;
    }
    setBusy(true);
    try {
      const res = await wcFootballCreateCompetition(name.trim());
      if (!res.success) {
        adminAlert('Could not create', res.error);
        return;
      }
      adminAlert('Competition created', `Access code: ${res.access_code}`);
      setName('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const setFlag = async (key: 'knockout_ante_enabled' | 'match_day_tips_unlocked', value: boolean) => {
    const res = await wcAdminSetTournamentFlag(key, value);
    if (!res.success) {
      adminAlert('Update failed', res.error);
      return;
    }
    if (key === 'knockout_ante_enabled') setKnockoutAnte(value);
    else setMatchDay(value);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.accent} />
        </TouchableOpacity>
        <Text style={styles.title}>WC Football admin</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <TouchableOpacity
          style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}
          onPress={() => router.push('/(auth)/admin-wc-football-entries')}
          activeOpacity={0.85}
        >
          <Ionicons name="clipboard-outline" size={22} color={theme.colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Legacy ante-post entries</Text>
            <Text style={styles.muted}>Reopen or override ante-post picks (separate competition flow, not shown in the app).</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tournament gates</Text>
          <Text style={styles.muted}>Control when match day picks open for all users.</Text>
          <View style={styles.row}>
            <Text style={{ fontFamily: theme.fontFamily.regular, color: theme.colors.text }}>Match day picks</Text>
            <Switch value={matchDay} onValueChange={(v) => void setFlag('match_day_tips_unlocked', v)} />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>New mini-league</Text>
          <TextInput
            style={styles.input}
            placeholder="Competition name"
            placeholderTextColor={theme.colors.textMuted}
            value={name}
            onChangeText={setName}
          />
          <TouchableOpacity style={styles.btn} onPress={() => void create()} disabled={busy}>
            {busy ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.btnText}>Create + access code</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>All WC football competitions</Text>
          {comps.length === 0 ? (
            <Text style={styles.muted}>None yet.</Text>
          ) : (
            comps.map((c) => (
              <View key={c.id} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }}>
                <Text style={{ fontFamily: theme.fontFamily.regular, fontWeight: '700', color: theme.colors.text }}>{c.name}</Text>
                <Text style={styles.muted}>Code</Text>
                <Text style={styles.code}>{c.access_code}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
