/**
 * Shared helpers for F2T football sync scripts.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const FPL_API_BASE = 'https://fantasy.premierleague.com/api';
export const BBS_API_BASE = 'https://api.bigballsdata.com/v4';
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
