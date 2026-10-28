import { safeEqual } from './crypto.js';
import type { ChatEvent } from './types.js';

/**
 * WebSocket protocol shared by both targets. Clients connect to
 *   /ws              the one app socket: list events, plus every chat event
 *   /ws/groups/:id   one group's chat events, bare (older apps)
 * and must send {"type":"auth","token":"..."} as the first frame. Extra keys
 * on that frame are kept. Hosts read `lang` (`zh` or `en`) from those keys;
 * anything else is still not validated.
 * After hello, a `{ "type": "subscribe", ... }` frame is accepted the same
 * way: its extra keys are kept, and `lang` updates the client's language.
 * The server answers {"type":"hello"} and only then starts pushing events.
 *
 * Chat events on `/ws` use an envelope, `{ "type": "chat", "event": <same
 * object as /ws/groups/:id> }`. The event is not rebuilt, so fields this
 * version does not know about (a future `message.notice`) survive.
 */
export const AUTH_TIMEOUT_MS = 5000;
export const HELLO = JSON.stringify({ type: 'hello' });
export const UNAUTHORIZED_CODE = 4401;

export interface ClientFrameExtra {
  [key: string]: unknown;
}

/** A client handshake frame. `extra` is every key other than the ones this version reads. */
export type ClientFrame =
  | { kind: 'auth'; token: string; extra: ClientFrameExtra }
  | { kind: 'subscribe'; extra: ClientFrameExtra };

function extraKeys(record: Record<string, unknown>, skip: ReadonlySet<string>): ClientFrameExtra {
  const extra: ClientFrameExtra = {};
  for (const [key, value] of Object.entries(record)) {
    if (!skip.has(key)) extra[key] = value;
  }
  return extra;
}

/**
 * Parse one client frame. Unknown keys are returned on `extra` and are not
 * validated. Returns null for anything that is not auth or subscribe.
 */
export function readClientFrame(frame: string): ClientFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (record.type === 'auth') {
    if (typeof record.token !== 'string') return null;
    return { kind: 'auth', token: record.token, extra: extraKeys(record, new Set(['type', 'token'])) };
  }
  if (record.type === 'subscribe') {
    return { kind: 'subscribe', extra: extraKeys(record, new Set(['type'])) };
  }
  return null;
}

/**
 * Bytes for both sockets. `group` is the bare event (`/ws/groups/:id`).
 * `list` is the `/ws` envelope. Both stringify the same object, so extra
 * fields are not dropped.
 */
export function encodeChatFrames(event: ChatEvent): { group: string; list: string } {
  return {
    group: JSON.stringify(event),
    list: JSON.stringify({ type: 'chat', event }),
  };
}

const GROUP_SOCKET = /^\/ws\/groups\/([\w-]+)$/;

/** 'list' for /ws, 'bridge' for /ws/bridge (see bridge.ts), the group id for /ws/groups/:id, or null. */
export function socketTarget(pathname: string): 'list' | 'bridge' | { groupId: string } | null {
  if (pathname === '/ws') return 'list';
  if (pathname === '/ws/bridge') return 'bridge';
  const m = pathname.match(GROUP_SOCKET);
  return m ? { groupId: m[1] } : null;
}

/** True when a frame is a valid auth message carrying the right token. Extra keys are allowed. */
export function isValidAuth(frame: string, token: string): boolean {
  const read = readClientFrame(frame);
  return read?.kind === 'auth' && safeEqual(read.token, token);
}
