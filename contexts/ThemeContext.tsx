import React, { createContext, useContext, useMemo } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from '@/constants/theme';

const ThemeContext = createContext<Theme | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const baseTheme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const theme = useMemo<Theme>(() => {
    if (Platform.OS !== 'web') return baseTheme;
    // Web tends to feel oversized compared with native; slightly tighten spacing.
    return {
      ...baseTheme,
      spacing: {
        xs: 3,
        sm: 7,
        md: 14,
        lg: 21,
        xl: 28,
        xxl: 42,
      },
    };
  }, [baseTheme]);

  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) return darkTheme;
  return ctx;
}
