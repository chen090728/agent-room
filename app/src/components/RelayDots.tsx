import Svg, { Circle } from 'react-native-svg';
import { useAppTranslation } from '../i18n';
import type { RelayState } from '../protocol';
import { COLOR_HEX, useTheme } from '../theme';

/**
 * One dot per allowed relay step: finished steps take the colour of the member
 * who answered, the rest are grey. `r` is the dot radius, `gap` the space between dots.
 */
export function RelayDots({ relay, r = 3, gap = 4 }: { relay: RelayState; r?: number; gap?: number }) {
  const { t } = useAppTranslation();
  const { colors } = useTheme();
  const step = r * 2 + gap;
  const width = (relay.maxHops - 1) * step + r * 2;
  return (
    <Svg width={width} height={r * 2} viewBox={`0 0 ${width} ${r * 2}`} accessibilityLabel={t('chat.relay', { hop: relay.hop, max: relay.maxHops })}>
      {Array.from({ length: relay.maxHops }, (_, i) => {
        const done = i < relay.hop;
        const color = done ? COLOR_HEX[relay.trail[i] ?? 'gray'] : colors.idleDot;
        return <Circle key={i} cx={r + i * step} cy={r} r={done ? r : r * 0.87} fill={color} />;
      })}
    </Svg>
  );
}
