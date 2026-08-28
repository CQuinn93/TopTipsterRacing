import type { F2tSelectablePlayer } from '@/lib/f2t/api';

/** In-memory cache for selectable players (10 min TTL). */
const TTL_MS = 10 * 60 * 1000;

type Entry = {
  fetchedAt: number;
  players: F2tSelectablePlayer[];
};

const byCompetitionId = new Map<string, Entry>();

export function f2tSessionGetPlayers(competitionId: string): F2tSelectablePlayer[] | null {
  const row = byCompetitionId.get(competitionId);
  if (!row) return null;
  if (Date.now() - row.fetchedAt >= TTL_MS) {
    byCompetitionId.delete(competitionId);
    return null;
  }
  return row.players;
}

export function f2tSessionSetPlayers(competitionId: string, players: F2tSelectablePlayer[]): void {
  byCompetitionId.set(competitionId, { fetchedAt: Date.now(), players });
}

export function f2tSessionInvalidatePlayers(competitionId?: string): void {
  if (competitionId) byCompetitionId.delete(competitionId);
  else byCompetitionId.clear();
}
