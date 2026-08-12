/** Native: Web Push is browser-only. */
export function getVapidPublicKey(): string | null {
  return null;
}

export function isWebPushSupported(): boolean {
  return false;
}

export function isRunningAsInstalledWebApp(): boolean {
  return false;
}

export function getWebPushPermission(): 'unsupported' {
  return 'unsupported';
}

export async function ensureServiceWorker(): Promise<null> {
  return null;
}

export async function subscribeWebPush(
  _userId: string
): Promise<{ ok: false; error: string }> {
  return { ok: false, error: 'Web push is only available in the browser Home Screen app.' };
}

export async function unsubscribeWebPush(
  _userId: string
): Promise<{ ok: true }> {
  return { ok: true };
}

export async function getActiveWebPushSubscription(): Promise<null> {
  return null;
}

export async function sendWebPushTest(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: 'Test push is only available in the browser Home Screen app.' };
}
