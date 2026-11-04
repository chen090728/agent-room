import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LANGUAGE_STORAGE_KEY,
  createLanguageStore,
  languageFromDevice,
  languageFromLocale,
  loadLanguagePreference,
  parseLanguagePreference,
  resolveLanguage,
  saveLanguagePreference,
  type DeviceLocale,
  type KeyValueStore,
} from './language.ts';

function memory(initial: Record<string, string> = {}): KeyValueStore & { dump(): Record<string, string> } {
  const data = { ...initial };
  return {
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      data[key] = value;
    },
    dump: () => ({ ...data }),
  };
}

test('system locale: zh-* is Chinese, everything else is English', () => {
  for (const tag of ['zh', 'zh-CN', 'zh-Hans', 'zh-Hant', 'zh-TW', 'zh_CN', 'ZH-cn', ' zh-Hans-CN ']) {
    assert.equal(languageFromLocale(tag), 'zh', tag);
  }
  for (const tag of ['en', 'en-US', 'en-GB', 'ja', 'ja-JP', 'fr', 'yue', 'cmn-Hans', 'zho', '', '   ', null, undefined]) {
    assert.equal(languageFromLocale(tag), 'en', String(tag));
  }
});

test('an explicit choice wins over the phone locale', () => {
  assert.equal(resolveLanguage('system', 'zh-CN'), 'zh');
  assert.equal(resolveLanguage('system', 'en-US'), 'en');
  assert.equal(resolveLanguage('system', null), 'en');
  assert.equal(resolveLanguage('en', 'zh-Hans'), 'en');
  assert.equal(resolveLanguage('zh', 'en-US'), 'zh');
});

test('unknown stored values follow the system', () => {
  assert.equal(parseLanguagePreference(null), 'system');
  assert.equal(parseLanguagePreference(undefined), 'system');
  assert.equal(parseLanguagePreference(''), 'system');
  assert.equal(parseLanguagePreference('ZH'), 'system');
  assert.equal(parseLanguagePreference('chinese'), 'system');
  assert.equal(parseLanguagePreference('system'), 'system');
  assert.equal(parseLanguagePreference('zh'), 'zh');
  assert.equal(parseLanguagePreference('en'), 'en');
});

test('load and save round-trip through the storage key', async () => {
  const store = memory();
  assert.equal(await loadLanguagePreference(store), 'system');
  await saveLanguagePreference(store, 'en');
  assert.equal(store.dump()[LANGUAGE_STORAGE_KEY], 'en');
  assert.equal(await loadLanguagePreference(store), 'en');
  await saveLanguagePreference(store, 'zh');
  assert.equal(await loadLanguagePreference(store), 'zh');
  await saveLanguagePreference(store, 'system');
  assert.equal(await loadLanguagePreference(store), 'system');
});

test('a storage read failure falls back to system', async () => {
  const broken: KeyValueStore = {
    getItem: async () => {
      throw new Error('unavailable');
    },
    setItem: async () => {},
  };
  assert.equal(await loadLanguagePreference(broken), 'system');
});

test('the store rejects an unknown choice and does not write it', async () => {
  const store = memory();
  const prefs = createLanguageStore(store, () => 'zh-CN');
  await assert.rejects(() => prefs.setPreference('fr' as 'en'), /Unknown language preference/);
  assert.equal(prefs.getPreference(), 'system');
  assert.deepEqual(store.dump(), {});
});

test('setPreference persists and resolves immediately', async () => {
  let tag: string | null = 'en-US';
  const store = memory();
  const prefs = createLanguageStore(store, () => tag);
  assert.equal(prefs.getLanguage(), 'en');
  await prefs.setPreference('zh');
  tag = 'en-US';
  assert.equal(prefs.getPreference(), 'zh');
  assert.equal(prefs.getLanguage(), 'zh');
  assert.equal(store.dump()[LANGUAGE_STORAGE_KEY], 'zh');

  await prefs.setPreference('system');
  assert.equal(prefs.getLanguage(), 'en');
  tag = 'zh-Hant';
  assert.equal(prefs.getLanguage(), 'zh');
});

test('a failed write rolls back the choice', async () => {
  const store = memory({ [LANGUAGE_STORAGE_KEY]: 'en' });
  const prefs = createLanguageStore(store, () => 'en-US');
  await prefs.hydrate();
  assert.equal(prefs.getPreference(), 'en');
  store.setItem = async () => {
    throw new Error('full');
  };
  await assert.rejects(() => prefs.setPreference('zh'), /full/);
  assert.equal(prefs.getPreference(), 'en');
  assert.equal(prefs.getLanguage(), 'en');
});

test('a choice made during hydration is not overwritten by the stored value', async () => {
  let release: (value: string | null) => void = () => {};
  const store: KeyValueStore = {
    getItem: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    setItem: async () => {},
  };
  const prefs = createLanguageStore(store, () => 'zh-CN');
  const hydrating = prefs.hydrate();
  await prefs.setPreference('en');
  release('zh');
  await hydrating;
  assert.equal(prefs.getPreference(), 'en');
  assert.equal(prefs.getLanguage(), 'en');
  assert.equal(prefs.getReady(), true);
});

