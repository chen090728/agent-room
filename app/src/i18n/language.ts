/**
 * Language choice, device-locale fallback, and on-device persistence.
 *
 * This module stays free of Expo and React Native imports so it can be unit
 * tested with plain Node. `runtime.ts` connects it to AsyncStorage and
 * expo-localization.
 *
 * Three choices are stored under `agenthub.language`: `system` (follow the
 * phone), `zh`, and `en`. Startup never writes that key. A missing key stays
 * `system`, so the first launch follows the device; once a choice is saved,
 * a later launch does not replace it.
 *
 * Resolving `system` (first launch, or an explicit "follow the phone" choice):
 * 1. Locale language from expo-localization. `zh` → Chinese, `en` → English.
 *    A supported language stops here, so an English phone stays English even
 *    when the region or timezone is in China.
 * 2. Otherwise the country. Device `regionCode` wins, then the language's
 *    region (`languageRegionCode` or the region inside the language tag).
 *    CN, TW, HK, and MO → Chinese. Any other region → English.
 * 3. Otherwise the IANA timezone, and only then: mainland China, Taiwan,
 *    Hong Kong, and Macau → Chinese. Any other zone, or none → English.
 *    Offsets such as GMT+8 are ignored; they also cover places outside those four.
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
 * Signals read from the device. Every field is optional so a partial reading
 * (locale only, region only, or timezone only) still resolves.
 */
export interface DeviceLocale {
  /** BCP 47 tag, for example `zh-Hans-CN` or `en-US`. */
  languageTag?: string | null;
  /** Primary language when the platform reports it separately from the tag. */
  languageCode?: string | null;
  /** Region of the preferred language. `en-CA` → `CA`. */
  languageRegionCode?: string | null;
  /**
   * Device region setting (iOS Language & Region, Android Region).
   * Preferred over `languageRegionCode` when both are present.
   */
  regionCode?: string | null;
  /** IANA timezone, for example `Asia/Shanghai`. Consulted only as a last resort. */
  timeZone?: string | null;
}

/** ISO 3166-1 alpha-2 regions whose everyday UI language is Chinese. */
const CHINESE_REGIONS = new Set(['CN', 'TW', 'HK', 'MO']);

/**
 * IANA zones for mainland China, Taiwan, Hong Kong, and Macau.
 * Compared case-insensitively. Legacy aliases are included because some
 * phones still report them. `Asia/Singapore` is intentionally absent.
 */
const CHINESE_TIME_ZONES = new Set([
  'asia/shanghai',
  'asia/urumqi',
  'asia/chongqing',
  'asia/chungking',
  'asia/harbin',
  'asia/kashgar',
  'asia/beijing',
  'asia/taipei',
  'asia/hong_kong',
  'asia/macau',
  'asia/macao',
]);

/** Primary subtags that do not name a language. */
const UNDETERMINED_LANGUAGES = new Set(['und', 'mul', 'zxx', 'mis', 'root']);

/**
 * Map a BCP 47 tag (or a bare language code) to a supported language.
 * Only the primary subtag is consulted: zh, zh-CN, zh-Hans, zh-Hant, zh_TW
 * are Chinese. Every other tag, and a missing tag, is English.
 * Region and timezone are not consulted here; use `languageFromDevice`.
 */
export function languageFromLocale(tag: string | null | undefined): AppLanguage {
  if (!tag) return 'en';
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  return primary === 'zh' ? 'zh' : 'en';
}

function primarySubtag(value: string | null | undefined): string | null {
  const raw = value?.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  if (!raw || UNDETERMINED_LANGUAGES.has(raw)) return null;
  return raw;
}

/** `zh` or `en` when the locale names one of them; otherwise null. */
function supportedLocaleLanguage(device: DeviceLocale): AppLanguage | null {
  const primary = primarySubtag(device.languageCode) ?? primarySubtag(device.languageTag);
  if (primary === 'zh' || primary === 'en') return primary;
  return null;
}

function normalizeRegion(value: string | null | undefined): string | null {
  const region = value?.trim().toUpperCase() ?? '';
  if (!/^[A-Z]{2}$/.test(region) && !/^\d{3}$/.test(region)) return null;
  return region;
}

/** Region subtag of a BCP 47 tag: `zh-Hans-CN` → `CN`, `es-419` → `419`. */
function regionFromTag(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const parts = tag.trim().replace(/_/g, '-').split('-').filter(Boolean);
  for (const part of parts.slice(1)) {
    if (/^[A-Za-z]{4}$/.test(part)) continue;
    if (part.length === 1) break;
    const region = normalizeRegion(part);
    if (region) return region;
  }
  return null;
}

/**
 * Country used for the language guess. The device region comes first, matching
 * expo-localization's guidance to prefer `regionCode` for internationalization.
 */
function countryOf(device: DeviceLocale): string | null {
  return normalizeRegion(device.regionCode) ?? normalizeRegion(device.languageRegionCode) ?? regionFromTag(device.languageTag);
}

function isChineseTimeZone(zone: string | null | undefined): boolean {
  const name = zone?.trim().toLowerCase().replace(/\s+/g, '') ?? '';
  return name.length > 0 && CHINESE_TIME_ZONES.has(name);
}

/**
 * Pick a UI language from locale, then region, then timezone.
 * See the module comment for the order. A missing reading is English.
 */
export function languageFromDevice(device: DeviceLocale | string | null | undefined): AppLanguage {
  const signals: DeviceLocale = typeof device === 'string' || device == null ? { languageTag: device } : device;
  const fromLocale = supportedLocaleLanguage(signals);
  if (fromLocale) return fromLocale;
  const country = countryOf(signals);
  if (country) return CHINESE_REGIONS.has(country) ? 'zh' : 'en';
  if (isChineseTimeZone(signals.timeZone)) return 'zh';
  return 'en';
}

/**
 * An explicit zh/en choice wins over the device.
 * `system` uses locale, then region, then timezone.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  system: DeviceLocale | string | null | undefined,
): AppLanguage {
  if (preference === 'zh' || preference === 'en') return preference;
  return languageFromDevice(system);
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
   * Re-read the device. Does not change the stored preference. Callers
   * observing `getLanguage()` see a new value when the phone's locale, region,
   * or timezone changed and the choice is `system`.
   */
  refreshSystem(): void;
}

/**
 * In-memory preference with AsyncStorage-shaped persistence.
 * A choice made while hydration is still reading is kept (the in-flight read
 * must not overwrite it). A failed write rolls back to the previous choice.
 */
export function createLanguageStore(
  storage: KeyValueStore,
  readSystem: () => DeviceLocale | string | null | undefined,
): LanguageStore {
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
    getLanguage: () => resolveLanguage(preference, readSystem()),
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
