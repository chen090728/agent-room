export { initI18n, setLanguagePreference, getLanguageSnapshot, subscribeLanguage, readDeviceLocale, readSystemLanguageTag } from './runtime';
export type { LanguageSnapshot } from './runtime';
export { useAppTranslation, useLanguage } from './useLanguage';
export {
  LANGUAGE_STORAGE_KEY,
  createLanguageStore,
  isLanguagePreference,
  languageChoices,
  languageFromDevice,
  languageFromLocale,
  loadLanguagePreference,
  parseLanguagePreference,
  resolveLanguage,
  saveLanguagePreference,
} from './language';
export type { AppLanguage, DeviceLocale, KeyValueStore, LanguagePreference, LanguageStore } from './language';
