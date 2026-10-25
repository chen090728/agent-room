import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createInstance } from 'i18next';
import { en } from './locales/en.ts';
import { zh } from './locales/zh.ts';
import { STRING_SOURCES } from './sources.ts';

function leaves(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (!value || typeof value !== 'object') return [];
  const out: string[] = [];
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(...leaves((value as Record<string, unknown>)[key], path));
  }
  return out;
}

const zhKeys = leaves(zh).sort();
const enKeys = leaves(en).sort();

test('Chinese and English catalogs have the same keys', () => {
  assert.deepEqual(enKeys, zhKeys);
  assert.ok(zhKeys.length > 0);
});

test('no translation is empty', () => {
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      assert.ok(value.trim().length > 0, path);
      return;
    }
    for (const key of Object.keys(value as Record<string, unknown>)) {
      walk((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
    }
  };
  walk(zh, '');
  walk(en, '');
});

test('every key has a source, and the mapping doc lists it', () => {
  const documented = new Set(Object.keys(STRING_SOURCES));
  assert.deepEqual([...documented].sort(), zhKeys);
  for (const key of zhKeys) assert.ok(STRING_SOURCES[key as keyof typeof STRING_SOURCES].length > 0, key);

  const doc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'STRINGS.md'), 'utf8');
  for (const key of zhKeys) assert.ok(doc.includes(`### ${key}\n`), `STRINGS.md missing ${key}`);
  assert.match(doc, /dark\/theme-foundation/);
  assert.match(doc, /settings\.appearance/);
  assert.match(doc, /settings\.language/);
});

test('i18next interpolates, pluralizes, and falls back between the two languages', async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: 'en',
    fallbackLng: { zh: ['en'], en: ['zh'], default: ['en'] },
    supportedLngs: ['zh', 'en'],
    interpolation: { escapeValue: false },
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
  });

  assert.equal(i18n.t('pr.moreFiles', { count: 1 }), '1 more file');
  assert.equal(i18n.t('pr.moreFiles', { count: 3 }), '3 more files');
  assert.equal(i18n.t('home.deleteTitle', { name: 'Ada' }), 'Delete “Ada”?');
  assert.equal(i18n.t('chat.placeholderDirect', { name: 'Ada' }), 'Message Ada');

  await i18n.changeLanguage('zh');
  assert.equal(i18n.t('pr.moreFiles', { count: 1 }), '另外 1 个文件');
  assert.equal(i18n.t('pr.moreFiles', { count: 3 }), '另外 3 个文件');
  assert.equal(i18n.t('home.deleteTitle', { name: '小青' }), '删除「小青」？');
  assert.equal(i18n.t('composer.maxFiles', { count: 6 }), '一条消息最多带 6 个文件');
  assert.equal(i18n.t('settings.appearance.system'), '跟随系统');
  assert.equal(i18n.t('settings.appearance.light'), '浅色');
  assert.equal(i18n.t('settings.appearance.dark'), '深色');
  assert.equal(i18n.t('settings.language.title'), '语言');
  assert.equal(i18n.t('settings.language.en'), 'English');

  await i18n.changeLanguage('en');
  assert.equal(i18n.t('settings.appearance.title'), 'Appearance');
  assert.equal(i18n.t('settings.language.system'), 'System');
  assert.equal(i18n.t('settings.language.zh'), '中文');
});
