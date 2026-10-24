export const colors = {
  bg: '#F9F9F8',
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
};

export const ORB_COLORS = ['orange', 'blue', 'green', 'purple', 'red', 'graphite'] as const;
export type OrbColor = (typeof ORB_COLORS)[number];

/** Radial gradient stops (highlight, body, edge) for each glossy orb color. */
export const orbPalette: Record<OrbColor, { stops: [string, string, string]; label: string }> = {
  orange: { stops: ['#FFE0CC', '#F4844F', '#D2562A'], label: '橙色' },
  blue: { stops: ['#DCE6FF', '#6A8FF7', '#2E57D2'], label: '蓝色' },
  green: { stops: ['#D3F5E4', '#3EC08A', '#148A5A'], label: '绿色' },
  purple: { stops: ['#E8E0FF', '#9478F2', '#5C3FCF'], label: '紫色' },
  red: { stops: ['#FFD9DA', '#EE6B6E', '#C73C40'], label: '红色' },
  graphite: { stops: ['#EDEDED', '#7A7A7A', '#2A2A2A'], label: '石墨' },
};
