import assert from 'node:assert/strict';
import test from 'node:test';
import { createInstance } from 'i18next';
import { createLanguageStore, type KeyValueStore } from './language.ts';
import { en } from './locales/en.ts';
import { zh } from './locales/zh.ts';
import { renderNotice } from './notice.ts';

function memory(): KeyValueStore {
  const data: Record<string, string> = {};
  return {
    async getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setItem(key, value) {
      data[key] = value;
    },
  };
}

const i18n = createInstance();

test('notices render in the chosen language and fall back to content', async () => {
  await i18n.init({
    lng: 'zh',
    fallbackLng: { zh: ['en'], en: ['zh'], default: ['en'] },
    supportedLngs: ['zh', 'en'],
    interpolation: { escapeValue: false },
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
  });
  const exists = (key: string) => i18n.exists(key);
  const t = i18n.t.bind(i18n);

  assert.equal(renderNotice(undefined, '原句', t, exists), '原句');
  assert.equal(renderNotice({ code: 'not.a.real.code' }, '服务器原文', t, exists), '服务器原文');
  assert.equal(
    renderNotice({ code: 'relay.failed', params: { name: '阿蓝', reasonCode: 'relay.timeout' } }, '原文', t, exists),
    '阿蓝 回复失败：请求超时',
  );
  assert.match(renderNotice({ code: 'demo.welcome' }, '原文', t, exists), /欢迎来到演示群/);
  assert.match(renderNotice({ code: 'demo.welcome' }, '原文', t, exists), /@小橙/);

  await i18n.changeLanguage('en');
  assert.equal(
    renderNotice({ code: 'relay.failed', params: { name: '阿蓝', reasonCode: 'relay.timeout' } }, '原文', t, exists),
    "阿蓝 couldn't reply: The request timed out",
  );
  assert.match(renderNotice({ code: 'demo.welcome' }, '中文欢迎', t, exists), /Welcome to the demo group/);
  assert.equal(renderNotice({ code: 'still.unknown' }, '中文欢迎', t, exists), '中文欢迎');
});

test('language selection picks the notice catalog', async () => {
  const prefs = createLanguageStore(memory(), () => 'zh-CN');
  await prefs.setPreference('en');
  await i18n.changeLanguage(prefs.getLanguage());
  assert.equal(prefs.getPreference(), 'en');
  assert.match(renderNotice({ code: 'relay.hopLimit', params: { maxHops: 5 } }, '中文', i18n.t.bind(i18n), (key) => i18n.exists(key)), /5-round/);

  await prefs.setPreference('system');
  await i18n.changeLanguage(prefs.getLanguage());
  assert.equal(prefs.getLanguage(), 'zh');
  assert.match(renderNotice({ code: 'relay.hopLimit', params: { maxHops: 5 } }, 'fallback', i18n.t.bind(i18n), (key) => i18n.exists(key)), /5 轮/);

  await prefs.setPreference('zh');
  await i18n.changeLanguage(prefs.getLanguage());
  assert.equal(i18n.t('settings.language.system'), '跟随系统');
  assert.equal(i18n.t('settings.language.zh'), '中文');
  assert.equal(i18n.t('settings.language.en'), 'English');
});
