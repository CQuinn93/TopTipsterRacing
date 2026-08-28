export type FplPickerStats = {
  news?: string;
  fpl_status?: string;
  chance_of_playing_this_round?: number | null;
  chance_of_playing_next_round?: number | null;
  news_added?: string | null;
};

const FPL_STATUS_LABELS: Record<string, string> = {
  a: 'Available',
  d: 'Doubtful',
  i: 'Injured',
  s: 'Suspended',
  u: 'Unavailable',
  n: 'Not in squad',
};

export function fplStatusLabel(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  return FPL_STATUS_LABELS[code] ?? code.toUpperCase();
}

export function formatFplAvailability(stats: Record<string, unknown> | null | undefined) {
  const s = (stats ?? {}) as FplPickerStats;
  const statusCode = typeof s.fpl_status === 'string' ? s.fpl_status : 'a';
  const news = typeof s.news === 'string' ? s.news.trim() : '';
  const chanceThis =
    typeof s.chance_of_playing_this_round === 'number' ? s.chance_of_playing_this_round : null;
  const chanceNext =
    typeof s.chance_of_playing_next_round === 'number' ? s.chance_of_playing_next_round : null;

  const chanceParts: string[] = [];
  if (chanceThis != null && chanceThis < 100) {
    chanceParts.push(`${chanceThis}% this GW`);
  }
  if (chanceNext != null && chanceNext < 100) {
    chanceParts.push(`${chanceNext}% next GW`);
  }

  return {
    statusCode,
    statusLabel: fplStatusLabel(statusCode),
    news,
    chanceSummary: chanceParts.join(' · '),
  };
}
