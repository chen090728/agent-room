/**
 * Appearance tokens.
 *
 * `colors` and `shadows` stay the light palette so older imports keep working.
 * Screens read the active palette from `useTheme()` (see `theme/ThemeProvider.tsx`);
 * the light and dark values live in `theme/palette.ts`. Mac dots and avatar
 * colors below do not change with the mode.
 */
export {
  darkColors,
  darkShadows,
  lightColors,
  lightColors as colors,
  lightShadows,
  lightShadows as shadows,
  paletteFor,
  statusBarFor,
} from './theme/palette';
export type { ColorScheme, ThemeColors, ThemeShadows } from './theme/palette';

export { ThemeProvider, useTheme, useThemedStyles } from './theme/ThemeProvider';
export type { Theme } from './theme/ThemeProvider';

export {
  THEME_PREFERENCE_LABELS,
  THEME_STORAGE_KEY,
  createThemePreferenceStore,
  isThemePreference,
  parseThemePreference,
  resolveColorScheme,
} from './theme/preference';
export type { ThemeKeyValueStore, ThemePreference, ThemePreferenceStore } from './theme/preference';

// Avatars are coloured blobs with white eyes: 12 shapes x 11 colours.
export const AVATAR_SHAPES = ['circle', 'cloud', 'square', 'flower', 'egg', 'hexagon', 'triangle', 'capsule', 'star', 'diamond', 'drop', 'bean'] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

export const SHAPE_LABELS: Record<AvatarShape, string> = {
  circle: '圆形',
  cloud: '云朵',
  square: '方块',
  flower: '四叶花',
  egg: '蛋形',
  hexagon: '六边形',
  triangle: '三角',
  capsule: '胶囊',
  star: '星星',
  diamond: '菱形',
  drop: '水滴',
  bean: '豆子',
};

export const AVATAR_COLORS = ['black', 'brown', 'red', 'orange', 'apricot', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export const COLOR_HEX: Record<AvatarColor, string> = {
  black: '#1F1F1F',
  brown: '#8B6343',
  red: '#E5484D',
  orange: '#EE7032',
  apricot: '#F2A33A',
  green: '#4CC277',
  teal: '#4FB9A8',
  blue: '#3E86F5',
  purple: '#8B5CF6',
  pink: '#EC4899',
  gray: '#7A7A7A',
};

export const COLOR_LABELS: Record<AvatarColor, string> = {
  black: '黑色',
  brown: '棕色',
  red: '红色',
  orange: '橙色',
  apricot: '杏色',
  green: '绿色',
  teal: '青色',
  blue: '蓝色',
  purple: '紫色',
  pink: '粉色',
  gray: '灰色',
};

export interface Avatar {
  shape: AvatarShape;
  color: AvatarColor;
  /** An uploaded picture (a file in a group's storage) shown instead of the blob. */
  image?: { groupId: string; fileId: string };
}

/** The three window-control colours used as the AgentHub mark. */
export const MAC_DOTS = [
  { fill: '#FF5F57', stroke: '#E0443E' },
  { fill: '#FEBC2E', stroke: '#DEA123' },
  { fill: '#28C840', stroke: '#1AAB29' },
] as const;
