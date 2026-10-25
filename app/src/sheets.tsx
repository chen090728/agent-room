import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { CloseIcon } from './components/Icons';
import { colors } from './theme';

/*
 * Bottom sheets. They are not routes: they live in a host outside the scaled
 * app frame, so while one is open the whole app behind it shrinks and darkens
 * (`backdrop` runs 0 → 1), and dragging the sheet down moves that back
 * smoothly. Screens open one with `useSheets().open(name, params)`.
 */

export type SheetName = 'member-new' | 'group-new' | 'settings' | 'chat-settings' | 'plugins' | 'plugin-detail';
export type SheetParams = Record<string, string>;

interface SheetEntry {
  id: number;
  name: SheetName;
  params: SheetParams;
}

interface SheetsApi {
  open(name: SheetName, params?: SheetParams): void;
  /** 0 with no sheet open, 1 with one fully open; drives the scaled app frame. */
  backdrop: SharedValue<number>;
}

const SheetsContext = createContext<SheetsApi | null>(null);
const SheetCloseContext = createContext<(after?: () => void) => void>(() => {});

export function useSheets(): SheetsApi {
  const api = useContext(SheetsContext);
  if (!api) throw new Error('useSheets must be used inside SheetProvider');
  return api;
}

/** Closes the sheet this component is in (animated); `after` runs once it has gone. */
export const useSheetClose = () => useContext(SheetCloseContext);

type Registry = Record<SheetName, { component: ComponentType<{ params: SheetParams }>; height?: number }>;

export function SheetProvider({ registry, children }: { registry: Registry; children: ReactNode }) {
  const backdrop = useSharedValue(0);
  const [stack, setStack] = useState<SheetEntry[]>([]);
  const nextId = useRef(1);

  const open = useCallback((name: SheetName, params: SheetParams = {}) => {
    setStack((s) => [...s, { id: nextId.current++, name, params }]);
  }, []);
  const remove = useCallback((id: number) => setStack((s) => s.filter((e) => e.id !== id)), []);
  const api = useMemo(() => ({ open, backdrop }), [open, backdrop]);

  // Android back closes the topmost sheet.
  const topId = stack[stack.length - 1]?.id;
  const closers = useRef(new Map<number, () => void>());
  useEffect(() => {
    if (topId === undefined) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closers.current.get(topId)?.();
      return true;
    });
    return () => sub.remove();
  }, [topId]);

  return (
    <SheetsContext.Provider value={api}>
      <AppFrame>{children}</AppFrame>
      {stack.map((entry, i) => {
        const { component: Content, height } = registry[entry.name];
        return (
          <BottomSheet
            key={entry.id}
            heightFraction={height}
            lowerOpen={i > 0}
            isTop={i === stack.length - 1}
            backdrop={backdrop}
            registerClose={(fn) => (fn ? closers.current.set(entry.id, fn) : closers.current.delete(entry.id))}
            onClosed={() => remove(entry.id)}
          >
            <Content params={entry.params} />
          </BottomSheet>
        );
      })}
    </SheetsContext.Provider>
  );
}

/** The app itself: shrinks into rounded corners while a sheet is up. */
function AppFrame({ children }: { children: ReactNode }) {
  const { backdrop } = useSheets();
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.07 * backdrop.value }, { translateY: 6 * backdrop.value }],
    borderRadius: 30 * backdrop.value,
  }));
  return (
    <View style={styles.frameBack}>
      <Animated.View style={[styles.frame, style]}>{children}</Animated.View>
    </View>
  );
}

const OVERSHOOT = 48; // the sheet extends below the screen so its spring can overshoot without a gap

interface BottomSheetProps {
  children: ReactNode;
  heightFraction?: number;
  lowerOpen: boolean;
  isTop: boolean;
  backdrop: SharedValue<number>;
  registerClose(fn: (() => void) | null): void;
  onClosed(): void;
}

function BottomSheet({ children, heightFraction = 1, lowerOpen, isTop, backdrop, registerClose, onClosed }: BottomSheetProps) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetH = Math.round((screenH - insets.top - 10) * heightFraction);
  const travel = sheetH + OVERSHOOT;
  const y = useSharedValue(travel);
  const closing = useSharedValue(false);
  const frame = useRef({ lowerOpen, isTop });
  frame.current = { lowerOpen, isTop };

  useEffect(() => {
    y.value = withSpring(0, { damping: 20, stiffness: 190, mass: 0.9 });
  }, [y]);

  const close = useCallback(
    (after?: () => void) => {
      if (closing.value) return;
      closing.value = true;
      y.value = withTiming(travel, { duration: 240, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) {
          scheduleOnRN(onClosed);
          if (after) scheduleOnRN(after);
        }
      });
    },
    [closing, y, travel, onClosed],
  );
  useEffect(() => {
    registerClose(close);
    return () => registerClose(null);
  }, [close, registerClose]);

  // Only the topmost sheet drives the backdrop; one below it keeps the app shrunk.
  useAnimatedReaction(
    () => interpolate(y.value, [0, travel], [1, 0], 'clamp'),
    (progress) => {
      if (isTop) backdrop.value = lowerOpen ? 1 : progress;
    },
    [isTop, lowerOpen, travel],
  );

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-30, 30])
    .onChange((e) => {
      // Rubber band when pulled up, 1:1 when pulled down.
      y.value = e.translationY < 0 ? e.translationY / 5 : e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 900) {
        closing.value = true;
        y.value = withTiming(travel, { duration: 220, easing: Easing.out(Easing.cubic) }, (finished) => {
          if (finished) scheduleOnRN(onClosed);
        });
      } else {
        y.value = withSpring(0, { damping: 14, stiffness: 220, mass: 0.8, velocity: e.velocityY });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.38 * interpolate(y.value, [0, travel], [1, 0], 'clamp') }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} pointerEvents="none" />
      <Pressable accessibilityLabel="关闭" style={StyleSheet.absoluteFill} onPress={() => close()} />
      <Animated.View style={[styles.sheet, { height: sheetH + OVERSHOOT, bottom: -OVERSHOOT }, sheetStyle]}>
        <SheetCloseContext.Provider value={close}>
          <PanContext.Provider value={pan}>
            <View style={{ flex: 1, paddingBottom: OVERSHOOT }}>{children}</View>
          </PanContext.Provider>
        </SheetCloseContext.Provider>
      </Animated.View>
    </View>
  );
}

const PanContext = createContext<ReturnType<typeof Gesture.Pan> | null>(null);

/** The drag handle, title and × of a sheet. Pull it down to dismiss. */
export function SheetHeader({ title, right }: { title: string; right?: ReactNode }) {
  const close = useSheetClose();
  const pan = useContext(PanContext);
  const header = (
    <View style={styles.header}>
      <View style={styles.handle} />
      <View style={styles.headerRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={() => close()} style={styles.closeButton} hitSlop={6}>
          <CloseIcon size={16} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSide}>{right}</View>
      </View>
    </View>
  );
  return pan ? <GestureDetector gesture={pan}>{header}</GestureDetector> : header;
}

const styles = StyleSheet.create({
  frameBack: { flex: 1, backgroundColor: '#000000' },
  frame: { flex: 1, overflow: 'hidden', backgroundColor: colors.bg },
  dim: { backgroundColor: '#000000' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
  },
  header: { paddingTop: 8, paddingBottom: 6, backgroundColor: colors.bg },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#D8D7D3', marginBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 48 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text, marginHorizontal: 8 },
  headerSide: { width: 36, alignItems: 'flex-end' },
});
