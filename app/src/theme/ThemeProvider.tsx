import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { paletteFor, statusBarFor, type ColorScheme, type ThemeColors, type ThemeShadows } from './palette';
import { resolveColorScheme, type ThemePreference } from './preference';
import { themePreferences } from './preferenceStore';

function applyNativeScheme(preference: ThemePreference) {
  try {
    // 'auto' clears an override and follows the system. This only changes the
    // app, not the device. It runs from the provider so a single screen calling
    // useTheme() does not flip the native scheme on its own.
    Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
  } catch {
    // The JS palette still follows `preference` if the native override is unavailable.
  }
}

export interface Theme {
  /** Saved choice: follow the system, or force light / dark. */
  preference: ThemePreference;
  /** The palette actually in use. */
  colorScheme: ColorScheme;
  colors: ThemeColors;
  shadows: ThemeShadows;
  /**
   * Pass to `<StatusBar style={statusBar} />` from expo-status-bar.
   * Light pages use `'dark'` (dark icons); dark pages use `'light'`.
   */
  statusBar: 'light' | 'dark';
  /** False until the saved choice has been read from AsyncStorage. */
  ready: boolean;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<Theme | null>(null);

function useThemeState(): Theme {
  const system = useColorScheme();
  const preference = useSyncExternalStore(themePreferences.subscribe, themePreferences.getPreference, themePreferences.getPreference);
  const ready = useSyncExternalStore(themePreferences.subscribe, themePreferences.getReady, themePreferences.getReady);

  useEffect(() => {
    void themePreferences.hydrate();
  }, []);

  const colorScheme = resolveColorScheme(preference, system);

  return useMemo(() => {
    const palette = paletteFor(colorScheme);
    return {
      preference,
      colorScheme,
      colors: palette.colors,
      shadows: palette.shadows,
      statusBar: statusBarFor(colorScheme),
      ready,
      setPreference: (next: ThemePreference) => themePreferences.setPreference(next),
    };
  }, [preference, colorScheme, ready]);
}

/**
 * Loads the saved appearance and provides it to the tree.
 * Mount this once around the app (the root layout) in step 2.
 * Until then, nothing calls it, and existing screens keep using the light
 * `colors` / `shadows` exports.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeState();
  useEffect(() => {
    if (!theme.ready) return;
    applyNativeScheme(theme.preference);
  }, [theme.preference, theme.ready]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/**
 * Colors for the screen this component is on.
 *
 * The `colors` and `shadows` exports in `theme.ts` stay the light palette, so
 * screens that have not migrated look the same as before. A screen that should
 * follow the saved appearance reads them here:
 *
 * ```tsx
 * const { colors, shadows, statusBar, preference, setPreference } = useTheme();
 * ```
 *
 * Works outside `ThemeProvider` too (same store). Mount the provider once at
 * the root anyway: that is what tells React Native's Appearance module about
 * the saved choice. Do that in the same change that paints the root with
 * these colors — `app.json` currently forces `userInterfaceStyle: "light"`,
 * so "follow the system" stays light until that is `"automatic"`.
 *
 * Do not read `colors` inside `StyleSheet.create` at module scope if the screen
 * should update when the appearance changes — that snapshot stays light.
 * Build the styles during render from the object this hook returns.
 */
export function useTheme(): Theme {
  const provided = useContext(ThemeContext);
  const local = useThemeState();
  return provided ?? local;
}
