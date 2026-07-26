import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { darkTheme, type Theme } from '@/constants/theme';

const ThemeContext = createContext<Theme | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always dark/black to match the sign-in screen (no system light mode).
  const theme = useMemo<Theme>(() => {
    if (Platform.OS !== 'web') return darkTheme;
    // Web tends to feel oversized compared with native; slightly tighten spacing.
    return {
      ...darkTheme,
      spacing: {
        xs: 3,
        sm: 7,
        md: 14,
        lg: 21,
        xl: 28,
        xxl: 42,
      },
    };
  }, []);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Override theme for a sport section (e.g. racing gold accent). */
export function NestedThemeProvider({
  theme,
  children,
}: {
  theme: Theme;
  children: ReactNode;
}) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) return darkTheme;
  return ctx;
}
