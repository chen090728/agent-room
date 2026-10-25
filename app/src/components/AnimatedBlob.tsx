import { useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeOut, Keyframe, ZoomIn } from 'react-native-reanimated';
import { COLOR_HEX, type Avatar } from '../theme';
import { BlobShape } from './Avatar';

// Keyframe easings run on the UI thread, so they must be Reanimated's own
// (worklet) easings; an ordinary JS function crashes release builds.
const SWAP_IN = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.72 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(260);

/**
 * Avatar preview for the editor. It grows from a small dot when it first
 * appears, and when the shape or colour changes the old one fades out while
 * the new one pops in over it, so changes are smooth instead of jumping.
 * `picture` (a local uri) replaces the blob while an image is chosen.
 */
export function AnimatedBlob({ avatar, size, picture }: { avatar: Avatar; size: number; picture?: string | null }) {
  const first = useRef(true);
  useEffect(() => {
    first.current = false;
  }, []);
  const key = picture ? `picture:${picture.slice(-32)}` : `${avatar.shape}:${avatar.color}`;
  const entering = first.current ? ZoomIn.springify().damping(12).stiffness(120) : SWAP_IN;

  return (
    <View style={{ width: size, height: size }} accessibilityLabel="头像预览">
      <Animated.View key={key} entering={entering} exiting={FadeOut.duration(180)} style={StyleSheet.absoluteFill}>
        {picture ? (
          <Image source={{ uri: picture }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: COLOR_HEX.gray }} />
        ) : (
          <BlobShape avatar={avatar} size={size} />
        )}
      </Animated.View>
    </View>
  );
}
