import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { Avatar } from './theme';

// The access token lives in the OS keychain/keystore; everything else is
// non-sensitive and goes to AsyncStorage.
const TOKEN_KEY = 'agenthub.token';
const URL_KEY = 'agenthub.serverUrl';
const PROFILE_KEY = 'agenthub.profile';

export interface ConnectionSettings {
  serverUrl: string;
  token: string;
}

export async function loadSettings(): Promise<ConnectionSettings | null> {
  const [serverUrl, token] = await Promise.all([AsyncStorage.getItem(URL_KEY), SecureStore.getItemAsync(TOKEN_KEY)]);
  return serverUrl && token ? { serverUrl, token } : null;
}

export async function saveSettings(s: ConnectionSettings): Promise<void> {
  await Promise.all([AsyncStorage.setItem(URL_KEY, s.serverUrl), SecureStore.setItemAsync(TOKEN_KEY, s.token)]);
}

export async function clearSettings(): Promise<void> {
  await Promise.all([AsyncStorage.removeItem(URL_KEY), SecureStore.deleteItemAsync(TOKEN_KEY)]);
}

/** Who "I" am in the App; kept on this device only. */
export interface Profile {
  nickname: string;
  /** null shows the default silhouette. */
  avatar: Avatar | null;
}

export const DEFAULT_PROFILE: Profile = { nickname: '我', avatar: null };

export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export const saveProfile = (profile: Profile) => AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
