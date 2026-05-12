import type { Prediction } from '@/features/wc2026/services/predictions';

export type WcStageId = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'bronze' | 'final';

/** WC2026 numbering used in app services (group 1–72, knockouts 73–104). */
export const WC_STAGE_SLICES: { id: WcStageId; label: string; min: number; max: number }[] = [
  { id: 'group', label: 'Group stage', min: 1, max: 72 },
  { id: 'r32', label: 'Round of 32', min: 73, max: 88 },
  { id: 'r16', label: 'Round of 16', min: 89, max: 96 },
  { id: 'qf', label: 'Quarter-finals', min: 97, max: 100 },
  { id: 'sf', label: 'Semi-finals', min: 101, max: 102 },
  { id: 'bronze', label: '3rd place final', min: 103, max: 103 },
  { id: 'final', label: 'Final', min: 104, max: 104 },
];

export function stageIdForMatchNumber(matchNumber: number | null): WcStageId | null {
  if (matchNumber == null) return null;
  const s = WC_STAGE_SLICES.find((x) => matchNumber >= x.min && matchNumber <= x.max);
  return s?.id ?? null;
}

export function sumPointsInRange(
  preds: Prediction[],
  predictionType: 'ante_post' | 'live',
  min: number,
  max: number,
  opts?: { liveMustHaveTip?: boolean }
): { rows: number; points: number } {
  let rows = 0;
  let points = 0;
  const needTip = opts?.liveMustHaveTip ?? false;
  for (const p of preds) {
    if (p.prediction_type !== predictionType) continue;
    const mn = p.match_number;
    if (mn == null || mn < min || mn > max) continue;
    if (needTip && predictionType === 'live') {
      const hasTip = p.live_outcome === 'H' || p.live_outcome === 'D' || p.live_outcome === 'A';
      if (!hasTip) continue;
    }
    rows++;
    points += p.points_awarded ?? 0;
  }
  return { rows, points };
}
