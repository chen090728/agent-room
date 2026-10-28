// @ts-nocheck
// Run with Node's type stripper (`node --experimental-strip-types --test`).
// The app tsconfig does not include Node types, and this file is not part of the UI bundle.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { darkColors, darkShadows, lightColors, lightShadows, paletteFor, statusBarFor, type ThemeColors } from './palette.ts';
import { THEME_PREFERENCE_LABELS, THEME_STORAGE_KEY, createThemePreferenceStore, parseThemePreference, resolveColorScheme, type ThemeKeyValueStore } from './preference.ts';

const ORIGINAL_COLORS = {
  bg: '#F9F9F8',
  homeBg: '#FBFBFA',
  surface: '#FFFFFF',
  text: '#1F1F1F',
  textSecondary: '#6B6B6B',
  icon: '#2A2A2A',
  border: '#EDECE8',
  hairline: 'rgba(0,0,0,0.05)',
  divider: '#F0EFEB',
  selected: '#EFEEEA',
  switchOff: '#E3E2DE',
  idleDot: '#DEDDD9',
  overlay: 'rgba(20,20,20,0.22)',
  warning: '#B4461D',
  danger: '#C73C40',
};

const ORIGINAL_SHADOWS = {
  float: '0 6px 20px rgba(0,0,0,0.07)',
  composer: '0 8px 24px rgba(0,0,0,0.07)',
  card: '0 1px 2px rgba(0,0,0,0.03)',
  button: '0 8px 24px rgba(0,0,0,0.14)',
  segment: '0 1px 3px rgba(0,0,0,0.07)',
  popover: '0 12px 32px rgba(0,0,0,0.12)',
  bar: '0 8px 24px rgba(0,0,0,0.08)',
};

/** Light values for roles that are still written as literals in screens. */
const LIGHT_LITERALS = {
  placeholder: '#A3A3A0',
  pending: '#E0703F',
  success: '#148A5A',
  photoPlaceholder: '#E7E6E2',
  input: '#FFFFFF',
  sheet: '#F9F9F8',
  menu: '#FFFFFF',
  mineBubble: '#1F1F1F',
  mineBubbleText: '#FFFFFF',
  assistantBubble: '#FFFFFF',
  assistantBubbleText: '#1F1F1F',
  button: '#1F1F1F',
  buttonText: '#FFFFFF',
  secondaryButton: '#EFEEEA',
  knob: '#FFFFFF',
  knobOn: '#FFFFFF',
  switchOn: '#1F1F1F',
  handle: '#D8D7D3',
  checkOff: '#D5D4CF',
  ring: '#BDBDBD',
  scrim: '#000000',
  roundBorder: 'rgba(0,0,0,0.04)',
  sheetShadow: '0 -8px 32px rgba(0,0,0,0.18)',
  knobShadow: '0 1px 3px rgba(0,0,0,0.2)',
};

function keys(value: object): string[] {
  return Object.keys(value).sort();
}

function channel(hex: string, index: number): number {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}

