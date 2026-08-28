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

/** Order used in owner alert summaries. */
export const FPL_ALERT_STATUS_ORDER = ['i', 'd', 's', 'u', 'n'] as const;

/** Yellow haze for unavailable (left club / not in PL pool). */
export const FPL_UNAVAILABLE_CARD_HAZE = 'rgba(234, 179, 8, 0.16)';

export const FPL_UNAVAILABLE_STATUS_COLOR = '#eab308';

/** Card outline colours for owner FPL alert review (not used for unavailable). */
const FPL_ALERT_BORDER_COLORS: Record<string, string> = {
  i: '#ef4444',
  d: '#f97316',
  s: '#3b82f6',
};

const FPL_STATUS_ACCENT: Record<string, string> = {
  i: '#ef4444',
  d: '#f97316',
  s: '#3b82f6',
  u: '#eab308',
  n: '#a855f7',
};

export function fplIsUnavailable(statusCode: string | null | undefined): boolean {
  return statusCode?.toLowerCase() === 'u';
}

export function fplAlertBorderColor(statusCode: string | null | undefined): string | null {
  if (!statusCode || fplIsUnavailable(statusCode)) return null;
  return FPL_ALERT_BORDER_COLORS[statusCode.toLowerCase()] ?? null;
}

export function fplStatusAccentColor(statusCode: string | null | undefined): string {
  if (!statusCode) return '#94a3b8';
  return FPL_STATUS_ACCENT[statusCode.toLowerCase()] ?? '#94a3b8';
}

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

export type FplAlertStatusCount = {
  code: string;
  label: string;
  count: number;
  color: string;
};

export function summarizeFplAlertStatuses(
  players: Array<{ picker_stats?: Record<string, unknown> | null }>
): FplAlertStatusCount[] {
  const counts = new Map<string, number>();
  for (const p of players) {
    const code = formatFplAvailability(p.picker_stats).statusCode.toLowerCase() || 'a';
    const key = (FPL_ALERT_STATUS_ORDER as readonly string[]).includes(code)
      ? code
      : 'other';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const rows: FplAlertStatusCount[] = [];
  for (const code of FPL_ALERT_STATUS_ORDER) {
    const count = counts.get(code) ?? 0;
    if (count === 0) continue;
    rows.push({
      code,
      label: fplStatusLabel(code),
      count,
      color: fplStatusAccentColor(code),
    });
  }

  const other = counts.get('other') ?? 0;
  if (other > 0) {
    rows.push({
      code: 'other',
      label: 'Other / news',
      count: other,
      color: '#94a3b8',
    });
  }

  return rows;
}
