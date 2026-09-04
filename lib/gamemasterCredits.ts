import type { ClubFootballMode, LeagueBillInput } from '@/lib/gamemasterCustomPricing';
import type { HubGameModeKey } from '@/lib/hubGameModes';
import { HUB_GAME_MODE_LABELS } from '@/lib/hubGameModes';

export type GamemasterCreateMode = HubGameModeKey;

export type GamemasterModeCredit = {
  mode: GamemasterCreateMode;
  label: string;
  quoted: number;
  used: number;
  remaining: number;
  quoteId: string | null;
};

/** Fallback labels if RPC omits them. */
export function creditLabel(mode: string): string {
  if (mode in HUB_GAME_MODE_LABELS) {
    return HUB_GAME_MODE_LABELS[mode as HubGameModeKey];
  }
  return mode;
}

export function totalCreateCreditsRemaining(credits: GamemasterModeCredit[]): number {
  return credits.reduce((sum, c) => sum + c.remaining, 0);
}

/** Map hub create mode → quote footballMode. */
export function footballModeForCreate(mode: GamemasterCreateMode): ClubFootballMode | null {
  if (mode === 'lms') return 'lms';
  if (mode === 'f2t') return 'tipster20';
  return null;
}

export function routeForCreateMode(mode: GamemasterCreateMode, quoteId: string): string {
  if (mode === 'lms') return `/(lms)?create=1&quoteId=${encodeURIComponent(quoteId)}`;
  if (mode === 'f2t') return `/(f2t)?create=1&quoteId=${encodeURIComponent(quoteId)}`;
  return '/gamemaster-hub';
}

/** @deprecated Prefer RPC credits; kept for typed payload helpers. */
export function quotedCount(payload: LeagueBillInput | null | undefined, footballMode: ClubFootballMode): number {
  const comps = payload?.competitions;
  if (!Array.isArray(comps)) return 0;
  return comps.filter((c) => c?.footballMode === footballMode).length;
}
