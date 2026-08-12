/**
 * Web Push for LMS deadline reminders (Home Screen / PWA).
 * Native builds use the no-op stub in webPush.native.ts.
 */
import { Platform } from 'react-native';

const impl =
  Platform.OS === 'web' ? require('./webPush.web') : require('./webPush.native');

export const getVapidPublicKey = impl.getVapidPublicKey as () => string | null;
export const isWebPushSupported = impl.isWebPushSupported as () => boolean;
export const isRunningAsInstalledWebApp = impl.isRunningAsInstalledWebApp as () => boolean;
export const getWebPushPermission = impl.getWebPushPermission as () =>
  | 'default'
  | 'denied'
  | 'granted'
  | 'unsupported';
export const ensureServiceWorker = impl.ensureServiceWorker as () => Promise<unknown>;
export const subscribeWebPush = impl.subscribeWebPush as (
  userId: string
) => Promise<{ ok: true } | { ok: false; error: string }>;
export const unsubscribeWebPush = impl.unsubscribeWebPush as (
  userId: string
) => Promise<{ ok: true } | { ok: false; error: string }>;
export const getActiveWebPushSubscription = impl.getActiveWebPushSubscription as () => Promise<{
  endpoint: string;
} | null>;

export async function sendWebPushTest(): Promise<{
  ok: boolean;
  error?: string;
  sent?: number;
  failed?: number;
  message?: string;
}> {
  if (Platform.OS !== 'web') {
    return { ok: false, error: 'Test push is only available in the Home Screen web app.' };
  }
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase.functions.invoke('notify-web-push-test', { body: {} });
  if (error) {
    return { ok: false, error: error.message || 'Could not call test notification function.' };
  }
  const row = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    message?: string;
    sent?: number;
    failed?: number;
    errors?: string[];
  };
  if (row.error === 'no_subscription') {
    return { ok: false, error: row.message || 'No push subscription saved yet.' };
  }
  if (row.error === 'VAPID keys not configured' || row.error?.includes('VAPID')) {
    return { ok: false, error: row.error };
  }
  if (typeof row.error === 'string' && row.ok !== true && !row.sent) {
    return { ok: false, error: row.error };
  }
  if (row.ok === true || (row.sent != null && row.sent > 0)) {
    return { ok: true, sent: row.sent, failed: row.failed };
  }
  const detail = row.errors?.[0] || row.message || row.error || 'Push send failed.';
  return { ok: false, error: detail, sent: row.sent, failed: row.failed };
}
