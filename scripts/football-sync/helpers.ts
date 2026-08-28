/**
 * Shared helpers for F2T football sync scripts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const FPL_API_BASE = 'https://fantasy.premierleague.com/api';
export const BBS_API_BASE = 'https://api.bigballsdata.com/v1';
export const DEFAULT_SEASON = '2026/27';

export type LmsTeamRow = {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  external_id: number | null;
};

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeName(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Map BBS / FPL labels to GK | DEF | MID | FWD. */
export function normalizeFootballPosition(
  raw: string | null | undefined,
  fplElementType?: number | null
): string | null {
  if (fplElementType != null) {
    const fromFpl: Record<number, string> = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
    const mapped = fromFpl[fplElementType];
    if (mapped) return mapped;
  }
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'gk' || s.startsWith('goal')) return 'GK';
  if (s === 'def' || s.startsWith('def')) return 'DEF';
  if (s === 'mid' || s.startsWith('mid')) return 'MID';
  if (s === 'fwd' || s.startsWith('for') || s.startsWith('att') || s.startsWith('strik')) {
    return 'FWD';
  }
  return null;
}

export async function loadLmsTeams(supabase: SupabaseClient): Promise<LmsTeamRow[]> {
  const { data, error } = await supabase
    .from('lms_teams')
    .select('id, name, short_name, slug, external_id');
  if (error) throw error;
  return (data ?? []) as LmsTeamRow[];
}

export function matchLmsTeam(
  teams: LmsTeamRow[],
  name: string,
  shortName?: string | null
): LmsTeamRow | undefined {
  const n = normalizeName(name);
  const sn = shortName ? normalizeName(shortName) : '';
  return teams.find(
    (t) =>
      normalizeName(t.name) === n ||
      normalizeName(t.short_name) === sn ||
      t.slug === slugify(name) ||
      (shortName && t.slug === slugify(shortName))
  );
}

export async function bbsGet<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${BBS_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Big Balls ${path}: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

type BbsListPayload<T> = {
  data?: T[];
  pagination?: { total?: number; limit?: number; offset?: number };
};

/** Fetch all rows from a list endpoint (API max is typically 100 per page). */
export async function bbsListAll<T>(
  pathWithQuery: string,
  apiKey: string,
  pageSize = 100
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;

  for (let page = 0; page < 30; page++) {
    const sep = pathWithQuery.includes('?') ? '&' : '?';
    const path = `${pathWithQuery}${sep}limit=${pageSize}&offset=${offset}`;
    const payload = await bbsGet<BbsListPayload<T>>(path, apiKey);
    const batch = payload.data ?? [];
    if (batch.length === 0) break;
    out.push(...batch);

    const total = payload.pagination?.total;
    if (total != null && out.length >= total) break;
    if (batch.length < pageSize) break;
    offset += batch.length;
  }

  return out;
}

export async function fplGet<T>(path: string): Promise<T> {
  const res = await fetch(`${FPL_API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`FPL ${path}: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}
