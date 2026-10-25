import type { ColorScheme } from './palette';

/** AsyncStorage key. Same prefix as the other on-device settings. */
export const THEME_STORAGE_KEY = 'agenthub.theme';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  system: '跟随系统',
  light: '浅色',
  dark: '深色',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** Unknown or empty storage values fall back to following the system. */
export function parseThemePreference(raw: string | null | undefined): ThemePreference {
  return isThemePreference(raw) ? raw : 'system';
}

/**
 * An explicit light/dark choice wins. `system` uses the OS scheme, and a
 * missing OS scheme (null) stays light — that is what the app looks like today.
 */
export function resolveColorScheme(preference: ThemePreference, system: ColorScheme | null | undefined): ColorScheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

export interface ThemeKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface ThemePreferenceStore {
  getPreference(): ThemePreference;
  getReady(): boolean;
  subscribe(listener: () => void): () => void;
  hydrate(): Promise<void>;
  setPreference(preference: ThemePreference): Promise<void>;
}

export function createThemePreferenceStore(storage: ThemeKeyValueStore): ThemePreferenceStore {
  let preference: ThemePreference = 'system';
  let ready = false;
  let dirty = false;
  let write = 0;
  let hydrating: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    getPreference: () => preference,
    getReady: () => ready,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hydrate() {
      if (ready) return Promise.resolve();
      if (!hydrating) {
        hydrating = (async () => {
          try {
            const raw = await storage.getItem(THEME_STORAGE_KEY);
            if (!dirty) preference = parseThemePreference(raw);
          } catch {
            if (!dirty) preference = 'system';
          } finally {
            ready = true;
            emit();
          }
        })();
      }
      return hydrating;
    },
    async setPreference(next) {
      if (!isThemePreference(next)) throw new Error(`Unknown theme preference: ${String(next)}`);
      const token = ++write;
      const previous = preference;
      dirty = true;
      preference = next;
      ready = true;
      emit();
      try {
        await storage.setItem(THEME_STORAGE_KEY, next);
      } catch (error) {
        if (token === write) {
          preference = previous;
          emit();
        }
        throw error;
      }
    },
  };
}
