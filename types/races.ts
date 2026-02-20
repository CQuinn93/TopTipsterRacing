/**
 * Result for a runner after a race (from update-race-results script / API).
 * Either position (numeric place) or resultCode (f/u/pu/ur etc) is set.
 */
export interface RaceResult {
  /** Numeric place 1,2,3... null when resultCode is set. */
  position: number | null;
  positionLabel?: 'won' | 'place' | 'lost';
  sp: number;
  /** Non-numeric finish: f (fall), u (unseated), pu (pulled up), ur, etc. */
  resultCode?: string;
}

/**
 * Race data shape (derived from races + horses tables).
 * Built by buildRacesFromTables / get_races_for_race_day. results from horses.position, horses.sp.
 */
export interface Race {
  id: string;
  name: string;
  scheduledTimeUtc: string;
  distance?: string;
  isHandicap?: boolean;
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
