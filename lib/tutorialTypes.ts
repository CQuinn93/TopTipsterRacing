/** JSON shape from `tutorial_get_data` RPC (migration 044). */

export type TutorialRunnerJson = {
  id: string;
  name: string;
  number?: number | null;
  jockey?: string | null;
  oddsDecimal?: number | string | null;
  isFav?: boolean;
  position?: number | null;
  resultCode?: string | null;
};

export type TutorialRaceJson = {
  id: string;
  sortOrder: number;
  raceName: string;
  startsAfterMinutes: number;
  runners?: TutorialRunnerJson[];
};

export type TutorialBotJson = {
  id: string;
  displayName: string;
  avatarColor?: string | null;
};

export type TutorialBotSelectionJson = {
  botUserId: string;
  raceId: string;
  runnerId: string;
  runnerName: string;
  oddsDecimal?: number | string | null;
};

export type TutorialGetDataPayload = {
  success?: boolean;
  error?: string;
  meeting?: {
    id: string;
    slug: string;
    title: string;
    subtitle?: string;
    demoAccessCode?: string;
  };
  races?: TutorialRaceJson[];
  bots?: TutorialBotJson[];
  botSelections?: TutorialBotSelectionJson[];
};
