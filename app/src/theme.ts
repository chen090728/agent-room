export const colors = {
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

export const shadows = {
  float: '0 6px 20px rgba(0,0,0,0.07)',
  composer: '0 8px 24px rgba(0,0,0,0.07)',
  card: '0 1px 2px rgba(0,0,0,0.03)',
  button: '0 8px 24px rgba(0,0,0,0.14)',
  segment: '0 1px 3px rgba(0,0,0,0.07)',
  popover: '0 12px 32px rgba(0,0,0,0.12)',
  bar: '0 8px 24px rgba(0,0,0,0.08)',
};

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
