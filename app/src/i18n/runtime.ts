import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCalendars, getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { AppState } from 'react-native';
import { createLanguageStore, type AppLanguage, type DeviceLocale, type LanguagePreference } from './language';
import { en } from './locales/en';
import { zh } from './locales/zh';

const storage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
};

/**
 * Locale, region, and timezone from expo-localization.
 * Timezone falls back to `Intl` when the calendar does not report one.
 * A failure leaves the missing fields empty; it does not throw.
 */
export function readDeviceLocale(): DeviceLocale {
  const device: DeviceLocale = {
    languageTag: null,
    languageCode: null,
    languageRegionCode: null,
    regionCode: null,
    timeZone: null,
  };
  try {
    const locale = getLocales()[0];
    if (locale) {
      device.languageTag = locale.languageTag || null;
      device.languageCode = locale.languageCode || null;
      device.languageRegionCode = locale.languageRegionCode || null;
      device.regionCode = locale.regionCode || null;
    }
  } catch {
    // The native module can be missing in a context that only typechecks.
  }
  try {
    device.timeZone = getCalendars()[0]?.timeZone ?? null;
  } catch {
    device.timeZone = null;
  }
  if (!device.timeZone) {
    try {
      device.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
    } catch {
      device.timeZone = null;
    }
  }
  return device;
}

/** First preferred locale on the phone, or null when it cannot be read. */
export function readSystemLanguageTag(): string | null {
  const device = readDeviceLocale();
  return device.languageTag || device.languageCode || null;
}

const store = createLanguageStore(storage, readDeviceLocale);

export interface LanguageSnapshot {
  preference: LanguagePreference;
  language: AppLanguage;
  ready: boolean;
}

function current(): LanguageSnapshot {
  return {
    preference: store.getPreference(),
    language: store.getLanguage(),
    ready: store.getReady(),
  };
}

let snapshot: LanguageSnapshot = current();
const listeners = new Set<() => void>();

function publish(): void {
  const next = current();
  if (snapshot.preference === next.preference && snapshot.language === next.language && snapshot.ready === next.ready) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

store.subscribe(() => {
  publish();
  const lng = store.getLanguage();
  if (i18n.isInitialized && i18n.language !== lng) void i18n.changeLanguage(lng);
});

let listening = false;
let starting: Promise<void> | null = null;

function watchSystemLocale(): void {
  if (listening) return;
  listening = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') store.refreshSystem();
  });
}

/**
 * Load the saved choice, resolve it against the phone locale, and start i18next.
 * Safe to call more than once. Call this once during startup before the first
 * translated screen; nothing here mounts UI.
 */
export function initI18n(): Promise<void> {
  watchSystemLocale();
  if (!starting) {
    starting = (async () => {
      await store.hydrate();
      const lng = store.getLanguage();
      if (!i18n.isInitialized) {
        await i18n.use(initReactI18next).init({
          resources: {
            zh: { translation: zh },
            en: { translation: en },
          },
          lng,
          fallbackLng: { zh: ['en'], en: ['zh'], default: ['en'] },
          supportedLngs: ['zh', 'en'],
          interpolation: { escapeValue: false },
          returnNull: false,
          react: { useSuspense: false },
        });
      } else if (i18n.language !== lng) {
        await i18n.changeLanguage(lng);
      }
    })().catch((error: unknown) => {
      starting = null;
      throw error;
    });
  }
  return starting;
}

/** Persist a choice and switch the active language. `system` follows the phone. */
export function setLanguagePreference(preference: LanguagePreference): Promise<void> {
  return store.setPreference(preference);
}

export function getLanguageSnapshot(): LanguageSnapshot {
  return snapshot;
}

export function subscribeLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
