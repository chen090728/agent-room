import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';
import { COLOR_HEX, MAC_DOTS, type Avatar } from '../theme';

const STAR = '20,4 24.5,14.5 36,15.5 27.2,23 30,34.5 20,28.5 10,34.5 12.8,23 4,15.5 15.5,14.5';

const f = (n: number) => n.toFixed(2);

/** Rotates a point by `deg` degrees around (cx, cy). */
function rotateAround(cx: number, cy: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return (x: number, y: number) => `${f(cx + (x - cx) * cos - (y - cy) * sin)} ${f(cy + (x - cx) * sin + (y - cy) * cos)}`;
}

/** A rounded rectangle rotated around (cx, cy), as path data (so no transform props are needed). */
function roundedRect(x: number, y: number, w: number, h: number, r: number, deg: number, cx = x + w / 2, cy = y + h / 2) {
  const p = rotateAround(cx, cy, deg);
  const arc = `A ${r} ${r} 0 0 1`;
  return [
    `M ${p(x + r, y)}`,
    `L ${p(x + w - r, y)} ${arc} ${p(x + w, y + r)}`,
    `L ${p(x + w, y + h - r)} ${arc} ${p(x + w - r, y + h)}`,
    `L ${p(x + r, y + h)} ${arc} ${p(x, y + h - r)}`,
    `L ${p(x, y + r)} ${arc} ${p(x + r, y)} Z`,
  ].join(' ');
}

/** An ellipse rotated around its own centre. */
function tiltedEllipse(cx: number, cy: number, rx: number, ry: number, deg: number) {
  const p = rotateAround(cx, cy, deg);
  return `M ${p(cx - rx, cy)} A ${rx} ${ry} ${deg} 1 1 ${p(cx + rx, cy)} A ${rx} ${ry} ${deg} 1 1 ${p(cx - rx, cy)} Z`;
}

/** Eyes are two tilted white pills; `dy` moves them for shapes whose face sits lower. */
function Eyes({ dy = 0 }: { dy?: number }) {
  return (
    <>
      <Path d={roundedRect(14.6, 15 + dy, 3.4, 7, 1.7, -18, 16.3, 18.5 + dy)} fill="#FFFFFF" />
      <Path d={roundedRect(22, 15 + dy, 3.4, 7, 1.7, -18, 23.7, 18.5 + dy)} fill="#FFFFFF" />
    </>
  );
}

function Body({ shape, fill }: { shape: Avatar['shape']; fill: string }) {
  const rounded = { fill, stroke: fill, strokeLinejoin: 'round' as const };
  switch (shape) {
    case 'circle':
      return (
        <>
          <Circle cx={20} cy={20} r={16} fill={fill} />
          <Eyes />
        </>
      );
    case 'cloud':
      return (
        <>
          <Circle cx={13} cy={23} r={10} fill={fill} />
          <Circle cx={27} cy={23} r={10} fill={fill} />
          <Circle cx={20} cy={14} r={10} fill={fill} />
          <Circle cx={20} cy={27} r={10} fill={fill} />
          <Eyes />
        </>
      );
    case 'square':
      return (
        <>
          <Path d={roundedRect(6, 6, 28, 28, 8, -14, 20, 20)} fill={fill} />
          <Eyes />
        </>
      );
    case 'flower':
      return (
        <>
          <Circle cx={13} cy={13} r={8.5} fill={fill} />
          <Circle cx={27} cy={13} r={8.5} fill={fill} />
          <Circle cx={13} cy={27} r={8.5} fill={fill} />
          <Circle cx={27} cy={27} r={8.5} fill={fill} />
          <Circle cx={20} cy={20} r={11} fill={fill} />
          <Eyes />
        </>
      );
    case 'egg':
      return (
        <>
          <Path d={tiltedEllipse(20, 21, 14, 16, -14)} fill={fill} />
          <Eyes />
        </>
      );
    case 'hexagon':
      return (
        <>
          <Polygon points="20,6 32.5,13 32.5,27 20,34 7.5,27 7.5,13" strokeWidth={5} {...rounded} />
          <Eyes />
        </>
      );
    case 'triangle':
      return (
        <>
          <Polygon points="20,7 34,32 6,32" strokeWidth={6} {...rounded} />
          <Eyes dy={6} />
        </>
      );
    case 'capsule':
      return (
        <>
          <Path d={roundedRect(3, 10, 34, 21, 10.5, -10, 20, 20)} fill={fill} />
          <Eyes />
        </>
      );
    case 'star':
      return (
        <>
          <Polygon points={STAR} strokeWidth={4} {...rounded} />
          <Eyes />
        </>
      );
    case 'diamond':
      return (
        <>
          <Polygon points="20,5 35,20 20,35 5,20" strokeWidth={5} {...rounded} />
          <Eyes />
        </>
      );
    case 'drop':
      return (
        <>
          <Path d="M20 4C27 12 32 18 32 25a12 12 0 0 1-24 0C8 18 13 12 20 4z" fill={fill} />
          <Eyes dy={5} />
        </>
      );
    case 'bean':
      return (
        <>
          <Circle cx={14.5} cy={20} r={11.5} fill={fill} />
          <Circle cx={26} cy={22} r={11} fill={fill} />
          <Eyes />
        </>
      );
  }
}

