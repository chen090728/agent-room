import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, Keyframe } from 'react-native-reanimated';
import { colors, shadows } from '../theme';

const POP_IN = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.82 }, { translateY: -8 }] },
  100: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }], easing: (t: number) => 1 - Math.pow(1 - t, 3) },
}).duration(190);

export interface BubbleItem {
  label: string;
  icon: ReactNode;
  onPress(): void;
}

/**
 * A small bubble menu that pops out of the top-right corner (below a "+"
 * button). Tapping anywhere else closes it. Render it inside a full-screen
 * relative container, after the content it floats over.
 */
export function BubbleMenu({ visible, items, onClose, top }: { visible: boolean; items: BubbleItem[]; onClose(): void; top: number }) {
  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable accessibilityLabel="关闭菜单" style={StyleSheet.absoluteFill} onPress={onClose} />
      <Animated.View entering={POP_IN} exiting={FadeOut.duration(110)} style={[styles.bubble, { top }]}>
        {items.map((item, i) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={() => {
              onClose();
              item.onPress();
            }}
            style={({ pressed }) => [styles.item, i > 0 && styles.divider, pressed && styles.pressed]}
          >
            {item.icon}
            <Text style={styles.text}>{item.label}</Text>
          </Pressable>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    right: 14,
    minWidth: 168,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.hairline,
    boxShadow: shadows.popover,
    paddingVertical: 6,
    transformOrigin: 'top right',
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 46, paddingHorizontal: 16 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.selected },
  text: { fontSize: 14, color: colors.text },
});
