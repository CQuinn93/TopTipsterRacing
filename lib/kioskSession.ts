import AsyncStorage from '@react-native-async-storage/async-storage';

export type KioskSport = 'lms' | 'f2t' | 'racing';

export type KioskDeviceConfig = {
  version: 1;
  competitionId: string;
  sport: KioskSport;
  competitionName: string;
  joinCode: string;
  entryNote: string | null;
  fundraiserPaymentUrl: string | null;
  exitPinHash: string;
  staffUserId: string;
  staffUsername: string | null;
  activatedAt: string;
  /** Gamemaster club branding (optional for Owner accounts). */
  clubName?: string | null;
  clubLogoUrl?: string | null;
};

const STORAGE_KEY = 'toptipster.kiosk.device.v1';

export async function hashKioskPin(pin: string): Promise<string> {
  const payload = `toptipster-kiosk-v1:${pin}`;
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const data = new TextEncoder().encode(payload);
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for environments without SubtleCrypto
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv1a:${(h >>> 0).toString(16)}`;
}

export async function getKioskDeviceConfig(): Promise<KioskDeviceConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KioskDeviceConfig;
    if (!parsed || parsed.version !== 1 || !parsed.competitionId || !parsed.joinCode) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveKioskDeviceConfig(config: KioskDeviceConfig): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export async function clearKioskDeviceConfig(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function verifyKioskExitPin(pin: string): Promise<boolean> {
  const config = await getKioskDeviceConfig();
  if (!config) return false;
  const hash = await hashKioskPin(pin.trim());
  return hash === config.exitPinHash;
}

export function sportLabel(sport: KioskSport): string {
  switch (sport) {
    case 'lms':
      return 'LMS';
    case 'f2t':
      return 'Tipster20';
    case 'racing':
      return 'Top Tipster Racing';
    default:
      return sport;
  }
}

export function paymentMethodLabel(method: string | null | undefined): string {
  if (method === 'cash') return 'Cash at collection';
  if (method === 'online') return 'Paid online';
  return 'Payment not set';
}

/** App download / landing URL encoded in the hub QR. */
export function kioskAppLinkUrl(): string {
  const base = (process.env.EXPO_PUBLIC_WEB_BASE_URL ?? '').replace(/\/$/, '');
  return base || 'https://toptipster.app';
}
