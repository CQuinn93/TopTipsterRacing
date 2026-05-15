/** Green “filled” highlights are for active editing — hide when ante post is locked in. */
export function showAntePostFilledHighlight(hasContent: boolean, isLocked: boolean): boolean {
  return hasContent && !isLocked;
}
