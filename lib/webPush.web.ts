import { supabase } from '@/lib/supabase';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

type Db = typeof supabase & {
  from: (table: string) => ReturnType<typeof supabase.from>;
};

function db() {
  return supabase as unknown as {
    from: (table: 'web_push_subscriptions') => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string }
      ) => Promise<{ error: { message: string } | null }>;
      delete: () => {
        eq: (col: string, val: string) => {
          eq: (col2: string, val2: string) => Promise<{ error: { message: string } | null }>;
          then?: unknown;
        } & PromiseLike<{ error: { message: string } | null }>;
      };
    };
  };
}

export function getVapidPublicKey(): string | null {
  const key = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  return key || null;
}

export function isRunningAsInstalledWebApp(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)');
  if (mq?.matches) return true;
  return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getWebPushPermission(): NotificationPermission | 'unsupported' {
  if (!isWebPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;
  const base = (process.env.EXPO_PUBLIC_WEB_BASE_URL ?? '').replace(/\/$/, '');
  const swUrl = `${base || ''}/sw.js`;
  const scope = base ? `${base}/` : '/';
  return navigator.serviceWorker.register(swUrl, { scope });
}

export async function getActiveWebPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  await ensureServiceWorker();
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function subscribeWebPush(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!userId) return { ok: false, error: 'Not signed in.' };
  if (!isWebPushSupported()) {
    return { ok: false, error: 'This browser does not support notifications.' };
  }
  if (!isRunningAsInstalledWebApp()) {
    return {
      ok: false,
      error:
        'Add Top Tipster to your Home Screen, open it from there, then enable notifications.',
    };
  }
  const vapid = getVapidPublicKey();
  if (!vapid) {
    return { ok: false, error: 'Notifications are not configured on this build yet.' };
  }

  try {
    const reg = await ensureServiceWorker();
    if (!reg) return { ok: false, error: 'Could not register the notification service.' };

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, error: 'Notification permission was not granted.' };
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
      });
    }

    const json = sub.toJSON();
    const endpoint = json.endpoint;
    const p256dh = json.keys?.p256dh;
    const auth = json.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return { ok: false, error: 'Invalid push subscription from the browser.' };
    }

    await (supabase as any)
      .from('web_push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .neq('endpoint', endpoint);

    const { error } = await (supabase as any).from('web_push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not enable notifications.';
    return { ok: false, error: msg };
  }
}

export async function unsubscribeWebPush(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sub = await getActiveWebPushSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      if (userId && endpoint) {
        await (supabase as any)
          .from('web_push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', endpoint);
      }
    } else if (userId) {
      await (supabase as any).from('web_push_subscriptions').delete().eq('user_id', userId);
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not disable notifications.';
    return { ok: false, error: msg };
  }
}
