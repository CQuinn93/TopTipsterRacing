import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Platform,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  getActiveWebPushSubscription,
  getVapidPublicKey,
  getWebPushPermission,
  isRunningAsInstalledWebApp,
  isWebPushBoundToCurrentUser,
  isWebPushSupported,
  sendWebPushTest,
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
 * Compact LMS deadline Web Push opt-in (Home Screen web app) + test send.
 */
export function LmsPushNotificationsCard() {
  const theme = useTheme();
  const { userId } = useAuth();
  const [status, setStatus] = useState<Status>('loading');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);

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
    if (!sub) {
      setStatus('off');
      return;
    }
    const bound = await isWebPushBoundToCurrentUser();
    setStatus(bound ? 'on' : 'off');
  }, [userId]);

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
          paddingVertical: 12,
          paddingHorizontal: theme.spacing.md,
          backgroundColor: theme.colors.surface,
          gap: 6,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
          minHeight: 28,
        },
        title: {
          flex: 1,
          fontFamily: theme.fontFamily.baiBold,
          fontSize: 15,
          color: theme.colors.text,
        },
        hint: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 12,
          color: theme.colors.textMuted,
          lineHeight: 16,
        },
        error: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.error,
        },
        switchWrap: {
          minWidth: 52,
          alignItems: 'flex-end',
          justifyContent: 'center',
        },
        testBtn: {
          alignSelf: 'flex-start',
          marginTop: 4,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
        testBtnText: {
          fontFamily: theme.fontFamily.baiMedium,
          fontSize: 12,
          color: theme.colors.accent,
        },
        statusLine: {
          fontFamily: theme.fontFamily.baiLight,
          fontSize: 11,
          color: theme.colors.textMuted,
          marginTop: 2,
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

  const onToggle = (value: boolean) => {
    if (busy || testing) return;

    if (status === 'need_homescreen') {
      if (Platform.OS === 'web') {
        router.push('/(auth)/add-to-home-screen');
      } else {
        Alert.alert(
          'Deadline Alerts',
          'Add Top Tipster to your Home Screen, then open it from that icon to enable alerts.'
        );
      }
      return;
    }

    if (status === 'denied') {
      Alert.alert(
        'Deadline Alerts',
        'Notifications are blocked for this app. Enable them in your device settings.'
      );
      return;
    }

    if (status === 'not_configured') {
      Alert.alert('Deadline Alerts', 'Push notifications are not configured on this deployment yet.');
      return;
    }

    if (value) void onEnable();
    else void onDisable();
  };

  const onSendTest = async () => {
    if (testing || busy) return;
    setTesting(true);
    setError(null);
    setTestStatus('Calling notify-web-push-test…');
    try {
      const res = await sendWebPushTest();
      if (!res.ok) {
        setError(res.error || 'Test notification failed.');
        setTestStatus('Failed — see message below.');
        Alert.alert(
          'Test notification',
          res.error ||
            'Failed. Check Deadline Alerts is on, VAPID secrets are correct, and notify-web-push-test is deployed.'
        );
        return;
      }
      setTestStatus(`Server sent ${res.sent ?? 1} push(es). Check for a banner.`);
      Alert.alert(
        'Test notification',
        `Sent (${res.sent ?? 1}). If you do not see a banner within a few seconds, check Focus / notification settings for this app.`
      );
    } finally {
      setTesting(false);
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.title}>Deadline Alerts</Text>
          <View style={styles.switchWrap}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        </View>
      </View>
    );
  }

  if (status === 'unsupported') {
    return null;
  }

  const enabled = status === 'on';

  let hint: string | null = null;
  if (status === 'need_homescreen') {
    hint = 'Add to Home Screen first, then turn this on.';
  } else if (status === 'denied') {
    hint = 'Notifications are blocked in device settings.';
  } else if (status === 'not_configured') {
    hint = 'Push is not configured on this deployment yet.';
  } else if (enabled) {
    hint = 'Uses the same device channel as join-request alerts.';
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.title}>Deadline Alerts</Text>
        <View style={styles.switchWrap}>
          {busy ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : (
            <Switch
              value={enabled}
              onValueChange={onToggle}
              disabled={busy || testing}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.accentDim,
              }}
              thumbColor={enabled ? theme.colors.accent : '#f4f3f4'}
              ios_backgroundColor={theme.colors.border}
              accessibilityLabel="Deadline Alerts"
              accessibilityState={{ checked: enabled, disabled: busy }}
            />
          )}
        </View>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {enabled ? (
        <TouchableOpacity
          style={styles.testBtn}
          onPress={() => void onSendTest()}
          disabled={testing || busy}
          accessibilityRole="button"
          accessibilityLabel="Send test notification"
        >
          {testing ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : (
            <Text style={styles.testBtnText}>Send test notification</Text>
          )}
        </TouchableOpacity>
      ) : null}
      {testStatus ? <Text style={styles.statusLine}>{testStatus}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}
