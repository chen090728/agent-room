import type { GroupSummary, MemberView, Message } from './protocol';

/**
 * On-device copy of the home list and recent messages.
 *
 * `clientKey` is the stable row id used by the optimistic send path (it stays
 * the same after the server id arrives). Cache reads and writes must keep it
 * so a saved history line does not remount when that path reconciles the row.
 * Messages still waiting to be sent (`delivery` set) are not stored.
 */

export const ROOM_CACHE_VERSION = 1;
export const MAX_CACHED_MESSAGES = 80;

export interface CachedMessage extends Message {
  clientKey?: string;
}

/** A message that may also carry the local send fields. Those fields are dropped. */
export interface CacheableMessage extends Message {
  clientKey?: string;
  delivery?: string;
  pending?: unknown;
  local?: boolean;
}

export interface RoomSnapshot {
  version: typeof ROOM_CACHE_VERSION;
  serverUrl: string;
  savedAt: number;
  groups: GroupSummary[];
  members: MemberView[];
  /** Oldest first, per group. */
  messages: Record<string, CachedMessage[]>;
}

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function canonicalServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function roomCacheKey(serverUrl: string): string {
  return `agenthub.room.v1.${encodeURIComponent(canonicalServerUrl(serverUrl))}`;
}

export function stableClientKey(message: { id: string; clientKey?: string }): string {
  return message.clientKey || message.id;
}

/** Drops in-flight sends. Keeps `clientKey` on messages the server already has. */
export function cacheableMessage(message: CacheableMessage): CachedMessage | null {
  if (message.delivery) return null;
  const { delivery: _delivery, pending: _pending, local: _local, ...rest } = message;
  return { ...rest, clientKey: stableClientKey(message) };
}

export function buildSnapshot(
  serverUrl: string,
  groups: GroupSummary[],
  members: MemberView[],
  messages: Record<string, CacheableMessage[] | undefined>,
  now = Date.now(),
): RoomSnapshot {
  const kept: Record<string, CachedMessage[]> = {};
  for (const group of groups) {
    const list = messages[group.id];
    if (!list?.length) continue;
    const cached: CachedMessage[] = [];
    for (const message of list) {
      const item = cacheableMessage(message);
      if (item && item.groupId === group.id) cached.push(item);
    }
    if (!cached.length) continue;
    kept[group.id] = cached.length > MAX_CACHED_MESSAGES ? cached.slice(cached.length - MAX_CACHED_MESSAGES) : cached;
  }
  return {
    version: ROOM_CACHE_VERSION,
    serverUrl: canonicalServerUrl(serverUrl),
    savedAt: now,
    groups,
    members,
    messages: kept,
  };
}

export function parseSnapshot(raw: string | null, serverUrl: string): RoomSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RoomSnapshot;
    if (!parsed || parsed.version !== ROOM_CACHE_VERSION) return null;
    if (canonicalServerUrl(parsed.serverUrl) !== canonicalServerUrl(serverUrl)) return null;
    if (!Array.isArray(parsed.groups) || !Array.isArray(parsed.members) || !parsed.messages) return null;
    const messages: Record<string, CachedMessage[]> = {};
    for (const [groupId, list] of Object.entries(parsed.messages)) {
      if (!Array.isArray(list)) continue;
      messages[groupId] = list.map((message) => ({ ...message, clientKey: stableClientKey(message) }));
    }
    return { ...parsed, serverUrl: canonicalServerUrl(serverUrl), messages };
  } catch {
    return null;
  }
}

export async function readRoomCache(store: KeyValueStore, serverUrl: string): Promise<RoomSnapshot | null> {
  try {
    return parseSnapshot(await store.getItem(roomCacheKey(serverUrl)), serverUrl);
  } catch {
    return null;
  }
}

export async function writeRoomCache(store: KeyValueStore, snapshot: RoomSnapshot): Promise<void> {
  await store.setItem(roomCacheKey(snapshot.serverUrl), JSON.stringify(snapshot));
}
