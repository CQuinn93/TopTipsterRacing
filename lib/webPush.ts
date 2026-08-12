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

  const TEST_TIMEOUT_MS = 15_000;

  try {
    const { supabase } = await import('@/lib/supabase');

    const invokePromise = supabase.functions.invoke('notify-web-push-test', { body: {} });
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            'Timed out after 15s. Is notify-web-push-test deployed? Check Edge Function logs in Supabase.'
          )
        );
      }, TEST_TIMEOUT_MS);
    });

    const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

    if (error) {
      // Prefer server JSON body when present (FunctionsHttpError)
      let detail = error.message || 'Could not call test notification function.';
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = (await ctx.json()) as { error?: string; message?: string };
          if (body?.error) detail = body.error;
          else if (body?.message) detail = body.message;
        }
      } catch {
        /* ignore parse failures */
      }
      if (/failed to send|404|not found|function/i.test(detail)) {
        detail = `${detail} — deploy with: supabase functions deploy notify-web-push-test`;
      }
      return { ok: false, error: detail };
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
    if (typeof row.error === 'string' && row.error.length > 0 && row.ok !== true && !(row.sent && row.sent > 0)) {
      return { ok: false, error: row.error };
    }
    if (row.ok === true || (row.sent != null && row.sent > 0)) {
      return { ok: true, sent: row.sent, failed: row.failed };
    }
    const detail = row.errors?.[0] || row.message || row.error || 'Push send failed.';
    return { ok: false, error: detail, sent: row.sent, failed: row.failed };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not send test notification.';
    return { ok: false, error: msg };
  }
}
