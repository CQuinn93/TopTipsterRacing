import { Platform, useWindowDimensions } from 'react-native';

/** Same breakpoint as `app/(app)/index.tsx` compact home layout. */
export const NARROW_WEB_MAX_WIDTH = 768;

/**
 * `true` when running on web and viewport width is below {@link NARROW_WEB_MAX_WIDTH}
 * (typical phone browser / narrow window).
 */
export function useNarrowWebCompact(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width < NARROW_WEB_MAX_WIDTH;
}

/**
 * Compact font size on narrow web to match the Home screen scale.
 * Non-compact paths return `size` unchanged.
 */
export function cfs(size: number, compact: boolean): number {
  if (!compact) return size;
  switch (size) {
    case 26:
      return 22;
    case 22:
      return 18;
    case 20:
      return 18;
    case 18:
      return 16;
    case 17:
      return 15;
    case 16:
      return 14;
    case 15:
      return 13;
    case 14:
      return 13;
    case 13:
      return 11;
    case 12:
      return 11;
    case 11:
      return 10;
    case 10:
      return 9;
    default:
      if (size >= 22) return Math.max(13, size - 4);
      if (size >= 17) return Math.max(12, size - 2);
      if (size >= 14) return Math.max(11, size - 2);
      if (size >= 12) return Math.max(10, size - 1);
      return Math.max(9, size - 1);
  }
}
