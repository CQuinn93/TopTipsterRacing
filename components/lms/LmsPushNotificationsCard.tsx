import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  getActiveWebPushSubscription,
  getVapidPublicKey,
  getWebPushPermission,
  isRunningAsInstalledWebApp,
  isWebPushSupported,
  subscribeWebPush,
  unsubscribeWebPush,
} from '@/lib/webPush';

type Status =
  | 'loading'
  | 'unsupported'
  | 'not_configured'
  | 'need_homescreen'
  | 'denied'
  | 'off'
  | 'on';

/**
 * Opt-in card for LMS deadline Web Push (Home Screen web app only).
 */
export function LmsPushNotificationsCard() {
  const theme = useTheme();
  const { userId } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    if (Platform.OS !== 'web') {
      setStatus('unsupported');
      return;
    }
    if (!isWebPushSupported()) {
      setStatus('unsupported');
      return;
    }
    if (!getVapidPublicKey()) {
      setStatus('not_configured');
      return;
    }
    if (!isRunningAsInstalledWebApp()) {
      setStatus('need_homescreen');
      return;
    }
    const perm = getWebPushPermission();
    if (perm === 'denied') {
      setStatus('denied');
      return;
    }
    const sub = await getActiveWebPushSubscription();
    setStatus(sub ? 'on' : 'off');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
          backgroundColor: theme.colors.surface,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        },
        title: {
          flex: 1,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 15,
          color: theme.colors.text,
        },
        body: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 13,
          color: theme.colors.textSecondary,
          lineHeight: 18,
        },
        error: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.error,
        },
        btn: {
          marginTop: theme.spacing.xs,
          alignSelf: 'flex-start',
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.accent,
          minWidth: 140,
          alignItems: 'center',
        },
        btnMuted: {
          backgroundColor: theme.colors.border,
        },
        btnText: {
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 13,
          color: theme.colors.white,
        },
        btnTextMuted: {
          color: theme.colors.text,
        },
      }),
    [theme]
  );

  const onEnable = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    const res = await subscribeWebPush(userId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        /* keep inline error */
      } else {
        Alert.alert('Notifications', res.error);
      }
      await refresh();
      return;
    }
    await refresh();
  };

  const onDisable = async () => {
    if (!userId) return;
    setBusy(true);
    setError(null);
    const res = await unsubscribeWebPush(userId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      await refresh();
      return;
    }
    await refresh();
  };

  if (status === 'loading') {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (status === 'unsupported') {
    return null;
  }

  let body =
    'Get a nudge before the pick deadline if you have not selected — including the team you would be auto-assigned.';
  let action: { label: string; onPress: () => void; muted?: boolean } | null = null;

  if (status === 'not_configured') {
    body = 'Push notifications are not configured on this deployment yet.';
  } else if (status === 'need_homescreen') {
    body =
      'To enable alerts: Safari Share → Add to Home Screen, open Top Tipster from that icon, then tap Enable here.';
  } else if (status === 'denied') {
    body = 'Notifications are blocked for this app. Enable them in iOS Settings → Top Tipster.';
  } else if (status === 'off') {
    action = { label: 'Enable notifications', onPress: () => void onEnable() };
  } else if (status === 'on') {
    body = 'Deadline reminders are on for this device.';
    action = { label: 'Turn off', onPress: () => void onDisable(), muted: true };
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Ionicons name="notifications-outline" size={20} color={theme.colors.accent} />
        <Text style={styles.title}>Pick deadline alerts</Text>
      </View>
      <Text style={styles.body}>{body}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {action ? (
        <Pressable
          style={[styles.btn, action.muted && styles.btnMuted]}
          onPress={action.onPress}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color={action.muted ? theme.colors.text : '#fff'} />
          ) : (
            <Text style={[styles.btnText, action.muted && styles.btnTextMuted]}>{action.label}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
