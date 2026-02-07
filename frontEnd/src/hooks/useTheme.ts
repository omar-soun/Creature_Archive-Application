/**
 * useTheme Hook
 *
 * Manages the application theme (Light/Dark mode).
 * Persists user preference using AsyncStorage.
 */

import { useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_STORAGE_KEY = '@app_theme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeHook {
    isDarkMode: boolean;
    toggleTheme: () => void;
    themeMode: ThemeMode;
}

export const useTheme = (): ThemeHook => {
    const systemScheme = useColorScheme();
    const [themeMode, setThemeMode] = useState<ThemeMode>('system');
    const [isDarkMode, setIsDarkMode] = useState<boolean>(systemScheme === 'dark');

    // Load saved theme on mount
    useEffect(() => {
        const loadTheme = async () => {
            try {
                const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
                if (savedTheme) {
                    setThemeMode(savedTheme as ThemeMode);
                }
            } catch (error) {
                console.warn('Failed to load theme preference:', error);
            }
        };
        loadTheme();
    }, []);

    // Update isDarkMode whenever themeMode or systemScheme changes
    useEffect(() => {
        if (themeMode === 'system') {
            setIsDarkMode(systemScheme === 'dark');
        } else {
            setIsDarkMode(themeMode === 'dark');
        }
    }, [themeMode, systemScheme]);

    const toggleTheme = useCallback(async () => {
        try {
            // Logic: If current effective is dark, switch to light. Else switch to dark.
            // This explicitly sets the mode to 'light' or 'dark', overriding 'system'.
            const newMode = isDarkMode ? 'light' : 'dark';
            setThemeMode(newMode);
            await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode);
        } catch (error) {
            console.warn('Failed to save theme preference:', error);
        }
    }, [isDarkMode]);

    return { isDarkMode, toggleTheme, themeMode };
};

export default useTheme;
