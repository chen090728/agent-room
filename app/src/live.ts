import type { ChatEvent, RelayState } from './protocol';

function stableClientKey(message: { id: string; clientKey?: string }): string {
  return message.clientKey || message.id;
}

/**
 * Live chat updates that arrive on the single app WebSocket (`/ws`).
 *
 * Chat events arrive as `{ type: 'chat', event }` where `event` is the same
 * object the old per-group socket used. `chatEventFromList` returns that
 * object unchanged so a field this app does not know (a future `notice`) is
 * not stripped. `group_updated` still folds the latest message into history.
 * This module never touches the send button.
 *
 * `clientKey` on a row already on screen is kept, including when a pending
 * send is reconciled with the server copy of the same text.
 */

/** The chat event inside a `/ws` envelope, or null. The object is not copied. */
export function chatEventFromList(frame: { type?: unknown; event?: ChatEvent } | null | undefined): ChatEvent | null {
  if (!frame || frame.type !== 'chat' || !frame.event || typeof frame.event !== 'object' || Array.isArray(frame.event)) return null;
  return frame.event;
}

export interface LiveMessage {
  id: string;
  createdAt: number;
  content: string;
  senderKind: string;
  clientKey?: string;
  delivery?: string;
  pending?: { content: string; attachmentIds: string[] };
  attachments?: { id: string }[];
  card?: unknown;
  local?: boolean;
}

export interface LiveGroup {
  members: { id: string; name: string }[];
  relay: RelayState | null;
  lastMessage: LiveMessage | null;
}

export const CONNECTING_BANNER_DELAY_MS = 1000;

/** Small banner only after the socket has been down for a moment. Online hides it. */
export function connectionBannerVisible(
  status: 'online' | 'offline' | 'connecting',
  elapsedMs: number,
  delayMs = CONNECTING_BANNER_DELAY_MS,
): boolean {
  return status !== 'online' && elapsedMs >= delayMs;
}

/** Member ids to show as "正在思考", taken from the relay summary on the list socket. */
export function typingMemberIds(group: LiveGroup): string[] {
  const name = group.relay?.active ? group.relay.thinking : null;
  if (!name) return [];
  const member = group.members.find((item) => item.name === name);
  return member ? [member.id] : [];
}

function attachmentIds(message: { attachments?: { id: string }[] }): string[] {
  return (message.attachments ?? []).map((item) => item.id);
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sameCard(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function sameBody(prev: LiveMessage, next: LiveMessage): boolean {
  return prev.content === next.content && prev.createdAt === next.createdAt && prev.senderKind === next.senderKind && sameCard(prev.card, next.card) && sameIds(attachmentIds(prev), attachmentIds(next));
}

function byTime(a: LiveMessage, b: LiveMessage): number {
  const delta = a.createdAt - b.createdAt;
  if (delta !== 0) return delta;
  const ak = stableClientKey(a);
  const bk = stableClientKey(b);
  return ak < bk ? -1 : ak > bk ? 1 : 0;
}

/** Oldest in-flight user send with the same text and files. */
function matchPending<T extends LiveMessage>(list: T[], incoming: LiveMessage): T | undefined {
  if (incoming.senderKind !== 'user') return undefined;
  const ids = attachmentIds(incoming);
  return list.find(
    (item) =>
      item.delivery !== undefined &&
      item.pending !== undefined &&
      item.senderKind === 'user' &&
      item.pending.content === incoming.content &&
      sameIds(item.pending.attachmentIds, ids),
  );
}

function withKeptKey<T extends LiveMessage>(prev: T | undefined, incoming: LiveMessage, clientKey: string): T {
  return { ...(prev ?? ({} as T)), ...incoming, clientKey, delivery: undefined, pending: undefined, local: prev?.local };
}

/**
 * Merge one server message into a history list.
 * `sync` means a background fetch should run (the summary may have skipped rows).
 */
export function mergeLiveMessage<T extends LiveMessage>(
  existing: T[] | undefined,
  incoming: T,
): { messages: T[]; changed: boolean; sync: boolean } {
  const list = existing ?? [];
  const index = list.findIndex((item) => item.id === incoming.id);
  if (index >= 0) {
    const prev = list[index];
    if (prev.delivery) return { messages: list, changed: false, sync: false };
    const clientKey = stableClientKey(prev);
    if (sameBody(prev, incoming) && stableClientKey(prev) === clientKey && prev.clientKey === clientKey) {
      return { messages: list, changed: false, sync: false };
    }
    const next = list.slice();
    next[index] = { ...prev, ...incoming, clientKey, delivery: prev.delivery, pending: prev.pending, local: prev.local };
    return { messages: next, changed: true, sync: false };
  }

  const pending = matchPending(list, incoming);
  if (pending) {
    const next = list.map((item) => (item === pending ? withKeptKey(pending, incoming, stableClientKey(pending)) : item));
    next.sort(byTime);
    return { messages: next, changed: true, sync: false };
  }

  const added = { ...incoming, clientKey: stableClientKey(incoming) };
  const next = [...list, added].sort(byTime);
  // An unseen id on top of history may have siblings the summary did not include.
  return { messages: next, changed: true, sync: true };
}

export function applyGroupSummary<T extends LiveMessage>(
  existing: T[] | undefined,
  group: LiveGroup,
): { messages: T[] | undefined; typing: string[]; changed: boolean; sync: boolean } {
  const typing = typingMemberIds(group);
  if (!group.lastMessage) return { messages: existing, typing, changed: false, sync: false };
  const folded = mergeLiveMessage(existing, group.lastMessage as T);
  return { messages: folded.messages, typing, changed: folded.changed, sync: folded.sync || !existing?.length };
}

/**
 * History page from HTTP. Rows already on screen keep `clientKey`.
 * Returns the same array when nothing changed.
 */
export function mergeHistory<T extends LiveMessage>(existing: T[] | undefined, incoming: readonly T[]): T[] {
  if (!existing) {
    if (!incoming.length) return [];
    return incoming.map((item) => ({ ...item, clientKey: stableClientKey(item) })).sort(byTime);
  }
  if (!incoming.length) return existing;

  let changed = false;
  let list = existing;
  const ensure = () => {
    if (!changed) {
      list = existing.slice();
      changed = true;
    }
  };

  for (const item of incoming) {
    const index = list.findIndex((row) => row.id === item.id);
    if (index >= 0) {
      const prev = list[index];
      if (prev.delivery) continue;
      const clientKey = stableClientKey(prev);
      if (sameBody(prev, item) && prev.clientKey === clientKey) continue;
      ensure();
      list[index] = { ...prev, ...item, clientKey, delivery: prev.delivery, pending: prev.pending, local: prev.local };
      continue;
    }
    const pending = matchPending(list, item);
    if (pending) {
      ensure();
      const pendingIndex = list.findIndex((row) => row === pending || row.clientKey === pending.clientKey);
      if (pendingIndex >= 0) list[pendingIndex] = withKeptKey(pending, item, stableClientKey(pending));
      continue;
    }
    ensure();
    list.push({ ...item, clientKey: stableClientKey(item) });
  }

  if (!changed) return existing;
  list.sort(byTime);
  return list;
}

/**
 * Whether a list update should fetch history in the background.
 * Chats that have never been opened (`existing` missing) are not prefetched.
 */
export function historySyncNeeded(existing: { id: string }[] | undefined, last: { id: string } | null): boolean {
  if (!last || !existing) return false;
  return !existing.some((item) => item.id === last.id);
}
