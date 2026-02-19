/**
 * Result for a runner after a race (from update-race-results script / API).
 */
export interface RaceResult {
  position: number;
  positionLabel: 'won' | 'place' | 'lost';
  sp: number;
}

/**
 * Race data shape (populated by daily API pull / GitHub Actions).
 * Stored in race_days.races and referenced when making selections.
 * results is filled by update-race-results script after the race has been run.
 */
export interface Race {
  id: string;
  name: string;
  scheduledTimeUtc: string;
  distance?: string;
  runners: Runner[];
  /** Runner id -> result (position, sp). Set by update-race-results. */
  results?: Record<string, RaceResult>;
}

export interface Runner {
  id: string;
  name: string;
  oddsDecimal: number;
  number?: number;
}

/**
 * User selection per race (stored in daily_selections.selections).
 */
export interface RaceSelection {
  raceId: string;
  runnerId: string;
  runnerName: string;
  oddsDecimal: number;
}

export type DailySelectionsPayload = Record<string, RaceSelection>;