test('first launch: locale, then region, then timezone', () => {
  const zhLocales: Array<DeviceLocale | string> = [
    'zh',
    'zh-CN',
    'zh-Hans',
    'zh-Hant-TW',
    'zh_CN',
    { languageCode: 'zh', regionCode: 'US', timeZone: 'America/New_York' },
    { languageCode: 'und', languageTag: 'zh-Hant' },
  ];
  for (const device of zhLocales) {
    assert.equal(languageFromDevice(device), 'zh', JSON.stringify(device));
  }

  const enLocales: Array<DeviceLocale | string> = [
    'en',
    'en-US',
    'en-GB',
    'en-CN',
    // languageCode is the locale language; it wins over a conflicting tag.
    { languageCode: 'en', languageTag: 'zh-Hans-CN' },
    { languageTag: 'en-US', regionCode: 'CN', timeZone: 'Asia/Shanghai' },
    { languageCode: 'en', languageRegionCode: 'HK', regionCode: 'HK', timeZone: 'Asia/Hong_Kong' },
    { languageTag: 'ja-JP', regionCode: 'JP', timeZone: 'Asia/Tokyo' },
    { languageTag: 'fr-FR', regionCode: 'FR' },
    { regionCode: 'US', timeZone: 'Asia/Taipei' },
    { languageRegionCode: 'SG', timeZone: 'Asia/Singapore' },
    { timeZone: 'Asia/Singapore' },
    { timeZone: 'GMT+8' },
    { timeZone: 'America/Los_Angeles' },
    {},
    null,
    undefined,
  ];
  for (const device of enLocales) {
    assert.equal(languageFromDevice(device), 'en', JSON.stringify(device));
  }

  // Locale did not name zh or en, so the country decides. Device region wins
  // over the region baked into the language tag.
  assert.equal(languageFromDevice({ languageTag: 'ja-JP', regionCode: 'TW' }), 'zh');
  assert.equal(languageFromDevice({ languageTag: 'ja-CN', regionCode: 'US' }), 'en');
  assert.equal(languageFromDevice({ languageCode: 'ja', languageRegionCode: 'CN' }), 'zh');
  assert.equal(languageFromDevice({ languageTag: 'yue-HK' }), 'zh');
  assert.equal(languageFromDevice('ja-CN'), 'zh');
  assert.equal(languageFromDevice({ regionCode: 'cn' }), 'zh');
  assert.equal(languageFromDevice({ regionCode: 'MO' }), 'zh');
  assert.equal(languageFromDevice({ languageCode: 'und', regionCode: 'HK' }), 'zh');

  // No locale and no region: timezone is the country signal.
  for (const timeZone of ['Asia/Shanghai', 'Asia/Urumqi', 'Asia/Chongqing', 'Asia/Taipei', 'Asia/Hong_Kong', 'Asia/Macau', 'asia/macao', ' Asia/Harbin ']) {
    assert.equal(languageFromDevice({ timeZone }), 'zh', timeZone);
    assert.equal(languageFromDevice({ languageCode: 'und', languageTag: 'und', timeZone }), 'zh', timeZone);
  }
  assert.equal(languageFromDevice({ languageCode: 'ja', timeZone: 'Asia/Kashgar' }), 'zh');
  assert.equal(languageFromDevice({ languageCode: 'ko', timeZone: 'Asia/Seoul' }), 'en');
});

test('an explicit saved choice beats locale, region, and timezone', () => {
  const device: DeviceLocale = { languageTag: 'zh-CN', regionCode: 'CN', timeZone: 'Asia/Shanghai' };
  assert.equal(resolveLanguage('en', device), 'en');
  assert.equal(resolveLanguage('zh', { languageTag: 'en-US', regionCode: 'US', timeZone: 'America/New_York' }), 'zh');
  assert.equal(resolveLanguage('system', device), 'zh');
  assert.equal(resolveLanguage('system', { languageTag: 'en-US', regionCode: 'US', timeZone: 'Asia/Shanghai' }), 'en');
});

test('hydration keeps a saved preference and does not write a missing one', async () => {
  const saved = memory({ [LANGUAGE_STORAGE_KEY]: 'en' });
  const kept = createLanguageStore(saved, () => ({ languageTag: 'zh-CN', regionCode: 'CN', timeZone: 'Asia/Shanghai' }));
  await kept.hydrate();
  assert.equal(kept.getPreference(), 'en');
  assert.equal(kept.getLanguage(), 'en');
  assert.equal(saved.dump()[LANGUAGE_STORAGE_KEY], 'en');

  let device: DeviceLocale = { regionCode: 'TW' };
  const fresh = memory();
  const first = createLanguageStore(fresh, () => device);
  assert.equal(first.getLanguage(), 'zh');
  await first.hydrate();
  assert.equal(first.getPreference(), 'system');
  assert.equal(first.getLanguage(), 'zh');
  assert.equal(first.getReady(), true);
  assert.deepEqual(fresh.dump(), {});

  device = { languageTag: 'en-GB', regionCode: 'GB', timeZone: 'Asia/Shanghai' };
  first.refreshSystem();
  assert.equal(first.getPreference(), 'system');
  assert.equal(first.getLanguage(), 'en');
  assert.deepEqual(fresh.dump(), {});

  await first.setPreference('zh');
  device = { languageTag: 'en-US', regionCode: 'US' };
  first.refreshSystem();
  assert.equal(first.getPreference(), 'zh');
  assert.equal(first.getLanguage(), 'zh');
  assert.equal(fresh.dump()[LANGUAGE_STORAGE_KEY], 'zh');
});

test('subscribers hear preference changes', async () => {
  const prefs = createLanguageStore(memory(), () => 'en');
  let calls = 0;
  const stop = prefs.subscribe(() => {
    calls += 1;
  });
  await prefs.setPreference('zh');
  prefs.refreshSystem();
  stop();
  await prefs.setPreference('en');
  assert.equal(calls, 2);
});
