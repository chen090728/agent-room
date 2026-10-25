import AsyncStorage from '@react-native-async-storage/async-storage';
import { createThemePreferenceStore } from './preference';

/**
 * The on-device appearance choice. AsyncStorage is what the app already uses
 * for the server URL and profile, and it works in Expo Go (no native rebuild).
 * The access token stays in the keychain; this value is not a secret.
 */
export const themePreferences = createThemePreferenceStore({
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
});
