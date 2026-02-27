/**
 * Shared app helpers used across screens. Centralise here when moving logic out of pages.
 */

export const POINTS_PER_ODDS = 10;

/** Position points when results are available (won/place/lost). Win 5, place 1; bonus from odds in sp_points. */
export const POSITION_POINTS = { won: 5, place: 1, lost: 0 } as const;

const SELECTION_CLOSE_HOURS_BEFORE_FIRST = 1;

export function getSelectionDeadlineMs(firstRaceUtc: string, hoursBefore = SELECTION_CLOSE_HOURS_BEFORE_FIRST): number {
  const first = new Date(firstRaceUtc).getTime();
  return first - hoursBefore * 60 * 60 * 1000;
}

export function isSelectionClosed(firstRaceUtc: string, hoursBefore = SELECTION_CLOSE_HOURS_BEFORE_FIRST): boolean {
  return Date.now() >= getSelectionDeadlineMs(firstRaceUtc, hoursBefore);
}

export function formatTimeUntilDeadline(firstRaceUtc: string): string {
  const deadlineMs = getSelectionDeadlineMs(firstRaceUtc);
  const left = deadlineMs - Date.now();
  if (left <= 0) return 'Closed';
  const hours = Math.floor(left / (60 * 60 * 1000));
  const mins = Math.floor((left % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${mins}m left`;
  if (mins > 0) return `${mins}m left`;
  return 'Closing soon';
}

export function formatDayDate(raceDate: string): string {
  const d = new Date(raceDate + 'T12:00:00');
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const date = d.getDate();
  const suffix = date === 1 || date === 21 || date === 31 ? 'st' : date === 2 || date === 22 ? 'nd' : date === 3 || date === 23 ? 'rd' : 'th';
  return `${day} ${date}${suffix}`;
}

export function getCompetitionDisplayStatus(
  startDate: string,
  endDate: string
): 'upcoming' | 'live' | 'complete' | null {
  const today = new Date().toISOString().slice(0, 10);
  if (today < startDate) return 'upcoming';
  if (today >= startDate && today <= endDate) return 'live';
  return 'complete';
}

export function isCompletedMoreThanOneDay(endDate: string): boolean {
  if (!endDate) return false;
  const end = new Date(endDate + 'T23:59:59').getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Date.now() > end + oneDayMs;
}

export function placeLabel(p?: 'won' | 'place' | 'lost'): string {
  return p === 'won' ? 'Won' : p === 'place' ? 'Place' : p === 'lost' ? 'Lost' : '—';
}