function luminance(hex: string): number {
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const r = linear(channel(hex, 0) / 255);
  const g = linear(channel(hex, 1) / 255);
  const b = linear(channel(hex, 2) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('light and dark palettes have the same roles', () => {
  assert.deepEqual(keys(lightColors), keys(darkColors));
  assert.deepEqual(keys(lightShadows), keys(darkShadows));
  assert.deepEqual(keys(paletteFor('light').colors), keys(paletteFor('dark').colors));
});

test('light palette keeps the original colors and the current hardcoded literals', () => {
  for (const [key, value] of Object.entries(ORIGINAL_COLORS)) {
    assert.equal(lightColors[key as keyof ThemeColors], value, key);
  }
  for (const [key, value] of Object.entries(ORIGINAL_SHADOWS)) {
    assert.equal(lightShadows[key as keyof typeof lightShadows], value, key);
  }
  for (const [key, value] of Object.entries(LIGHT_LITERALS)) {
    if (key === 'sheetShadow') assert.equal(lightShadows.sheet, value);
    else if (key === 'knobShadow') assert.equal(lightShadows.knob, value);
    else assert.equal(lightColors[key as keyof ThemeColors], value, key);
  }
});

test('dark palette follows the Claude app: near-black page, warm white text, layers by brightness', () => {
  assert.equal(darkColors.bg, '#111111');
  assert.equal(darkColors.homeBg, '#111111');
  assert.equal(darkColors.surface, '#1E1E1D');
  assert.equal(darkColors.sheet, '#1E1E1D');
  assert.equal(darkColors.menu, '#262625');
  assert.equal(darkColors.input, '#262625');
  assert.equal(darkColors.selected, '#404040');
  assert.equal(darkColors.text, '#F9F9F7');
  assert.equal(darkColors.textSecondary, '#C3C2B8');
  assert.equal(darkColors.placeholder, '#8A8984');
  assert.equal(darkColors.mineBubble, '#2A2A28');
  assert.equal(darkColors.mineBubbleText, '#F9F9F7');
  assert.equal(darkColors.button, '#F2F2F2');
  assert.equal(darkColors.buttonText, '#1F1F1E');
  assert.equal(darkColors.accent, '#F2F2F2');
  assert.equal(darkColors.accentIcon, '#1F1F1E');
  for (const key of ['border', 'hairline', 'divider', 'roundBorder'] as const) assert.equal(darkColors[key], '#2A2A28', key);
  assert.equal(darkColors.scrim, '#000000');

  // Greys stay neutral or a touch warm (never blue).
  for (const [name, hex] of [
    ['bg', darkColors.bg],
    ['surface', darkColors.surface],
    ['input', darkColors.input],
    ['selected', darkColors.selected],
    ['text', darkColors.text],
    ['textSecondary', darkColors.textSecondary],
  ]) {
    const r = channel(hex, 0);
    const b = channel(hex, 2);
    assert.ok(b <= r && r - b <= 12, `${name} should be neutral or warm`);
  }

  assert.ok(luminance(darkColors.bg) < 0.01, 'page is near black');
  assert.ok(luminance(darkColors.surface) > luminance(darkColors.bg) + 0.003);
  assert.ok(luminance(darkColors.input) > luminance(darkColors.surface) + 0.003);
  assert.ok(luminance(darkColors.selected) > luminance(darkColors.input) + 0.01);

  // Every fill that primary or secondary text is actually painted on.
  const textLayers = [
    darkColors.bg,
    darkColors.homeBg,
    darkColors.surface,
    darkColors.input,
    darkColors.sheet,
    darkColors.menu,
    darkColors.selected,
    darkColors.assistantBubble,
    darkColors.mineBubble,
    darkColors.secondaryButton,
  ];
  for (const surface of textLayers) {
    const primary = contrast(darkColors.text, surface);
    const secondary = contrast(darkColors.textSecondary, surface);
    assert.ok(primary >= 4.5, `text on ${surface} is ${primary.toFixed(2)}`);
    assert.ok(secondary >= 4.5, `secondary text on ${surface} is ${secondary.toFixed(2)}`);
  }
  // Placeholders are the "weaker" grey; they only need to be legible as hints.
  for (const surface of [darkColors.input, darkColors.surface]) {
    const ratio = contrast(darkColors.placeholder, surface);
    assert.ok(ratio >= 3, `placeholder on ${surface} is ${ratio.toFixed(2)}`);
  }
  assert.ok(contrast(darkColors.mineBubbleText, darkColors.mineBubble) >= 7);
  assert.ok(contrast(darkColors.assistantBubbleText, darkColors.assistantBubble) >= 7);
  assert.ok(contrast(darkColors.buttonText, darkColors.button) >= 7);
  assert.ok(contrast(darkColors.accentIcon, darkColors.accent) >= 7);
  for (const surface of [darkColors.bg, darkColors.homeBg, darkColors.surface, darkColors.sheet, darkColors.input, darkColors.selected]) {
    assert.ok(contrast(darkColors.warning, surface) >= 4.5, `warning on ${surface}`);
    assert.ok(contrast(darkColors.danger, surface) >= 4.5, `danger on ${surface}`);
    assert.ok(contrast(darkColors.success, surface) >= 4.5, `success on ${surface}`);
  }

  const hairline = '0 0 0 1px #2A2A28';
  const none = '0 0 0 0 rgba(0,0,0,0)';
  assert.equal(darkShadows.sheet, hairline);
  assert.equal(darkShadows.segment, hairline);
  for (const key of ['float', 'composer', 'card', 'button', 'popover', 'bar', 'knob']) {
    assert.equal(darkShadows[key], none, key);
  }
  for (const value of Object.values(lightShadows)) {
    assert.ok(!Object.values(darkShadows).includes(value), 'dark mode must not reuse a light drop shadow');
  }
});

test('light mode accent matches the existing round buttons', () => {
  assert.equal(lightColors.accent, lightColors.surface);
  assert.equal(lightColors.accentIcon, lightColors.icon);
});

test('status bar style is inverted from the page scheme', () => {
  assert.equal(statusBarFor('light'), 'dark');
  assert.equal(statusBarFor('dark'), 'light');
});

test('Mac dots and avatar colors are unchanged', () => {
  const source = readFileSync(new URL('../theme.ts', import.meta.url), 'utf8');
  for (const hex of ['#FF5F57', '#E0443E', '#FEBC2E', '#DEA123', '#28C840', '#1AAB29']) {
    assert.ok(source.includes(hex), hex);
  }
  for (const hex of ['#1F1F1F', '#8B6343', '#E5484D', '#EE7032', '#F2A33A', '#4CC277', '#4FB9A8', '#3E86F5', '#8B5CF6', '#EC4899', '#7A7A7A']) {
    assert.ok(source.includes(`'${hex}'`) || source.includes(`"${hex}"`), hex);
  }
});

test('resolveColorScheme lets an explicit choice beat the system', () => {
  assert.equal(resolveColorScheme('system', 'dark'), 'dark');
  assert.equal(resolveColorScheme('system', 'light'), 'light');
  assert.equal(resolveColorScheme('system', null), 'light');
  assert.equal(resolveColorScheme('system', undefined), 'light');
  assert.equal(resolveColorScheme('light', 'dark'), 'light');
  assert.equal(resolveColorScheme('dark', 'light'), 'dark');
  assert.equal(resolveColorScheme('dark', null), 'dark');
});

test('parseThemePreference falls back to system', () => {
  assert.equal(parseThemePreference('dark'), 'dark');
  assert.equal(parseThemePreference('light'), 'light');
  assert.equal(parseThemePreference('system'), 'system');
  assert.equal(parseThemePreference(null), 'system');
  assert.equal(parseThemePreference(undefined), 'system');
  assert.equal(parseThemePreference(''), 'system');
  assert.equal(parseThemePreference('nope'), 'system');
  assert.equal(THEME_STORAGE_KEY, 'agenthub.theme');
  assert.deepEqual(Object.keys(THEME_PREFERENCE_LABELS).sort(), ['dark', 'light', 'system']);
});

function memory(initial?: string): ThemeKeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(THEME_STORAGE_KEY, initial);
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
  };
}

