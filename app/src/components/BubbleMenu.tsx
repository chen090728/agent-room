import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type ViewInstance } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colors, shadows } from '../theme';
import { ThinPlusIcon } from './Icons';

const MENU_WIDTH = 220;
const GAP = 8;
const ITEM_HEIGHT = 48;
const MENU_PAD = 6;
const CARD_RADIUS = 20;
/** The circle grows into the card, then settles. */
const MENU_SPRING = { damping: 18, stiffness: 200, mass: 0.72 };

export interface BubbleAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Finds where a "+" button is, so a BubbleMenu can grow out of it. Put
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

function menuFrame(anchor: BubbleAnchor, itemCount: number) {
  const height = MENU_PAD * 2 + ITEM_HEIGHT * itemCount;
  return {
    left: Math.max(8, anchor.x + anchor.width - MENU_WIDTH),
    top: anchor.y + anchor.height + GAP,
    width: MENU_WIDTH,
    height,
  };
}

/**
 * The "+" button itself grows into a rounded card, then shrinks back into the
 * button. `onVisibility` stays true until the close spring has finished, so
 * the real button can hide for the whole morph.
 */
export function BubbleMenu({
  open,
  anchor,
  items,
  onClose,
  onVisibility,
}: {
  open: boolean;
  anchor: BubbleAnchor | null;
  items: BubbleMenuItem[];
  onClose: () => void;
  onVisibility?: (visible: boolean) => void;
}) {
  const [present, setPresent] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const shown = useRef(false);
  const alive = useRef(true);
  const openRef = useRef(open);
  openRef.current = open;
  const progress = useSharedValue(0);
  const fromLeft = useSharedValue(0);
  const fromTop = useSharedValue(0);
  const fromW = useSharedValue(48);
  const fromH = useSharedValue(48);
  const toLeft = useSharedValue(0);
  const toTop = useSharedValue(0);
  const toH = useSharedValue(108);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const hide = () => {
    if (!alive.current || openRef.current) return;
    shown.current = false;
    setInteractive(false);
    setPresent(false);
  };

  useEffect(() => {
    onVisibility?.(present);
  }, [onVisibility, present]);

  useAnimatedReaction(
    () => progress.value > 0.72,
    (ready, previous) => {
      if (ready !== previous) scheduleOnRN(setInteractive, ready);
    },
  );

  useLayoutEffect(() => {
    if (anchor) {
      const frame = menuFrame(anchor, Math.max(items.length, 1));
      fromLeft.value = anchor.x;
      fromTop.value = anchor.y;
      fromW.value = anchor.width;
      fromH.value = anchor.height;
      toLeft.value = frame.left;
      toTop.value = frame.top;
      toH.value = frame.height;
    }

    if (open) {
      shown.current = true;
      if (!present) {
        progress.value = 0;
        setPresent(true);
        return;
      }
      progress.value = withSpring(1, MENU_SPRING);
      return;
    }

    if (!shown.current) return;
    progress.value = withSpring(0, MENU_SPRING, (finished) => {
      if (finished) scheduleOnRN(hide);
    });
  }, [anchor, fromH, fromLeft, fromTop, fromW, items.length, open, present, progress, toH, toLeft, toTop]);

  const cardStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const height = interpolate(p, [0, 1], [fromH.value, toH.value], Extrapolation.CLAMP);
    return {
      left: interpolate(p, [0, 1], [fromLeft.value, toLeft.value], Extrapolation.CLAMP),
      top: interpolate(p, [0, 1], [fromTop.value, toTop.value], Extrapolation.CLAMP),
      width: interpolate(p, [0, 1], [fromW.value, MENU_WIDTH], Extrapolation.CLAMP),
      height,
      borderRadius: interpolate(p, [0, 1], [fromH.value / 2, CARD_RADIUS], Extrapolation.CLAMP),
    };
  });
  const plusStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.35], [1, 0], Extrapolation.CLAMP),
  }));
  const itemsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.28, 0.7], [0, 1], Extrapolation.CLAMP),
  }));

  if (!present || !anchor) return null;

  return (
    <>
      <Pressable accessibilityLabel="关闭菜单" collapsable={false} onPress={onClose} style={styles.backdrop} />
      <Animated.View collapsable={false} style={[styles.card, cardStyle]}>
        <Animated.View pointerEvents="none" style={[styles.plus, plusStyle]}>
          <ThinPlusIcon />
        </Animated.View>
        <Animated.View style={[styles.items, itemsStyle]} pointerEvents={interactive ? 'auto' : 'none'}>
          {items.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              disabled={!interactive}
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
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, backgroundColor: 'transparent' },
  card: {
    position: 'absolute',
    zIndex: 31,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.popover,
  },
  plus: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  items: { padding: MENU_PAD },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, height: ITEM_HEIGHT, paddingHorizontal: 12, borderRadius: 14 },
  itemPressed: { backgroundColor: colors.selected },
  itemText: { fontSize: 15, color: colors.text },
});
