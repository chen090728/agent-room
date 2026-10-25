/**
 * Light and dark color roles.
 *
 * `lightColors` / `lightShadows` are the palette the app paints today, including
 * values that are still hardcoded in screens (placeholder, bubbles, sheet, …).
 * Those light values match the literals exactly, so step 2 can switch a screen
 * to `useTheme()` without changing how light mode looks.
 *
 * Dark mode is a warm gray, in the vein of Claude and Grok Bot: the page is
 * not pure black, cards sit a step lighter, and text is a soft off-white.
 * Mac window dots and assistant avatar colors are not in here — they stay
 * constant in both modes (`MAC_DOTS`, `COLOR_HEX` in `theme.ts`).
 */

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  /** Page background (chat, settings, sheets). */
  bg: string;
  /** Home list background. A hair lighter than `bg` in both modes. */
  homeBg: string;
  /** Cards, round buttons, assistant bubbles, menus. */
  surface: string;
  /** Primary text. */
  text: string;
  /** Secondary / meta text. */
  textSecondary: string;
  /** Default icon stroke. */
  icon: string;
  /** Card and bubble borders. */
  border: string;
  /** Faint border on floating bars and menus. */
  hairline: string;
  /** Row and field separators. */
  divider: string;
  /** Pressed rows, chips, code blocks, segment track. */
  selected: string;
  /** Switch track when off. */
  switchOff: string;
  /** Switch track when on. */
  switchOn: string;
  /** Relay dots that have not completed. */
  idleDot: string;
  /** Static dim over the page. Sheets animate `scrim` instead. */
  overlay: string;
  /** Warnings and in-progress states (banner, "部署中", "等你确认"). */
  warning: string;
  /** Errors, destructive actions, deletions. */
  danger: string;
  /** TextInput placeholder. */
  placeholder: string;
  /** Unread / pending dot on the home list. */
  pending: string;
  /** Online, merged, additions. */
  success: string;
  /** Fallback fill behind a photo before it loads. */
  photoPlaceholder: string;
  /** Composer, search field, and other text inputs. */
  input: string;
  /** Bottom sheet background. */
  sheet: string;
  /** Popover / bubble menu background. */
  menu: string;
  /** The user's message bubble. */
  mineBubble: string;
  /** Text on `mineBubble`. */
  mineBubbleText: string;
  /** An assistant's message bubble. */
  assistantBubble: string;
  /** Text on `assistantBubble`. */
  assistantBubbleText: string;
  /** Primary button fill. */
  button: string;
  /** Label and icon on `button`. */
  buttonText: string;
  /** Secondary button fill (for example "拒绝"). */
  secondaryButton: string;
  /** Switch knob on the off track. */
  knob: string;
  /** Switch knob on the on track. Light mode matches `knob`. */
  knobOn: string;
  /** Sheet drag handle. */
  handle: string;
  /** Unchecked circle border. */
  checkOff: string;
  /** Selected swatch ring in the avatar picker. */
  ring: string;
  /** Solid color sheets dim with (opacity is animated separately). */
  scrim: string;
  /** Border of the round icon buttons. */
  roundBorder: string;
}

export interface ThemeShadows {
  float: string;
  composer: string;
  card: string;
  button: string;
  segment: string;
  popover: string;
  bar: string;
  /** Top shadow of a bottom sheet. */
  sheet: string;
  /** Switch knob. */
  knob: string;
}

export const lightColors: ThemeColors = {
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
  switchOn: '#1F1F1F',
  idleDot: '#DEDDD9',
  overlay: 'rgba(20,20,20,0.22)',
  warning: '#B4461D',
  danger: '#C73C40',
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
  handle: '#D8D7D3',
  checkOff: '#D5D4CF',
  ring: '#BDBDBD',
  scrim: '#000000',
  roundBorder: 'rgba(0,0,0,0.04)',
};

export const darkColors: ThemeColors = {
  bg: '#23211E',
  homeBg: '#282622',
  surface: '#302E2A',
  text: '#E8E3DA',
  textSecondary: '#AFA99E',
  icon: '#D8D2C8',
  border: '#413E38',
  hairline: 'rgba(255,244,230,0.08)',
  divider: '#35332E',
  selected: '#3A3833',
  switchOff: '#3F3C37',
  switchOn: '#E8E3DA',
  idleDot: '#4A4741',
  overlay: 'rgba(12,10,8,0.62)',
  warning: '#E0976A',
  danger: '#F09497',
  placeholder: '#A6A094',
  pending: '#E08A55',
  success: '#5EBE8A',
  photoPlaceholder: '#3A3833',
  input: '#3A3732',
  sheet: '#23211E',
  menu: '#302E2A',
  mineBubble: '#E4DFD4',
  mineBubbleText: '#23211E',
  assistantBubble: '#302E2A',
  assistantBubbleText: '#E8E3DA',
  button: '#E8E3DA',
  buttonText: '#23211E',
  secondaryButton: '#3A3833',
  knob: '#F3F0EA',
  knobOn: '#2A2824',
  handle: '#5C5852',
  checkOff: '#5C5852',
  ring: '#8C877E',
  scrim: '#100E0C',
  roundBorder: 'rgba(255,244,230,0.10)',
};

export const lightShadows: ThemeShadows = {
  float: '0 6px 20px rgba(0,0,0,0.07)',
  composer: '0 8px 24px rgba(0,0,0,0.07)',
  card: '0 1px 2px rgba(0,0,0,0.03)',
  button: '0 8px 24px rgba(0,0,0,0.14)',
  segment: '0 1px 3px rgba(0,0,0,0.07)',
  popover: '0 12px 32px rgba(0,0,0,0.12)',
  bar: '0 8px 24px rgba(0,0,0,0.08)',
  sheet: '0 -8px 32px rgba(0,0,0,0.18)',
  knob: '0 1px 3px rgba(0,0,0,0.2)',
};

export const darkShadows: ThemeShadows = {
  float: '0 6px 20px rgba(0,0,0,0.36)',
  composer: '0 8px 24px rgba(0,0,0,0.42)',
  card: '0 1px 2px rgba(0,0,0,0.28)',
  button: '0 8px 24px rgba(0,0,0,0.38)',
  segment: '0 1px 3px rgba(0,0,0,0.32)',
  popover: '0 12px 32px rgba(0,0,0,0.5)',
  bar: '0 8px 24px rgba(0,0,0,0.4)',
  sheet: '0 -8px 32px rgba(0,0,0,0.5)',
  knob: '0 1px 3px rgba(0,0,0,0.4)',
};

function sameKeys(a: object, b: object): boolean {
  const ak = Object.keys(a).sort();
  const bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((key, i) => key === bk[i]);
}

if (!sameKeys(lightColors, darkColors)) throw new Error('light and dark color roles diverged');
if (!sameKeys(lightShadows, darkShadows)) throw new Error('light and dark shadow roles diverged');

export function paletteFor(scheme: ColorScheme): { colors: ThemeColors; shadows: ThemeShadows } {
  return scheme === 'dark'
    ? { colors: darkColors, shadows: darkShadows }
    : { colors: lightColors, shadows: lightShadows };
}

/**
 * Value for expo-status-bar's `style`.
 * `dark` means dark icons (light page); `light` means light icons (dark page).
 */
export function statusBarFor(scheme: ColorScheme): 'light' | 'dark' {
  return scheme === 'dark' ? 'light' : 'dark';
}
