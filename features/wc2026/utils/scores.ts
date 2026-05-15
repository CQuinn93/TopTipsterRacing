/** Normalize score values from inputs, AsyncStorage, or Supabase (may arrive as strings on web). */
export function coerceScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

export function isCompleteScorePair(home: unknown, away: unknown): boolean {
  return coerceScore(home) !== null && coerceScore(away) !== null;
}