/** A member's avatar: a plain-coloured blob with white eyes. */
export function Blob({ avatar, size }: { avatar: Avatar; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Body shape={avatar.shape} fill={COLOR_HEX[avatar.color]} />
    </Svg>
  );
}

/** Up to three member avatars overlapping, used for groups; one member shows full size. */
export function GroupAvatar({ avatars, size = 50 }: { avatars: Avatar[]; size?: number }) {
  const a = avatars.slice(0, 3);
  const k = size / 50;
  const place = (i: number, x: number, y: number, s: number) => (
    <View key={i} style={[styles.abs, { left: x * k, top: y * k }]}>
      <Blob avatar={a[i]} size={s * k} />
    </View>
  );
  return (
    <View style={{ width: size, height: size }}>
      {a.length >= 3
        ? [place(0, 0, 1, 28), place(1, 22, 1, 28), place(2, 11, 22, 28)]
        : a.length === 2
          ? [place(0, 0, 10, 30), place(1, 20, 10, 30)]
          : a.length === 1
            ? [place(0, 0, 0, 50)]
            : null}
    </View>
  );
}

/** The silhouette shown for "me" until a profile avatar is chosen. */
export function MeAvatar({ avatar, size = 38 }: { avatar: Avatar | null; size?: number }) {
  const gradient = 'me' + useId().replace(/[^a-zA-Z0-9]/g, '');
  if (avatar) return <Blob avatar={avatar} size={size} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 38 38">
      <RadialGradient id={gradient} cx="32%" cy="28%" r="78%" fx="32%" fy="28%">
        <Stop offset="0" stopColor="#EDEDED" />
        <Stop offset="0.5" stopColor="#9A9A9A" />
        <Stop offset="1" stopColor="#5A5A5A" />
      </RadialGradient>
      <Circle cx={19} cy={19} r={19} fill={`url(#${gradient})`} />
      <Circle cx={19} cy={15} r={6} fill="#FFFFFF" opacity={0.9} />
      <Path d="M8.5 31c1.8-5 6-7.5 10.5-7.5s8.7 2.5 10.5 7.5" fill="#FFFFFF" opacity={0.9} />
    </Svg>
  );
}

/** The AgentHub mark: three window-control dots. `small` fits inside a title pill. */
export function MacDots({ small = false }: { small?: boolean }) {
  const r = small ? 4.6 : 5.5;
  const cx = small ? [5, 20, 35] : [6, 26, 46];
  const w = small ? 40 : 52;
  const h = small ? 10 : 12;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {MAC_DOTS.map((d, i) => (
        <Circle key={i} cx={cx[i]} cy={h / 2} r={r} fill={d.fill} stroke={d.stroke} strokeWidth={small ? 0.5 : 0.6} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({ abs: { position: 'absolute' } });
