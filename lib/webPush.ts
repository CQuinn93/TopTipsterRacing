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
