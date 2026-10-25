import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ScrollViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { BackIcon, CloseIcon } from './components/Icons';
import { useAppTranslation } from './i18n';
import { useThemedStyles, type ThemeColors, type ThemeShadows } from './theme';

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
  const styles = useThemedStyles(createStyles);
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

// Softer than a snappy slide: a little settle, without a hard stop.
const SHEET_OPEN = { damping: 26, stiffness: 128, mass: 0.95 };
const SHEET_RETURN = { damping: 24, stiffness: 140, mass: 0.9 };
const SHEET_CLOSE = { damping: 32, stiffness: 180, mass: 0.9, overshootClamping: true as const };

interface SheetGestureValue {
  scrollY: SharedValue<number>;
  gesture: ReturnType<typeof Gesture.Simultaneous>;
}

const SheetGestureContext = createContext<SheetGestureValue | null>(null);

/**
 * Scroll body of a sheet. At the top of the content, pulling down continues
 * into dismissing the sheet. Outside a sheet it is an ordinary scroller.
 */
export function SheetScrollView({ style, children, ...props }: ScrollViewProps) {
  const styles = useThemedStyles(createStyles);
  const ctx = useContext(SheetGestureContext);
  const fallbackY = useSharedValue(0);
  const scrollY = ctx?.scrollY ?? fallbackY;
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  useEffect(() => {
    scrollY.value = 0;
  }, [scrollY]);

  if (!ctx) {
    return (
      <ScrollView style={style} {...props}>
        {children}
      </ScrollView>
    );
  }
  return (
    <GestureDetector gesture={ctx.gesture}>
      <Animated.ScrollView {...props} bounces={false} overScrollMode="never" scrollEventThrottle={16} onScroll={onScroll} style={[styles.fill, style]}>
        {children}
      </Animated.ScrollView>
    </GestureDetector>
  );
}

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
  const { t } = useAppTranslation();
  const styles = useThemedStyles(createStyles);
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetH = Math.round((screenH - insets.top - 10) * heightFraction);
  const travel = sheetH + OVERSHOOT;
  const y = useSharedValue(travel);
  const closing = useSharedValue(false);
  const frame = useRef({ lowerOpen, isTop });
  frame.current = { lowerOpen, isTop };

  const scrollY = useSharedValue(0);
  const pullBase = useSharedValue(0);
  const travelY = useSharedValue(travel);
  travelY.value = travel;
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const notifyClosed = useCallback(() => onClosedRef.current(), []);

  const native = useMemo(() => Gesture.Native(), []);
  const contentPan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-9999, 12])
        .failOffsetY([-16, 9999])
        .failOffsetX([-28, 28])
        .onBegin(() => {
          pullBase.value = 0;
        })
        .onChange((event) => {
          // Still reading content: remember the finger so the sheet does not jump when we hit the top.
          if (scrollY.value > 1 && y.value <= 0) {
            pullBase.value = event.translationY;
            return;
          }
          const pulled = event.translationY - pullBase.value;
          y.value = pulled < 0 ? pulled / 5 : pulled;
        })
        .onEnd((event) => {
          if (y.value > 110 || (y.value > 36 && event.velocityY > 900)) {
            closing.value = true;
            y.value = withSpring(travelY.value, { ...SHEET_CLOSE, velocity: event.velocityY }, (finished) => {
              if (finished) scheduleOnRN(notifyClosed);
            });
          } else {
            y.value = withSpring(0, { ...SHEET_RETURN, velocity: event.velocityY });
          }
          pullBase.value = 0;
        }),
    [closing, notifyClosed, pullBase, scrollY, travelY, y],
  );
  const sheetGesture = useMemo<SheetGestureValue>(() => ({ scrollY, gesture: Gesture.Simultaneous(contentPan, native) }), [contentPan, native, scrollY]);

  useEffect(() => {
    y.value = withSpring(0, SHEET_OPEN);
  }, [y]);

  const close = useCallback(
    (after?: () => void) => {
      if (closing.value) return;
      closing.value = true;
      y.value = withSpring(travel, SHEET_CLOSE, (finished) => {
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
        y.value = withSpring(travel, { ...SHEET_CLOSE, velocity: e.velocityY }, (finished) => {
          if (finished) scheduleOnRN(onClosed);
        });
      } else {
        y.value = withSpring(0, { ...SHEET_RETURN, velocity: e.velocityY });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: 0.38 * interpolate(y.value, [0, travel], [1, 0], 'clamp') }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} pointerEvents="none" />
      <Pressable accessibilityLabel={t('sheets.dismissA11y')} style={StyleSheet.absoluteFill} onPress={() => close()} />
      <Animated.View style={[styles.sheet, { height: sheetH + OVERSHOOT, bottom: -OVERSHOOT }, sheetStyle]}>
        <SheetCloseContext.Provider value={close}>
          <PanContext.Provider value={pan}>
            <SheetGestureContext.Provider value={sheetGesture}>
              <View style={{ flex: 1, paddingBottom: OVERSHOOT }}>{children}</View>
            </SheetGestureContext.Provider>
          </PanContext.Provider>
        </SheetCloseContext.Provider>
      </Animated.View>
    </View>
  );
}

const PanContext = createContext<ReturnType<typeof Gesture.Pan> | null>(null);

/** The drag handle, title and × of a sheet. Pull it down to dismiss. */
/** With `onBack` the left button goes back (a step inside the sheet) instead of closing it. */
export function SheetHeader({ title, right, onBack }: { title: string; right?: ReactNode; onBack?: () => void }) {
  const { t } = useAppTranslation();
  const styles = useThemedStyles(createStyles);
  const close = useSheetClose();
  const pan = useContext(PanContext);
  const header = (
    <View style={styles.header}>
      <View style={styles.handle} />
      <View style={styles.headerRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={onBack ? t('common.back') : t('common.close')} onPress={() => (onBack ? onBack() : close())} style={styles.closeButton} hitSlop={6}>
          {onBack ? <BackIcon size={16} /> : <CloseIcon size={16} />}
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

const createStyles = (colors: ThemeColors, shadows: ThemeShadows) => StyleSheet.create({
  fill: { flex: 1 },
  frameBack: { flex: 1, backgroundColor: colors.scrim },
  frame: { flex: 1, overflow: 'hidden', backgroundColor: colors.bg },
  dim: { backgroundColor: colors.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.sheet,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    boxShadow: shadows.sheet,
  },
  header: { paddingTop: 8, paddingBottom: 6, backgroundColor: colors.sheet },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.handle, marginBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, height: 48 },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  title: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text, marginHorizontal: 8 },
  headerSide: { width: 36, alignItems: 'flex-end' },
});
