import { useEffect, useState } from 'react';
import { useStore } from './store';
import type { Avatar } from './theme';

// Uploaded avatar pictures are served through short-lived signed links. Links
// are fetched once per picture and reused until shortly before they expire.
const TTL_MS = 8 * 60 * 1000;
const cache = new Map<string, { uri: string; at: number }>();
const pending = new Map<string, Promise<string>>();

/** The address of an avatar's uploaded picture, or null while it loads (or when there is none). */
export function useAvatarImage(image: Avatar['image']): string | null {
  const { api, settings } = useStore();
  const key = image && settings ? `${settings.serverUrl}|${image.groupId}|${image.fileId}` : null;
  const [uri, setUri] = useState<string | null>(() => {
    const hit = key ? cache.get(key) : undefined;
    return hit && Date.now() - hit.at < TTL_MS ? hit.uri : null;
  });

  useEffect(() => {
    if (!key || !image || !api) return setUri(null);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return setUri(hit.uri);
    let cancelled = false;
    let load = pending.get(key);
    if (!load) {
      load = api.fileLink(image.groupId, image.fileId).finally(() => pending.delete(key));
      pending.set(key, load);
    }
    load
      .then((link) => {
        cache.set(key, { uri: link, at: Date.now() });
        if (!cancelled) setUri(link);
      })
      .catch(() => !cancelled && setUri(null));
    return () => {
      cancelled = true;
    };
  }, [key, image?.groupId, image?.fileId, api]);

  return uri;
}
