/**
 * Theme: black, white, greys, green only.
 * Font: Roundex (loaded in _layout).
 */
export const theme = {
  colors: {
    background: '#0a0a0a', //black 10%
    surface: '#141414', //black 20%
    surfaceElevated: '#1a1a1a', //black 30%
    border: '#2a2a2a', //grey 15%
    borderLight: '#333', //grey 20%
    text: '#fafafa', //white 100%
    textSecondary: '#a3a3a3', //grey 65%
    textMuted: '#737373', //grey 45%
    accent: '#22c55e', //green 100%
    accentDim: '#16a34a', //green 10%
    accentMuted: 'rgba(34, 197, 94, 0.2)', //green 20%
    error: '#ef4444', //red 100%
    white: '#ffffff', //white 100%
    black: '#000000', //black 100%
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
    full: 9999,
  },
  fontFamily: {
    regular: 'Roundex',
    /** Use Arial for text inputs so special characters display correctly. */
    input: 'Arial, Helvetica, sans-serif',
  },
} as const;

export type Theme = typeof theme;
