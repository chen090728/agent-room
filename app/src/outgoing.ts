import type { Attachment, Message } from './protocol';
import type { Avatar } from './theme';

/**
 * Optimistic send state for one chat.
 *
 * A message the user just sent keeps a `clientKey` that never changes, so the
 * list row stays mounted when the server id arrives. `delivery` is set only
 * until the server has the message. Nothing here touches storage.
 */

export type Delivery = 'sending' | 'failed';

export interface PendingSend {
  content: string;
  attachmentIds: string[];
}

export interface ChatMessage extends Message {
  /** Stable list identity. Equals `id` for messages that originated on the server. */
  clientKey: string;
  delivery?: Delivery;
  pending?: PendingSend;
  /** Sent from this phone. Kept after the server id arrives so the row does not replay its entrance. */
  local?: true;
}

export type ChatRow =
  | { kind: 'time'; key: string; at: number }
  | { kind: 'message'; key: string; message: ChatMessage; avatar: Avatar };

const GAP_MS = 5 * 60 * 1000;

/** User and system rows do not draw an avatar; one constant keeps those rows comparable. */
const BLANK_AVATAR: Avatar = { shape: 'circle', color: 'gray' };

let keySeq = 0;

export function nextClientKey(now = Date.now()): string {
  keySeq += 1;
  return `local-${now.toString(36)}-${keySeq.toString(36)}`;
}

export function createOutgoing(input: {
  groupId: string;
  content: string;
  attachmentIds: string[];
  attachments: Attachment[];
  senderName: string;
  now: number;
  clientKey: string;
}): ChatMessage {
  return {
    id: input.clientKey,
    groupId: input.groupId,
    senderKind: 'user',
    senderId: null,
    senderName: input.senderName,
    content: input.content,
    attachments: input.attachments.length ? input.attachments : undefined,
    card: null,
    rootId: input.clientKey,
    hop: 0,
    createdAt: input.now,
    clientKey: input.clientKey,
    delivery: 'sending',
    pending: { content: input.content, attachmentIds: input.attachmentIds.slice() },
    local: true,
  };
}

function attachmentIdsOf(message: Message): string[] {
  return (message.attachments ?? []).map((item) => item.id);
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function byTime(a: ChatMessage, b: ChatMessage): number {
  return a.createdAt - b.createdAt || (a.clientKey < b.clientKey ? -1 : a.clientKey > b.clientKey ? 1 : 0);
}

function insertByTime(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = list.findIndex((item) => byTime(message, item) < 0);
  if (index < 0) return [...list, message];
  return [...list.slice(0, index), message, ...list.slice(index)];
}

/** Oldest in-flight (or failed) user send with the same text and files, if any. */
function matchPending(list: ChatMessage[], message: Message): ChatMessage | undefined {
  if (message.senderKind !== 'user') return undefined;
  const ids = attachmentIdsOf(message);
  return list.find(
    (item) =>
      item.delivery !== undefined &&
      item.pending !== undefined &&
      item.pending.content === message.content &&
      sameIds(item.pending.attachmentIds, ids),
  );
}

export function appendOutgoing(list: ChatMessage[] | undefined, message: ChatMessage): ChatMessage[] {
  return insertByTime(list ?? [], message);
}

export function markFailed(list: ChatMessage[], clientKey: string): ChatMessage[] {
  return mapOne(list, clientKey, (item) => (item.delivery === 'failed' ? item : { ...item, delivery: 'failed' }));
}

export function markSending(list: ChatMessage[], clientKey: string): ChatMessage[] {
  return mapOne(list, clientKey, (item) => (item.delivery === 'sending' ? item : { ...item, delivery: 'sending' }));
}

function mapOne(list: ChatMessage[], clientKey: string, update: (item: ChatMessage) => ChatMessage): ChatMessage[] {
  let changed = false;
  const next = list.map((item) => {
    if (item.clientKey !== clientKey) return item;
    const updated = update(item);
    if (updated !== item) changed = true;
    return updated;
  });
  return changed ? next : list;
}

/** Replace the local pending row with the saved server message, keeping `clientKey`. */
export function acknowledge(list: ChatMessage[], clientKey: string, server: Message): ChatMessage[] {
  const pending = list.find((item) => item.clientKey === clientKey && item.delivery !== undefined);
  const already = list.find((item) => item.id === server.id);
  if (!pending && already && already.delivery === undefined) return list;

  const next: ChatMessage = {
    ...(already ?? server),
    ...server,
    clientKey: pending?.clientKey ?? already?.clientKey ?? clientKey,
    local: pending?.local ?? already?.local,
    delivery: undefined,
    pending: undefined,
  };
  const kept = list.filter((item) => item !== pending && item !== already);
  return insertByTime(kept, next);
}

/**
 * A message from the socket. Same id is ignored (the HTTP response already
 * applied it). A matching pending row is reconciled instead of shown twice.
 */
export function addIncoming(list: ChatMessage[] | undefined, message: Message): ChatMessage[] {
  const existing = list ?? [];
  if (existing.some((item) => item.id === message.id)) return existing;
  const pending = matchPending(existing, message);
  if (pending) return acknowledge(existing, pending.clientKey, message);
  return insertByTime(existing, { ...message, clientKey: message.id });
}

function sameSnapshot(prev: ChatMessage, next: Message): boolean {
  return (
    prev.content === next.content &&
    prev.createdAt === next.createdAt &&
    prev.senderKind === next.senderKind &&
    prev.senderId === next.senderId &&
    prev.senderName === next.senderName &&
    prev.hop === next.hop &&
    prev.rootId === next.rootId &&
    prev.card === next.card &&
    sameIds(attachmentIdsOf(prev), attachmentIdsOf(next))
  );
}

/**
 * Merge a history page into what's on screen.
 * Messages already shown keep their object. A pending send is replaced when
 * this page contains its server copy, so a reload cannot duplicate it.
 */
export function mergeServerMessages(existing: ChatMessage[] | undefined, incoming: Message[]): ChatMessage[] {
  const list = existing ?? [];
  const seen = new Set(list.map((item) => item.id));
  const pendingCount = list.reduce((count, item) => count + (item.delivery !== undefined ? 1 : 0), 0);
  let pendingLeft = list.filter((item) => item.delivery !== undefined);
  const added: ChatMessage[] = [];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    const match = matchPending(pendingLeft, item);
    if (match) {
      pendingLeft = pendingLeft.filter((row) => row !== match);
      added.push({ ...item, clientKey: match.clientKey, local: match.local });
      continue;
    }
    added.push({ ...item, clientKey: item.id });
  }
  if (!added.length && pendingLeft.length === pendingCount) return list;
  const pendingIds = new Set(pendingLeft.map((item) => item.clientKey));
  const kept = list.filter((item) => item.delivery === undefined || pendingIds.has(item.clientKey));
  const next = [...kept, ...added].sort(byTime);
  if (next.length === list.length && next.every((item, index) => item === list[index])) return list;
  return next;
}

