import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from '@/constants/theme';

const ThemeContext = createContext<Theme | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;

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
