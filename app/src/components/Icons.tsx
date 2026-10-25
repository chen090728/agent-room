import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { colors } from '../theme';

interface IconProps {
  size?: number;
  color?: string;
}

export function MenuIcon({ size = 20, color = colors.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round">
      <Line x1={4} y1={6.5} x2={20} y2={6.5} />
      <Line x1={4} y1={12} x2={17} y2={12} />
      <Line x1={4} y1={17.5} x2={11} y2={17.5} />
    </Svg>
  );
}

/** Filled speech bubble with a plus. */
export function NewChatIcon({ size = 20, color = colors.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" fill={color} />
      <Line x1={12} y1={8.5} x2={12} y2={15.5} stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={8.5} y1={12} x2={15.5} y2={12} stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function AddPersonIcon({ size = 21, color = colors.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={10} cy={8} r={4} />
      <Path d="M3 20c0-3.9 3.1-6.5 7-6.5 1.3 0 2.5.3 3.5.8" />
      <Line x1={18.5} y1={14} x2={18.5} y2={21} />
      <Line x1={15} y1={17.5} x2={22} y2={17.5} />
    </Svg>
  );
}

export function CloseIcon({ size = 18, color = colors.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round">
      <Line x1={6} y1={6} x2={18} y2={18} />
      <Line x1={18} y1={6} x2={6} y2={18} />
    </Svg>
  );
}

export function BackIcon({ size = 20, color = colors.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 5 8 12 15 19" />
    </Svg>
  );
}

export function PlusIcon({ size = 18, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

export function SendIcon({ size = 16, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={12} y1={19} x2={12} y2={5} />
      <Polyline points="6 11 12 5 18 11" />
    </Svg>
  );
}

export function LockIcon({ size = 12, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={5} y={11} width={14} height={9} rx={2} />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function SettingsIcon({ size = 20, color = colors.icon, knob = colors.bg }: IconProps & { knob?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round">
      <Line x1={4} y1={7} x2={20} y2={7} />
      <Line x1={4} y1={17} x2={20} y2={17} />
      <Circle cx={9} cy={7} r={2.5} fill={knob} />
      <Circle cx={15} cy={17} r={2.5} fill={knob} />
    </Svg>
  );
}

export function CheckIcon({ size = 14, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="5 12.5 10 17.5 19 7" />
    </Svg>
  );
}

/** A thin plus, used for "new conversation". */
export function ThinPlusIcon({ size = 20, color = colors.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
      <Line x1={12} y1={4.5} x2={12} y2={19.5} />
      <Line x1={4.5} y1={12} x2={19.5} y2={12} />
    </Svg>
  );
}

/** Squares with a plus: "create something new". */
export function NewMenuIcon({ size = 22, color = colors.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4} y={4} width={6.5} height={6.5} rx={1.6} />
      <Rect x={13.5} y={4} width={6.5} height={6.5} rx={1.6} />
      <Rect x={4} y={13.5} width={6.5} height={6.5} rx={1.6} />
      <Line x1={16.75} y1={13.5} x2={16.75} y2={20} />
      <Line x1={13.5} y1={16.75} x2={20} y2={16.75} />
    </Svg>
  );
}

export function SearchIcon({ size = 18, color = colors.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <Circle cx={10.5} cy={10.5} r={6.5} />
      <Line x1={15.5} y1={15.5} x2={20} y2={20} />
    </Svg>
  );
}

export function BranchIcon({ size = 14, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={6} cy={5} r={2.4} />
      <Circle cx={6} cy={19} r={2.4} />
      <Circle cx={18} cy={9} r={2.4} />
      <Path d="M6 7.4v9.2" />
      <Path d="M18 11.4c0 4-6 3-11 6.2" />
    </Svg>
  );
}

export function LinkIcon({ size = 20, color = colors.icon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <Path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 16, color = colors.textSecondary }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 5 16 12 9 19" />
    </Svg>
  );
}