test('preference store hydrates, persists, and notifies', async () => {
  const storage = memory('dark');
  const store = createThemePreferenceStore(storage);
  assert.equal(store.getReady(), false);
  assert.equal(store.getPreference(), 'system');

  let seen = 0;
  const unsubscribe = store.subscribe(() => {
    seen += 1;
  });
  await store.hydrate();
  assert.equal(store.getPreference(), 'dark');
  assert.equal(store.getReady(), true);
  assert.equal(seen, 1);

  await store.hydrate();
  assert.equal(seen, 1, 'a second hydrate does not read storage again');

  await store.setPreference('light');
  assert.equal(store.getPreference(), 'light');
  assert.equal(storage.data.get(THEME_STORAGE_KEY), 'light');
  assert.ok(seen >= 2);

  unsubscribe();
  const before = seen;
  await store.setPreference('system');
  assert.equal(seen, before);
  assert.equal(store.getPreference(), 'system');
});

test('a choice made while hydrating is not overwritten by stale storage', async () => {
  let release: (value: string | null) => void = () => {};
  const storage: ThemeKeyValueStore = {
    getItem: () => new Promise((resolve) => {
      release = resolve;
    }),
    setItem: async () => {},
  };
  const store = createThemePreferenceStore(storage);
  const pending = store.hydrate();
  await store.setPreference('dark');
  release('light');
  await pending;
  assert.equal(store.getPreference(), 'dark');
});

test('a failed write rolls the preference back', async () => {
  const store = createThemePreferenceStore({
    getItem: async () => 'light',
    setItem: async () => {
      throw new Error('disk');
    },
  });
  await store.hydrate();
  await assert.rejects(() => store.setPreference('dark'), /disk/);
  assert.equal(store.getPreference(), 'light');
});

test('corrupt storage and a failed read both settle on system', async () => {
  const corrupt = createThemePreferenceStore(memory('nope'));
  await corrupt.hydrate();
  assert.equal(corrupt.getPreference(), 'system');
  assert.equal(corrupt.getReady(), true);

  const broken = createThemePreferenceStore({
    getItem: async () => {
      throw new Error('io');
    },
    setItem: async () => {},
  });
  await broken.hydrate();
  assert.equal(broken.getPreference(), 'system');
  assert.equal(broken.getReady(), true);
});
