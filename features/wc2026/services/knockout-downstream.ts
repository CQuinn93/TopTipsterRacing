import type { KnockoutDownstreamAnchor } from '@/features/wc2026/services/async-predictions';
import { clearDownstreamAntePostKnockoutData } from '@/features/wc2026/services/async-predictions';
import { deleteAntePostPredictionsForMatchNumbers } from '@/features/wc2026/services/predictions';

/** Ante-post match numbers cleared when an earlier knockout result changes. */
export function downstreamMatchNumbersAfter(anchor: KnockoutDownstreamAnchor): number[] {
  switch (anchor) {
    case 'r32':
      return range(89, 104);
    case 'r16':
      return range(97, 104);
    case 'qf':
      return range(101, 104);
    case 'sf':
      return [103, 104];
    case 'bronze':
      return [104];
    default:
      return [];
  }
}

function range(min: number, max: number): number[] {
  const out: number[] = [];
  for (let n = min; n <= max; n++) out.push(n);
  return out;
}

/** Clear local brackets/picks and server rows for all rounds after `anchor`. */
export async function clearDownstreamKnockoutCompletely(
  anchor: KnockoutDownstreamAnchor,
  userId: string | null
): Promise<void> {
  await clearDownstreamAntePostKnockoutData(anchor);
  if (userId) {
    await deleteAntePostPredictionsForMatchNumbers(userId, downstreamMatchNumbersAfter(anchor));
  }
}
