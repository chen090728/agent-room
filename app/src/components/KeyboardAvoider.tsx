import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

/**
 * Keeps its content above the on-screen keyboard by padding its bottom by the
 * keyboard's height, frame by frame as the keyboard moves. Use it as the
 * full-height container of a screen or sheet whose input sits at the bottom.
 *
 * `bottomInset` is space already reserved below the content (e.g. the safe
 * area under a screen), which the keyboard covers anyway.
 *
 * Why not KeyboardAvoidingView: it measures its own position relative to its
 * parent, which is wrong inside the scaled app frame and the bottom sheets, so
 * the input ended up under the keyboard. `useAnimatedKeyboard` reports the
 * keyboard height directly and ships with Reanimated, so it works in Expo Go.
 */
export function KeyboardAvoider({ children, style, bottomInset = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; bottomInset?: number }) {
  const keyboard = useAnimatedKeyboard();
  const padding = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, keyboard.height.value - bottomInset) }));
  return <Animated.View style={[{ flex: 1 }, style, padding]}>{children}</Animated.View>;
}
