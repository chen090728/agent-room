import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// The access token lives in the OS keychain/keystore; everything else is
// non-sensitive and goes to AsyncStorage.
const TOKEN_KEY = 'agenthub.token';
const URL_KEY = 'agenthub.serverUrl';
const LAST_GROUP_KEY = 'agenthub.lastGroupId';

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
  await Promise.all([
    AsyncStorage.multiRemove([URL_KEY, LAST_GROUP_KEY]),
    SecureStore.deleteItemAsync(TOKEN_KEY),
  ]);
}

export const loadLastGroupId = () => AsyncStorage.getItem(LAST_GROUP_KEY);
export const saveLastGroupId = (id: string) => AsyncStorage.setItem(LAST_GROUP_KEY, id);
