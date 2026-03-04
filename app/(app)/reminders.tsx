import { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, RefreshControl, ActivityIndicator } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { getCompetitionDisplayStatus } from '@/lib/appUtils';
import { getNotificationCompetitionIds, addNotificationCompetition, removeNotificationCompetition } from '@/lib/notificationCompetitionPrefs';
import { requestPermissionsAndSetup, scheduleRemindersForCompetition, cancelRemindersForCompetition } from '@/lib/selectionReminderNotifications';

type CompRow = {
  competition_id: string;
  name: string;
  festival_start_date: string;
  festival_end_date: string;
  status: string;
};

export default function RemindersScreen() {
  const theme = useTheme();
  const { userId } = useAuth();
  const [list, setList] = useState<CompRow[]>([]);
  const [optedInIds, setOptedInIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      const { data: participantsData, error: partErr } = await supabase
        .from('competition_participants')
        .select('competition_id')
        .eq('user_id', userId);
      if (partErr || !participantsData?.length) {
        setList([]);
        return;
      }
      const compIds = [...new Set((participantsData as { competition_id: string }[]).map((p) => p.competition_id))];
      const { data: comps, error: compsErr } = await supabase
        .from('competitions')
        .select('id, name, festival_start_date, festival_end_date')
        .in('id', compIds);
      if (compsErr || !comps?.length) {
        setList([]);
        return;
      }
      const rows: CompRow[] = (comps as { id: string; name: string; festival_start_date: string; festival_end_date: string }[]).map((c) => {
        const displayStatus = getCompetitionDisplayStatus(c.festival_start_date, c.festival_end_date);
        const statusLabel = displayStatus === 'upcoming' ? 'Upcoming' : displayStatus === 'live' ? 'Live' : 'Complete';
        return {
          competition_id: c.id,
          name: c.name,
          festival_start_date: c.festival_start_date,
          festival_end_date: c.festival_end_date,
          status: statusLabel,
        };
      });
      setList(rows);
      const ids = await getNotificationCompetitionIds(userId);
      setOptedInIds(new Set(ids));
    } catch {
      setList([]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, [userId]);

  const onToggle = async (c: CompRow, value: boolean) => {
    if (!userId) return;
    setTogglingId(c.competition_id);
    try {
      if (value) {
        const granted = await requestPermissionsAndSetup();
        if (!granted) {
          setTogglingId(null);
          return;
        }
        await addNotificationCompetition(userId, c.competition_id);
        await scheduleRemindersForCompetition(supabase, userId, c.competition_id, c.name);
        setOptedInIds((prev) => new Set([...prev, c.competition_id]));
      } else {
        await removeNotificationCompetition(userId, c.competition_id);
        await cancelRemindersForCompetition(c.competition_id);
        setOptedInIds((prev) => {
          const next = new Set(prev);
          next.delete(c.competition_id);
          return next;
        });
      }
    } finally {
      setTogglingId(null);
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: theme.colors.background },
        content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
        title: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 20,
          color: theme.colors.text,
          marginBottom: theme.spacing.xs,
        },
        subtitle: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textSecondary,
          marginBottom: theme.spacing.lg,
        },
        card: {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        cardLeft: { flex: 1, minWidth: 0 },
        cardTitle: { fontFamily: theme.fontFamily.regular, fontSize: 15, color: theme.colors.text },
        cardMeta: { fontFamily: theme.fontFamily.regular, fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
        cardStatus: { fontFamily: theme.fontFamily.regular, fontSize: 11, color: theme.colors.accent, marginTop: 2 },
        empty: {
          fontFamily: theme.fontFamily.regular,
          fontSize: 13,
          color: theme.colors.textMuted,
          textAlign: 'center',
          marginTop: theme.spacing.lg,
        },
      }),
    [theme]
  );

  if (!userId) return null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={theme.colors.accent} />}
    >
      <Text style={styles.title}>Reminders</Text>
      <Text style={styles.subtitle}>
        Get a notification about 1 hour before selections close for each race day. Turn on for the competitions you want reminders for.
      </Text>
      {list.length === 0 && !refreshing ? (
        <Text style={styles.empty}>You're not in any competitions yet. Join one from My Competitions.</Text>
      ) : (
        list.map((c) => {
          const enabled = optedInIds.has(c.competition_id);
          const busy = togglingId === c.competition_id;
          return (
            <View key={c.competition_id} style={styles.card}>
              <View style={styles.cardLeft}>
                <Text style={styles.cardTitle}>{c.name}</Text>
                <Text style={styles.cardMeta}>
                  {new Date(c.festival_start_date).toLocaleDateString()} – {new Date(c.festival_end_date).toLocaleDateString()}
                </Text>
                <Text style={styles.cardStatus}>{c.status}</Text>
              </View>
              {busy ? (
                <ActivityIndicator size="small" color={theme.colors.accent} />
              ) : (
                <Switch
                  value={enabled}
                  onValueChange={(value) => onToggle(c, value)}
                  trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                  thumbColor={theme.colors.surface}
                />
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
