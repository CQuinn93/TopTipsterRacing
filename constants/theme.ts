/**
 * Theme: black, white, greys, green only.
 * Font: Roundex (loaded in _layout).
 * Supports light and dark mode based on system preference.
 */

const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

const fontFamily = {
  regular: 'Roundex',
  input: 'Arial, Helvetica, sans-serif',
  polygon: 'Polygon-Regular',
  polygonItalic: 'Polygon-Italic',
} as const;

export const darkTheme = {
  colors: {
    background: '#0a0a0a',
    surface: '#141414',
    surfaceElevated: '#1a1a1a',
    border: '#2a2a2a',
    borderLight: '#333',
    text: '#fafafa',
    textSecondary: '#a3a3a3',
    textMuted: '#737373',
    accent: '#15803d',
    accentDim: '#166534',
    accentMuted: 'rgba(21, 128, 61, 0.2)',
    error: '#ef4444',
    white: '#ffffff',
    black: '#000000',
    barAccent: '#a855f7',
    statusAccent: '#eab308',
  },
  spacing,
  radius,
  fontFamily,
} as const;

export const lightTheme = {
  colors: {
    background: '#fafafa',
    surface: '#f0f0f0',
    surfaceElevated: '#e5e5e5',
    border: '#d4d4d4',
    borderLight: '#a3a3a3',
    text: '#171717',
    textSecondary: '#525252',
    textMuted: '#737373',
    accent: '#15803d',
    accentDim: '#166534',
    accentMuted: 'rgba(21, 128, 61, 0.25)',
    error: '#dc2626',
    white: '#ffffff',
    black: '#000000',
    barAccent: '#7c3aed',
    statusAccent: '#ca8a04',
  },
  spacing,
  radius,
  fontFamily,
} as const;

export type Theme = typeof darkTheme;

/** @deprecated Use useTheme() from ThemeContext for light/dark support. */
export const theme = darkTheme;
