import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/*
 * Remembers the last JS error so it can be shown in the settings the next time
 * the App opens (there is no other way to see it without a computer). The
 * write is synchronous on purpose: a fatal error closes the App right after.
 * Native crashes (outside JavaScript) cannot be caught here.
 */

const KEY = 'agenthub.lastError';
const MAX_CHARS = 1800; // the iOS keychain is not meant for large values

export interface ErrorRecord {
  message: string;
  stack: string;
  /** 'global' = an uncaught error, 'render' = caught by the error screen. */
  source: 'global' | 'render';
  fatal: boolean;
  at: number;
}

function write(value: string | null) {
  try {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(KEY);
      else globalThis.localStorage?.setItem(KEY, value);
    } else if (value === null) {
      void SecureStore.deleteItemAsync(KEY);
    } else {
      SecureStore.setItem(KEY, value);
    }
  } catch {
    // Nowhere left to report this.
  }
}

export function recordError(error: unknown, source: ErrorRecord['source'], fatal = false) {
  const err = error instanceof Error ? error : new Error(String(error));
  const record: ErrorRecord = {
    message: `${err.name && err.name !== 'Error' ? `${err.name}: ` : ''}${err.message}`.slice(0, 400),
    stack: (err.stack ?? '').split('\n').slice(0, 12).join('\n'),
    source,
    fatal,
    at: Date.now(),
  };
  let text = JSON.stringify(record);
  if (text.length > MAX_CHARS) text = JSON.stringify({ ...record, stack: record.stack.slice(0, Math.max(0, record.stack.length - (text.length - MAX_CHARS))) });
  write(text);
}

export function loadLastError(): ErrorRecord | null {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : SecureStore.getItem(KEY);
    return raw ? (JSON.parse(raw) as ErrorRecord) : null;
  } catch {
    return null;
  }
}

export function clearLastError() {
  write(null);
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler(): GlobalHandler;
  setGlobalHandler(handler: GlobalHandler): void;
}

let installed = false;

/** Records uncaught JS errors, then lets React Native handle them as before. */
export function installGlobalErrorHandler() {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (installed || !errorUtils) return;
  installed = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    recordError(error, 'global', !!isFatal);
    previous?.(error, isFatal);
  });
}
