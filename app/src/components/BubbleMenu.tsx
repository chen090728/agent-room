import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type ViewInstance } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, shadows } from '../theme';

const MENU_WIDTH = 220;
const GAP = 8;
/** Fast at the start, then eases into place — reads as scaling out of the button. */
const OPEN_TIMING = { duration: 260, easing: Easing.bezier(0.16, 1, 0.3, 1) };
const CLOSE_TIMING = { duration: 170, easing: Easing.in(Easing.cubic) };

export interface BubbleAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Finds where a "+" button is, so a BubbleMenu can scale out of it. Put
 * `rootRef` / `onLayout` on the screen's full-size container and `plusRef` on
 * a wrapper around the button (with `collapsable={false}`), then call
 * `measure(() => setOpen(true))` when the button is pressed.
 */
export function useBubbleAnchor(topInset: number) {
  const rootRef = useRef<ViewInstance>(null);
  const plusRef = useRef<ViewInstance>(null);
  const rootSize = useRef({ width: 0, height: 0 });
  const [anchor, setAnchor] = useState<BubbleAnchor | null>(null);

  const onLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    rootSize.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height };
  };

  const measure = (done: () => void) => {
    const fallback = (): BubbleAnchor => ({ x: Math.max(8, rootSize.current.width - 16 - 48), y: topInset + 14, width: 48, height: 48 });
    const use = (a: BubbleAnchor) => {
      setAnchor(a);
      done();
    };
    const plus = plusRef.current;
    const root = rootRef.current;
    if (!plus || !root) return use(fallback());
    plus.measureLayout(
      root,
      (x, y, width, height) => use(width <= 0 || height <= 0 ? fallback() : { x, y, width, height }),
      () => use(fallback()),
    );
  };

  return { rootRef, plusRef, onLayout, anchor, measure };
}

export interface BubbleMenuItem {
  label: string;
  icon: ReactNode;
  onPress: () => void;
}

function menuPosition(anchor: BubbleAnchor): { left: number; top: number } {
  return {
    left: Math.max(8, anchor.x + anchor.width - MENU_WIDTH),
    top: anchor.y + anchor.height + GAP,
  };
}

/**
 * White rounded card that scales out from `anchor` (the header plus button).
 * A full-screen press target behind it closes the menu.
 */
export function BubbleMenu({
  open,
  anchor,
  items,
  onClose,
}: {
  open: boolean;
  anchor: BubbleAnchor | null;
  items: BubbleMenuItem[];
  onClose: () => void;
}) {
  const [present, setPresent] = useState(false);
  const shown = useRef(false);
  const attached = useRef(false);
  const alive = useRef(true);
  const openRef = useRef(open);
  openRef.current = open;
  const progress = useSharedValue(0);
  const menuLeft = useSharedValue(0);
  const menuTop = useSharedValue(0);
  const anchorX = useSharedValue(0);
  const anchorY = useSharedValue(0);
  const anchorW = useSharedValue(0);
  const anchorH = useSharedValue(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const hide = () => {
    if (!alive.current || openRef.current) return;
    shown.current = false;
    attached.current = false;
    setPresent(false);
  };

  useLayoutEffect(() => {
    if (anchor) {
      const pos = menuPosition(anchor);
      menuLeft.value = pos.left;
      menuTop.value = pos.top;
      anchorX.value = anchor.x;
      anchorY.value = anchor.y;
      anchorW.value = anchor.width;
      anchorH.value = anchor.height;
    }

    if (open) {
      shown.current = true;
      if (!present) {
        progress.value = 0;
        setPresent(true);
        return;
      }
      // Still mounted from a close that was interrupted: grow back out.
      if (attached.current) progress.value = withTiming(1, OPEN_TIMING);
      return;
    }

    if (!shown.current) return;
    progress.value = withTiming(0, CLOSE_TIMING, (finished) => {
      if (finished) scheduleOnRN(hide);
    });
  }, [anchor, anchorH, anchorW, anchorX, anchorY, menuLeft, menuTop, open, present, progress]);

  const onMenuLayout = () => {
    const firstLayout = !attached.current;
    attached.current = true;
    if (firstLayout && openRef.current) {
      progress.value = 0;
      progress.value = withTiming(1, OPEN_TIMING);
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    const scale = 0.12 + 0.88 * progress.value;
    const opacity = interpolate(progress.value, [0, 0.4, 1], [0, 1, 1], Extrapolation.CLAMP);
    // Origin is the plus button's center, in the menu's own coordinates.
    // It sits above the card, so the card scales out from the button.
    const originX = anchorX.value + anchorW.value / 2 - menuLeft.value;
    const originY = anchorY.value + anchorH.value / 2 - menuTop.value;
    return {
      opacity,
      transformOrigin: [originX, originY, 0],
      transform: [{ scale }],
    };
  });

  if (!present || !anchor) return null;
  const pos = menuPosition(anchor);

  return (
    <>
      <Pressable accessibilityLabel="关闭菜单" collapsable={false} onPress={onClose} style={styles.backdrop} />
      <Animated.View collapsable={false} onLayout={onMenuLayout} style={[styles.menu, pos, animatedStyle]}>
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => {
              onClose();
              item.onPress();
            }}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
          >
            {item.icon}
            <Text style={styles.itemText}>{item.label}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 30,
    backgroundColor: 'transparent',
  },
  menu: {
    position: 'absolute',
    zIndex: 31,
    width: MENU_WIDTH,
    padding: 6,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.popover,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 48,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  itemPressed: { backgroundColor: colors.selected },
  itemText: { fontSize: 15, color: colors.text },
});
