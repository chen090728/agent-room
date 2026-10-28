import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageSnapshot, setLanguagePreference, subscribeLanguage } from './runtime';

/**
 * Preference (`system` / `zh` / `en`), the resolved language, and `t`.
 * `initI18n()` should have been awaited before the first screen that calls this.
 */
export function useLanguage() {
  const snapshot = useSyncExternalStore(subscribeLanguage, getLanguageSnapshot, getLanguageSnapshot);
  const { t, i18n } = useTranslation();
  return {
    preference: snapshot.preference,
    language: snapshot.language,
    ready: snapshot.ready,
    setPreference: setLanguagePreference,
    t,
    i18n,
  };
}

/** Thin wrapper around react-i18next, so screens do not import it directly. */
export function useAppTranslation() {
  return useTranslation();
}
