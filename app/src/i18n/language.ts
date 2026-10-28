/**
 * Language choice, system-locale fallback, and on-device persistence.
 *
 * This module stays free of Expo and React Native imports so it can be unit
 * tested with plain Node. `runtime.ts` connects it to AsyncStorage and
 * expo-localization.
 *
 * Three choices are stored: `system` (follow the phone), `zh`, and `en`.
 * A system locale whose primary language is `zh` (zh-CN, zh-Hans, zh-Hant, …)
 * resolves to Chinese. Anything else, including a missing locale, resolves to
 * English.
 */

export const LANGUAGE_STORAGE_KEY = 'agenthub.language';

export type AppLanguage = 'zh' | 'en';
export type LanguagePreference = 'system' | AppLanguage;

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const PREFERENCES: readonly LanguagePreference[] = ['system', 'zh', 'en'];

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'system' || value === 'zh' || value === 'en';
}

/** Unknown, empty, or corrupt stored values follow the system. */
export function parseLanguagePreference(raw: string | null | undefined): LanguagePreference {
  return isLanguagePreference(raw) ? raw : 'system';
}

/**
 * Map a BCP 47 tag (or a bare language code) to a supported language.
 * Only the primary subtag is consulted: zh, zh-CN, zh-Hans, zh-Hant, zh_TW
 * are Chinese. Every other tag, and a missing tag, is English.
 */
export function languageFromLocale(tag: string | null | undefined): AppLanguage {
  if (!tag) return 'en';
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  return primary === 'zh' ? 'zh' : 'en';
}

/** An explicit zh/en choice wins. `system` uses the phone locale. */
export function resolveLanguage(preference: LanguagePreference, systemTag: string | null | undefined): AppLanguage {
  if (preference === 'zh' || preference === 'en') return preference;
  return languageFromLocale(systemTag);
}

export async function loadLanguagePreference(storage: KeyValueStore): Promise<LanguagePreference> {
  try {
    return parseLanguagePreference(await storage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

export async function saveLanguagePreference(storage: KeyValueStore, preference: LanguagePreference): Promise<void> {
  if (!isLanguagePreference(preference)) {
    throw new Error(`Unknown language preference: ${String(preference)}`);
  }
  await storage.setItem(LANGUAGE_STORAGE_KEY, preference);
}

export interface LanguageStore {
  getPreference(): LanguagePreference;
  /** Resolved language for the current preference and system locale. */
  getLanguage(): AppLanguage;
  getReady(): boolean;
  subscribe(listener: () => void): () => void;
  hydrate(): Promise<void>;
  setPreference(preference: LanguagePreference): Promise<void>;
  /**
   * Re-read the system locale. No-op for the stored preference; callers
   * observing `getLanguage()` see a new value when the phone language changed
   * and the choice is `system`.
   */
  refreshSystem(): void;
}

/**
 * In-memory preference with AsyncStorage-shaped persistence.
 * A choice made while hydration is still reading is kept (the in-flight read
 * must not overwrite it). A failed write rolls back to the previous choice.
 */
export function createLanguageStore(storage: KeyValueStore, systemTag: () => string | null | undefined): LanguageStore {
  let preference: LanguagePreference = 'system';
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
    getLanguage: () => resolveLanguage(preference, systemTag()),
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
            const raw = await storage.getItem(LANGUAGE_STORAGE_KEY);
            if (!dirty) preference = parseLanguagePreference(raw);
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
      if (!isLanguagePreference(next)) throw new Error(`Unknown language preference: ${String(next)}`);
      const token = ++write;
      const previous = preference;
      dirty = true;
      preference = next;
      ready = true;
      emit();
      try {
        await saveLanguagePreference(storage, next);
      } catch (error) {
        if (token === write) {
          preference = previous;
          emit();
        }
        throw error;
      }
    },
    refreshSystem() {
      emit();
    },
  };
}

export const languageChoices: readonly LanguagePreference[] = PREFERENCES;