/** Replace one saved message (card updates) without disturbing its row identity fields. */
export function replaceMessage(list: ChatMessage[], message: Message): ChatMessage[] {
  let changed = false;
  const next = list.map((item) => {
    if (item.id !== message.id) return item;
    if (item.delivery === undefined && sameSnapshot(item, message)) return item;
    changed = true;
    return { ...item, ...message, clientKey: item.clientKey, delivery: item.delivery, pending: item.pending };
  });
  return changed ? next : list;
}

export interface RowCache {
  chrono: ChatRow[];
  display: ChatRow[];
}

/**
 * Oldest-first rows, reusing the previous row object when the message and
 * avatar are the same so a new send does not invalidate the rows above it.
 */
export function buildRows(messages: ChatMessage[], avatarOf: (memberId: string | null) => Avatar, prev?: ChatRow[]): ChatRow[] {
  const prevByKey = new Map<string, ChatRow>();
  if (prev) for (const row of prev) prevByKey.set(row.key, row);

  const rows: ChatRow[] = [];
  let previousAt = 0;
  for (const message of messages) {
    const key = message.clientKey || message.id;
    if (message.createdAt - previousAt > GAP_MS) {
      const timeKey = `t-${key}`;
      const cached = prevByKey.get(timeKey);
      rows.push(cached && cached.kind === 'time' && cached.at === message.createdAt ? cached : { kind: 'time', key: timeKey, at: message.createdAt });
    }
    previousAt = message.createdAt;
    const avatar = message.senderKind === 'member' ? avatarOf(message.senderId) : BLANK_AVATAR;
    const cached = prevByKey.get(key);
    if (cached && cached.kind === 'message' && cached.message === message && cached.avatar === avatar) rows.push(cached);
    else rows.push({ kind: 'message', key, message, avatar });
  }
  if (prev && prev.length === rows.length && prev.every((row, index) => row === rows[index])) return prev;
  return rows;
}

/** Newest-first, which is what the inverted list renders. Same cache identity when nothing changed. */
export function displayRows(messages: ChatMessage[], avatarOf: (memberId: string | null) => Avatar, prev?: RowCache): RowCache {
  const chrono = buildRows(messages, avatarOf, prev?.chrono);
  if (prev && chrono === prev.chrono) return prev;
  const display = chrono.slice().reverse();
  if (prev && prev.display.length === display.length && prev.display.every((row, index) => row === display[index])) {
    return { chrono, display: prev.display };
  }
  return { chrono, display };
}

/** FlatList key. Message rows use the stable client key, not the server id. */
export function rowKey(row: ChatRow): string {
  return row.kind === 'message' ? row.message.clientKey : row.key;
}
