import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 'system' = follow device setting, 'light'/'dark' = manual override
const THEME_MODE_KEY = '@creature_archive_theme_mode';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeColors {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  accent: string;
  accentLight: string;
}

interface ThemeContextValue {
  isDarkMode: boolean;
  themeMode: ThemeMode;
  toggleDarkMode: (value: boolean) => void;
  setThemeMode: (mode: ThemeMode) => void;
  theme: ThemeColors;
}

const getTheme = (isDark: boolean): ThemeColors => ({
  background: isDark ? '#0F172A' : '#F8FAFC',
  card: isDark ? '#1E293B' : '#FFFFFF',
  text: isDark ? '#F1F5F9' : '#111827',
  textSecondary: isDark ? '#94A3B8' : '#6B7280',
  border: isDark ? '#334155' : '#F3F4F6',
  accent: '#1B4D3E',
  accentLight: isDark ? '#1E3A2F' : '#ECFDF5',
});

const ThemeContext = createContext<ThemeContextValue>({
  isDarkMode: false,
  themeMode: 'system',
  toggleDarkMode: () => {},
  setThemeMode: () => {},
  theme: getTheme(false),
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load saved preference on mount
  useEffect(() => {
    AsyncStorage.getItem(THEME_MODE_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeModeState(saved);
      }
      setIsLoaded(true);
    }).catch(() => setIsLoaded(true));
  }, []);

  // Resolve the effective dark mode value
  const isDarkMode = themeMode === 'system'
    ? systemScheme === 'dark'
    : themeMode === 'dark';

  // Toggle switch: sets explicit light/dark override
  const toggleDarkMode = (value: boolean) => {
    const mode: ThemeMode = value ? 'dark' : 'light';
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_MODE_KEY, mode).catch(() => {});
  };

  // Set mode directly (for a future "follow system" option)
  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_MODE_KEY, mode).catch(() => {});
  };

  const theme = getTheme(isDarkMode);

  return (
    <ThemeContext.Provider value={{ isDarkMode, themeMode, toggleDarkMode, setThemeMode, theme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

export default ThemeContext;
