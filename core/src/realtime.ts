import { safeEqual } from './crypto.js';

/**
 * WebSocket protocol shared by both targets. Clients connect to
 *   /ws              group list events (ListEvent)
 *   /ws/groups/:id   one group's chat events (ChatEvent)
 * and must send {"type":"auth","token":"..."} as the first frame. The server
 * answers {"type":"hello"} and only then starts pushing events.
 */
export const AUTH_TIMEOUT_MS = 5000;
export const HELLO = JSON.stringify({ type: 'hello' });
export const UNAUTHORIZED_CODE = 4401;

const GROUP_SOCKET = /^\/ws\/groups\/([\w-]+)$/;

/** 'list' for /ws, 'bridge' for /ws/bridge (see bridge.ts), the group id for /ws/groups/:id, or null. */
export function socketTarget(pathname: string): 'list' | 'bridge' | { groupId: string } | null {
  if (pathname === '/ws') return 'list';
  if (pathname === '/ws/bridge') return 'bridge';
  const m = pathname.match(GROUP_SOCKET);
  return m ? { groupId: m[1] } : null;
}

/** True when a frame is a valid auth message carrying the right token. */
export function isValidAuth(frame: string, token: string): boolean {
  try {
    const parsed = JSON.parse(frame);
    return parsed?.type === 'auth' && typeof parsed.token === 'string' && safeEqual(parsed.token, token);
  } catch {
    return false;
  }
}
