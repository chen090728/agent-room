import { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { colors, orbPalette, type OrbColor } from '../theme';

export interface OrbCircle {
  cx: number;
  cy: number;
  r: number;
  /** A color key renders a glossy orb; a plain color string renders a flat dot. */
  color: OrbColor | string;
  stroke?: string;
  strokeWidth?: number;
}

const isOrbColor = (c: string): c is OrbColor => c in orbPalette;

/** Draws one or more glossy gradient orbs in a single SVG. */
export function OrbSvg({ width, height, circles }: { width: number; height: number; circles: OrbCircle[] }) {
  // Gradient ids must be unique per SVG instance, and plain alphanumerics.
  const prefix = 'orb' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const used = [...new Set(circles.map((c) => c.color).filter(isOrbColor))];
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        {used.map((c) => (
          <RadialGradient key={c} id={`${prefix}${c}`} cx="32%" cy="28%" r="78%" fx="32%" fy="28%">
            <Stop offset="0" stopColor={orbPalette[c].stops[0]} />
            <Stop offset="0.5" stopColor={orbPalette[c].stops[1]} />
            <Stop offset="1" stopColor={orbPalette[c].stops[2]} />
          </RadialGradient>
        ))}
      </Defs>
      {circles.map((c, i) => (
        <Circle
          key={i}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          fill={isOrbColor(c.color) ? `url(#${prefix}${c.color})` : c.color}
          stroke={c.stroke}
          strokeWidth={c.strokeWidth}
        />
      ))}
    </Svg>
  );
}

export function Orb({ color, size }: { color: OrbColor; size: number }) {
  const r = size / 2 - 0.5;
  return <OrbSvg width={size} height={size} circles={[{ cx: size / 2, cy: size / 2, r, color }]} />;
}

/** Large avatar preview with a soft highlight and a ground shadow. */
export function OrbPreview({ color }: { color: OrbColor }) {
  const prefix = 'big' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [a, b, c] = orbPalette[color].stops;
  return (
    <Svg width={112} height={124} viewBox="0 0 112 124" accessibilityLabel="头像预览">
      <Defs>
        <RadialGradient id={prefix} cx="32%" cy="28%" r="78%" fx="32%" fy="28%">
          <Stop offset="0" stopColor={a} />
          <Stop offset="0.5" stopColor={b} />
          <Stop offset="1" stopColor={c} />
        </RadialGradient>
      </Defs>
      <Ellipse cx={56} cy={116} rx={34} ry={6} fill="rgba(0,0,0,0.08)" />
      <Circle cx={56} cy={54} r={52} fill={`url(#${prefix})`} />
      <Ellipse cx={40} cy={30} rx={16} ry={9} fill="#FFFFFF" opacity={0.28} />
    </Svg>
  );
}

/** Overlapping orbs of up to three members, used as a group avatar. */
export function GroupAvatar({ memberColors, ring = colors.bg }: { memberColors: OrbColor[]; ring?: string }) {
  const c = memberColors.slice(0, 3);
  let circles: OrbCircle[];
  if (c.length >= 3) {
    circles = [
      { cx: 12, cy: 13, r: 8, color: c[0] },
      { cx: 24, cy: 13, r: 8, color: c[1], stroke: ring, strokeWidth: 1.5 },
      { cx: 18, cy: 24, r: 8, color: c[2], stroke: ring, strokeWidth: 1.5 },
    ];
  } else if (c.length === 2) {
    circles = [
      { cx: 13, cy: 18, r: 9, color: c[0] },
      { cx: 23, cy: 18, r: 9, color: c[1], stroke: ring, strokeWidth: 1.5 },
    ];
  } else if (c.length === 1) {
    circles = [{ cx: 18, cy: 18, r: 13, color: c[0] }];
  } else {
    circles = [{ cx: 18, cy: 18, r: 13, color: colors.idleDot }];
  }
  return <OrbSvg width={36} height={36} circles={circles} />;
}

/** A row of small orbs, e.g. member colors next to the group name. */
export function OrbRow({ memberColors, r = 6, gap = 4 }: { memberColors: (OrbColor | string)[]; r?: number; gap?: number }) {
  const step = r * 2 + gap;
  const width = Math.max(0, memberColors.length - 1) * step + r * 2 + 2;
  return (
    <OrbSvg
      width={width}
      height={r * 2 + 2}
      circles={memberColors.map((color, i) => ({ cx: r + 1 + i * step, cy: r + 1, r, color }))}
    />
  );
}
