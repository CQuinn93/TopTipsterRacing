import type { MutableRefObject } from 'react';
import { Alert } from 'react-native';

import {
  clearDownstreamAntePostKnockoutData,
  type KnockoutDownstreamAnchor,
} from '@/features/wc2026/services/async-predictions';

function laterRoundsLabel(anchor: KnockoutDownstreamAnchor): string {
  switch (anchor) {
    case 'r32':
      return 'Round of 16, Quarter-finals, Semi-finals, Third place, and Final';
    case 'r16':
      return 'Quarter-finals, Semi-finals, Third place, and Final';
    case 'qf':
      return 'Semi-finals, Third place, and Final';
    case 'sf':
      return 'Third place and Final';
    case 'bronze':
      return 'the Final';
    default:
      return 'later rounds';
  }
}

/**
 * If the user has picks saved for rounds after `anchor`, first edit shows a destructive confirm,
 * clears downstream AsyncStorage, then runs `applyEdit`. Matches horse-racing style “changing earlier wipes later”.
 */
export function requestKnockoutEditWithDownstreamClear(
  anchor: KnockoutDownstreamAnchor,
  options: {
    selectionsGloballyLocked: boolean;
    downstreamClearConfirmedRef: MutableRefObject<boolean>;
    hasDownstreamPredictions: boolean;
    applyEdit: () => void;
    onDownstreamCleared?: () => void;
  }
): void {
  const {
    selectionsGloballyLocked,
    downstreamClearConfirmedRef,
    hasDownstreamPredictions,
    applyEdit,
    onDownstreamCleared,
  } = options;

  if (selectionsGloballyLocked) return;

  if (!hasDownstreamPredictions || downstreamClearConfirmedRef.current) {
    applyEdit();
    return;
  }

  const later = laterRoundsLabel(anchor);

  Alert.alert(
    'Change this round?',
    `You have saved picks for later knockout rounds. Continuing will remove all predictions for ${later}.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove later picks',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await clearDownstreamAntePostKnockoutData(anchor);
            downstreamClearConfirmedRef.current = true;
            onDownstreamCleared?.();
            applyEdit();
          })();
        },
      },
    ]
  );
}
