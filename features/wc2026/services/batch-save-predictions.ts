// Batch save ante post predictions to wc2026.predictions (group by match_id, knockouts by match_number).
// Called only when user submits final ante post selections

import { upsertPrediction, upsertPredictionByMatchNumber } from './predictions';
import { getAllAntePostPredictions, clearAllAntePostPredictions } from './async-predictions';

export interface BatchSaveResult {
  success: boolean;
  savedCount: number;
  error?: string;
}

export type BatchSaveAntePostOptions = {
  /** When true (default), clears AsyncStorage ante keys after a fully successful save — use false between knockout rounds. */
  clearLocal?: boolean;
};

/**
 * Save all ante post predictions to database in one batch operation (group + every knockout round from AsyncStorage).
 */
export const batchSaveAllAntePostPredictions = async (
  userId: string,
  opts?: BatchSaveAntePostOptions
): Promise<BatchSaveResult> => {
  const clearLocal = opts?.clearLocal !== false;
  try {
    // Get all predictions from AsyncStorage
    const allPredictions = await getAllAntePostPredictions();

    let savedCount = 0;
    const errors: string[] = [];

    const formatSaveError = (label: string, error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`Error saving ${label}:`, error);
      return `${label}: ${detail}`;
    };

    // Save group stage predictions (use match_id)
    const groupPromises = Object.values(allPredictions.group).map(async (pred) => {
      try {
        await upsertPrediction(
          userId,
          pred.match_id,
          'ante_post',
          pred.home_score,
          pred.away_score,
          null
        );
        savedCount++;
      } catch (error) {
        errors.push(formatSaveError(`Group match ${pred.match_id}`, error));
      }
    });

    // Save Round of 32 predictions (use match_number)
    const r32Promises = Object.values(allPredictions.r32).map(async (pred) => {
      try {
        await upsertPredictionByMatchNumber(
          userId,
          pred.match_number,
          'ante_post',
          pred.home_score,
          pred.away_score,
          pred.predicted_winner_id,
          null // match_id is null for knockout matches
        );
        savedCount++;
      } catch (error) {
        errors.push(formatSaveError(`R32 match ${pred.match_number}`, error));
      }
    });

    // Save Round of 16 predictions (use match_number)
    const r16Promises = Object.values(allPredictions.r16).map(async (pred) => {
      try {
        await upsertPredictionByMatchNumber(
          userId,
          pred.match_number,
          'ante_post',
          pred.home_score,
          pred.away_score,
          pred.predicted_winner_id,
          null
        );
        savedCount++;
      } catch (error) {
        errors.push(formatSaveError(`R16 match ${pred.match_number}`, error));
      }
    });

    // Save Quarter Finals predictions (use match_number)
    const qfPromises = Object.values(allPredictions.qf).map(async (pred) => {
      try {
        await upsertPredictionByMatchNumber(
          userId,
          pred.match_number,
          'ante_post',
          pred.home_score,
          pred.away_score,
          pred.predicted_winner_id,
          null
        );
        savedCount++;
      } catch (error) {
        errors.push(formatSaveError(`QF match ${pred.match_number}`, error));
      }
    });

    // Save Semi Finals predictions (use match_number)
    const sfPromises = Object.values(allPredictions.sf).map(async (pred) => {
      try {
        await upsertPredictionByMatchNumber(
          userId,
          pred.match_number,
          'ante_post',
          pred.home_score,
          pred.away_score,
          pred.predicted_winner_id,
          null
        );
        savedCount++;
      } catch (error) {
        errors.push(formatSaveError(`SF match ${pred.match_number}`, error));
      }
    });

    // Save Bronze Final predictions (use match_number)
    const bronzePromises = Object.values(allPredictions.bronzeFinal).map(async (pred) => {
      try {
        await upsertPredictionByMatchNumber(
          userId,
          pred.match_number,
          'ante_post',
          pred.home_score,
          pred.away_score,
          pred.predicted_winner_id,
          null
        );
        savedCount++;
      } catch (error) {
        errors.push(formatSaveError(`Bronze Final match ${pred.match_number}`, error));
      }
    });

    // Save Final predictions (use match_number)
    const finalPromises = Object.values(allPredictions.final).map(async (pred) => {
      try {
        await upsertPredictionByMatchNumber(
          userId,
          pred.match_number,
          'ante_post',
          pred.home_score,
          pred.away_score,
          pred.predicted_winner_id,
          null
        );
        savedCount++;
      } catch (error) {
        errors.push(formatSaveError(`Final match ${pred.match_number}`, error));
      }
    });

    // Wait for all saves to complete
    await Promise.all([
      ...groupPromises,
      ...r32Promises,
      ...r16Promises,
      ...qfPromises,
      ...sfPromises,
      ...bronzePromises,
      ...finalPromises,
    ]);

    // If there were errors, log them but don't fail completely
    if (errors.length > 0) {
      console.warn(`Some predictions failed to save: ${errors.join(' | ')}`);
    }

    if (errors.length === 0 && clearLocal) {
      await clearAllAntePostPredictions();
    }

    return {
      success: errors.length === 0,
      savedCount,
      error:
        errors.length > 0
          ? errors.slice(0, 3).join('\n') + (errors.length > 3 ? `\n…and ${errors.length - 3} more.` : '')
          : undefined,
    };
  } catch (error) {
    console.error('Error in batch save:', error);
    return {
      success: false,
      savedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
