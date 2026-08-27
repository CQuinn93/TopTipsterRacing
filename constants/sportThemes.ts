import { darkTheme, type Theme } from '@/constants/theme';

/** Hub Racing tab gold — used as the racing app accent. */
export const RACING_ACCENT = '#c4a35a';
export const RACING_ACCENT_DIM = '#9a7b2f';
export const RACING_ACCENT_MUTED = 'rgba(196, 163, 90, 0.22)';

export function withRacingAccent(base: Theme = darkTheme): Theme {
  return {
    ...base,
    colors: {
      ...base.colors,
      accent: RACING_ACCENT,
      accentDim: RACING_ACCENT_DIM,
      accentMuted: RACING_ACCENT_MUTED,
      statusAccent: RACING_ACCENT,
    },
  };
}

/**
 * Racing sport theme: keep gold accent, but use Bai Jamjuree as the default
 * type stack so the in-app chrome matches Last Man Standing.
 */
export function withRacingUi(base: Theme = darkTheme): Theme {
  const accented = withRacingAccent(base);
  return {
    ...accented,
    fontFamily: {
      ...accented.fontFamily,
      regular: accented.fontFamily.bai,
      light: accented.fontFamily.baiLight,
    },
  };
}
