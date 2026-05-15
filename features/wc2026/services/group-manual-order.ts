import AsyncStorage from '@react-native-async-storage/async-storage';

import { WC2026_STORAGE_PREFIX } from '@/features/wc2026/constants/storage-keys';
import type { FinalGroupStanding } from '@/features/wc2026/services/group-standings';
import type { Match } from '@/features/wc2026/services/fixtures';
import type { Prediction } from '@/features/wc2026/services/predictions';
import {
  getDirectHeadToHeadOutcome,
  teamsDrewHeadToHead,
} from '@/features/wc2026/services/tiebreakers';

const GROUP_MANUAL_ORDER_KEY = `${WC2026_STORAGE_PREFIX}group_manual_order`;

/** Per group (A–L): team IDs in order from 1st to 4th. */
export type GroupManualOrder = Record<string, string[]>;

export type GroupReorderContext = {
  standingsById: Map<string, FinalGroupStanding>;
  fixtures: Match[];
  predictions: Record<string, Prediction>;
};

export function buildGroupReorderContext(
  standings: FinalGroupStanding[],
  fixtures: Match[],
  predictions: Record<string, Prediction>
): GroupReorderContext {
  return {
    standingsById: new Map(standings.map((s) => [s.teamId, s])),
    fixtures,
    predictions,
  };
}

/** User may reorder only when points, GD match and the direct fixture was a draw. */
export function canUserReorderPair(
  teamAId: string,
  teamBId: string,
  ctx: GroupReorderContext
): boolean {
  const a = ctx.standingsById.get(teamAId);
  const b = ctx.standingsById.get(teamBId);
  if (!a || !b) return false;
  if (a.points !== b.points) return false;
  if (a.goalDifference !== b.goalDifference) return false;
  return teamsDrewHeadToHead(teamAId, teamBId, ctx.fixtures, ctx.predictions);
}

export async function loadGroupManualOrder(): Promise<GroupManualOrder> {
  try {
    const raw = await AsyncStorage.getItem(GROUP_MANUAL_ORDER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as GroupManualOrder;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveGroupManualOrder(order: GroupManualOrder): Promise<void> {
  await AsyncStorage.setItem(GROUP_MANUAL_ORDER_KEY, JSON.stringify(order));
}

export function isValidManualOrderForStandings(
  teamIds: string[],
  standings: FinalGroupStanding[],
  fixtures: Match[],
  predictions: Record<string, Prediction>
): boolean {
  if (teamIds.length !== standings.length) return false;
  const byId = new Map(standings.map((s) => [s.teamId, s]));
  if (!teamIds.every((id) => byId.has(id))) return false;

  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const aboveId = teamIds[i];
      const belowId = teamIds[j];
      const above = byId.get(aboveId)!;
      const below = byId.get(belowId)!;

      if (above.points < below.points) return false;
      if (above.points === below.points && above.goalDifference < below.goalDifference) {
        return false;
      }

      const h2h = getDirectHeadToHeadOutcome(aboveId, belowId, fixtures, predictions);
      if (h2h === 'team_b') return false;
    }
  }
  return true;
}

export function applyManualOrderToStandings(
  autoStandings: FinalGroupStanding[],
  manualOrder: string[] | undefined,
  fixtures: Match[],
  predictions: Record<string, Prediction>
): FinalGroupStanding[] {
  if (!manualOrder?.length || manualOrder.length !== autoStandings.length) {
    return autoStandings;
  }
  if (!isValidManualOrderForStandings(manualOrder, autoStandings, fixtures, predictions)) {
    return autoStandings;
  }

  const byId = new Map(autoStandings.map((s) => [s.teamId, s]));
  return manualOrder.map((teamId, idx) => ({
    ...byId.get(teamId)!,
    position: idx + 1,
    groupName: autoStandings[0]?.groupName ?? byId.get(teamId)!.groupName,
  }));
}

export function applyManualOrderToAllGroups(
  allStandings: Record<string, FinalGroupStanding[]>,
  manualOrder: GroupManualOrder,
  allFixtures: Match[],
  predictions: Record<string, Prediction>
): Record<string, FinalGroupStanding[]> {
  const out: Record<string, FinalGroupStanding[]> = {};
  for (const [groupName, standings] of Object.entries(allStandings)) {
    const groupFixtures = allFixtures.filter((f) => f.group?.group_name === groupName);
    out[groupName] = applyManualOrderToStandings(
      standings,
      manualOrder[groupName],
      groupFixtures,
      predictions
    );
  }
  return out;
}

export function canSwapWithNeighbor(
  teamId: string,
  direction: 'up' | 'down',
  orderedTeamIds: string[],
  ctx: GroupReorderContext
): boolean {
  const idx = orderedTeamIds.indexOf(teamId);
  if (idx < 0) return false;
  const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= orderedTeamIds.length) return false;
  return canUserReorderPair(teamId, orderedTeamIds[neighborIdx], ctx);
}

export function swapAdjacentInGroupOrder(
  orderedTeamIds: string[],
  teamId: string,
  direction: 'up' | 'down',
  ctx: GroupReorderContext
): string[] | null {
  if (!canSwapWithNeighbor(teamId, direction, orderedTeamIds, ctx)) {
    return null;
  }
  const idx = orderedTeamIds.indexOf(teamId);
  const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
  const next = [...orderedTeamIds];
  [next[idx], next[neighborIdx]] = [next[neighborIdx], next[idx]];
  return next;
}

/** True when at least one pair can be settled by the user (same pts + GD, H2H draw). */
export function groupHasUserResolvableTie(
  standings: FinalGroupStanding[],
  fixtures: Match[],
  predictions: Record<string, Prediction>
): boolean {
  const ctx = buildGroupReorderContext(standings, fixtures, predictions);
  for (let i = 0; i < standings.length; i++) {
    for (let j = i + 1; j < standings.length; j++) {
      if (canUserReorderPair(standings[i].teamId, standings[j].teamId, ctx)) {
        return true;
      }
    }
  }
  return false;
}
