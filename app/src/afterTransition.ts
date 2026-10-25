import { useNavigation } from 'expo-router';
import { useEffect } from 'react';

const FALLBACK_MS = 480;

type TransitionEvent = { data?: { closing?: boolean } };
type TransitionNav = {
  addListener(type: 'transitionEnd', callback: (event: TransitionEvent) => void): () => void;
};

/**
 * Runs `work` after the native push finishes so the transition itself stays light.
 * If the navigator never emits transitionEnd, a short fallback still runs the work.
 */
export function useAfterTransition(work: () => void, enabled = true) {
  const navigation = useNavigation() as TransitionNav;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let started = false;
    const run = () => {
      if (cancelled || started) return;
      started = true;
      work();
    };
    const unsub = navigation.addListener('transitionEnd', (event) => {
      if (!event.data?.closing) run();
    });
    const fallback = setTimeout(run, FALLBACK_MS);
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      unsub();
    };
  }, [enabled, navigation, work]);
}
