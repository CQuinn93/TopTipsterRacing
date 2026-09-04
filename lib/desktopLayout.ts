/** Shared desktop / large-screen layout tokens for hub screens. */

export const DESKTOP_BREAKPOINT = 900;
export const COMPACT_BREAKPOINT = 420;

/** Centered app stage on large screens (not full-bleed cards). */
export const DESKTOP_STAGE_MAX = 1200;

/** Readable form width inside the stage (promote / quote builders). */
export const DESKTOP_FORM_MAX = 680;

/** Left rail for list | detail admin panes. */
export const DESKTOP_SIDE_RAIL = 320;

export const DESKTOP_COLUMN_GAP = 16;

export function isDesktopWidth(width: number): boolean {
  return width >= DESKTOP_BREAKPOINT;
}

export function isCompactSize(width: number, height: number): boolean {
  return width < COMPACT_BREAKPOINT || height < 640;
}

export function desktopHorizontalPad(spacing: {
  md: number;
  lg: number;
  xxl: number;
}, width: number, height: number): number {
  if (isCompactSize(width, height)) return spacing.md;
  if (isDesktopWidth(width)) return spacing.xxl;
  return spacing.lg;
}
