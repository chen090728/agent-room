import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { COLOR_HEX, useTheme, type Avatar } from '../theme';
import { BlobShape } from './Avatar';

const SWAP_SPRING = { damping: 11, stiffness: 170, mass: 0.55 };
const EXIT_SPRING = { damping: 18, stiffness: 180, mass: 0.6 };
const REVEAL_SPRING = { damping: 12, stiffness: 150, mass: 0.62 };

const PARTICLES = [0, 1, 2, 3, 4, 5].map((index) => {
  const angle = (index / 6) * Math.PI * 2 + 0.35;
  return { dx: Math.cos(angle), dy: Math.sin(angle) };
});

interface Snap {
  key: string;
  avatar: Avatar;
  picture: string | null;
}

/**
 * New-assistant preview. The first time it appears, a small dot bounces with a
 * few particles, then springs up into the avatar. Later shape or colour
 * changes spring the new form in. All of this runs on the UI thread.
 */
export function AnimatedBlob({ avatar, size, picture }: { avatar: Avatar; size: number; picture?: string | null }) {
  const key = picture ? `picture:${picture.slice(-24)}` : `${avatar.shape}:${avatar.color}`;
  const [outgoing, setOutgoing] = useState<Snap | null>(null);
  const current = useRef<Snap>({ key, avatar, picture: picture ?? null });
  if (current.current.key !== key) {
    setOutgoing(current.current);
    current.current = { key, avatar, picture: picture ?? null };
  } else {
    current.current = { key, avatar, picture: picture ?? null };
  }
  const clearOutgoing = useCallback((doneKey: string) => {
    setOutgoing((current) => (current?.key === doneKey ? null : current));
  }, []);
  // Play the dot intro once each time the editor is opened, not on every shape change.
  // The flag flips after the intro starts, not during render, so a strict-mode
  // double render still mounts the intro.
  const introPlayed = useRef(false);
  const markIntro = useCallback(() => {
    introPlayed.current = true;
  }, []);
  const showIntro = !introPlayed.current && outgoing === null;

  return (
    <View style={{ width: size, height: size }} accessibilityLabel="头像预览">
      {outgoing && <ExitBlob key={outgoing.key} snap={outgoing} size={size} onDone={clearOutgoing} />}
      <EnterBlob key={key} intro={showIntro} onIntro={markIntro} avatar={avatar} size={size} picture={picture ?? null} />
    </View>
  );
}

function EnterBlob({ intro, onIntro, avatar, size, picture }: { intro: boolean; onIntro: () => void; avatar: Avatar; size: number; picture: string | null }) {
  const { colors } = useTheme();
  const playIntro = useRef(intro).current;
  const reveal = useSharedValue(playIntro ? 0 : 1);
  const bounce = useSharedValue(0);
  const particles = useSharedValue(playIntro ? 0 : 1);
  const enter = useSharedValue(playIntro ? 1 : 0);
  const color = COLOR_HEX[avatar.color];
  const dot = Math.max(12, Math.round(size * 0.14));
  const travel = size * 0.42;

  useEffect(() => {
    if (!playIntro) {
      enter.value = 0;
      enter.value = withSpring(1, SWAP_SPRING);
      return;
    }
    onIntro();
    bounce.value = withSequence(
      withTiming(-8, { duration: 170, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) }),
      withTiming(-5, { duration: 140, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 130, easing: Easing.in(Easing.quad) }),
      withTiming(-2, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 100, easing: Easing.in(Easing.quad) }),
    );
    particles.value = withDelay(50, withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) }));
    reveal.value = withDelay(520, withSpring(1, REVEAL_SPRING));
  }, [bounce, enter, onIntro, particles, playIntro, reveal]);

  const avatarStyle = useAnimatedStyle(() => {
    if (playIntro) {
      return {
        opacity: reveal.value,
        transform: [{ translateY: bounce.value * (1 - reveal.value) }, { scale: 0.16 + 0.84 * reveal.value }],
      };
    }
    return {
      opacity: interpolate(enter.value, [0, 0.35, 1], [0, 1, 1]),
      transform: [{ scale: 0.74 + 0.26 * enter.value }],
    };
  });
  const dotStyle = useAnimatedStyle(() => ({
    opacity: 1 - reveal.value,
    transform: [{ translateY: bounce.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      {playIntro &&
        PARTICLES.map((particle, index) => (
          <Particle key={index} dx={particle.dx} dy={particle.dy} progress={particles} color={color} travel={travel} />
        ))}
      {playIntro && (
        <Animated.View
          style={[
            styles.dot,
            { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color, marginLeft: -dot / 2, marginTop: -dot / 2 },
            dotStyle,
          ]}
        />
      )}
      <Animated.View style={[StyleSheet.absoluteFill, avatarStyle]}>
        {picture ? (
          <Image source={{ uri: picture }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.photoPlaceholder }} />
        ) : (
          <BlobShape avatar={avatar} size={size} />
        )}
      </Animated.View>
    </View>
  );
}

function ExitBlob({ snap, size, onDone }: { snap: Snap; size: number; onDone: (key: string) => void }) {
  const { colors } = useTheme();
  const leave = useSharedValue(1);
  const doneKey = snap.key;
  useEffect(() => {
    leave.value = withSpring(0, EXIT_SPRING, (finished) => {
      if (finished) scheduleOnRN(onDone, doneKey);
    });
  }, [doneKey, leave, onDone]);
  const style = useAnimatedStyle(() => ({
    opacity: leave.value,
    transform: [{ scale: 1 + (1 - leave.value) * 0.06 }],
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      {snap.picture ? (
        <Image source={{ uri: snap.picture }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.photoPlaceholder }} />
      ) : (
        <BlobShape avatar={snap.avatar} size={size} />
      )}
    </Animated.View>
  );
}

function Particle({ dx, dy, progress, color, travel }: { dx: number; dy: number; progress: SharedValue<number>; color: string; travel: number }) {
  const style = useAnimatedStyle(() => {
    const t = progress.value;
    return {
      opacity: interpolate(t, [0, 0.18, 1], [0, 1, 0]),
      transform: [{ translateX: dx * travel * t }, { translateY: dy * travel * t }, { scale: interpolate(t, [0, 1], [0.35, 1]) }],
    };
  });
  return <Animated.View style={[styles.particle, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  dot: { position: 'absolute', left: '50%', top: '50%' },
  particle: { position: 'absolute', width: 7, height: 7, borderRadius: 4, left: '50%', top: '50%', marginLeft: -3.5, marginTop: -3.5 },
});
