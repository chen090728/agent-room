import { agreedLanguage, AUTH_TIMEOUT_MS, HELLO, isValidAuth, languageFromExtra, readClientFrame, UNAUTHORIZED_CODE, type AppLanguage, type ClientFrameExtra, type SqlDriver, type SqlValue } from '@agenthub/core';

/** The core's SQL interface on top of a Durable Object's SQLite storage. */
export function durableSql(ctx: DurableObjectState): SqlDriver {
  return {
    run: (sql: string, ...params: SqlValue[]) => void ctx.storage.sql.exec(sql, ...params).toArray(),
    all: <T>(sql: string, ...params: SqlValue[]) => ctx.storage.sql.exec(sql, ...params).toArray() as T[],
    transaction: <T>(fn: () => T) => ctx.storage.transactionSync(fn),
  };
}

// WebSockets use the Hibernation API: the Durable Object can be evicted from
// memory while sockets stay open, so per-socket state lives in attachments.

interface Attachment {
  authed: boolean;
  openedAt: number;
  /** Extra keys from auth and subscribe. `lang` is the client's language. */
  client?: ClientFrameExtra;
}

export function acceptSocket(ctx: DurableObjectState, request: Request, tag?: string): Response {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected a WebSocket upgrade', { status: 426 });
  }
  const { 0: client, 1: server } = new WebSocketPair();
  ctx.acceptWebSocket(server, tag ? [tag] : undefined);
  server.serializeAttachment({ authed: false, openedAt: Date.now() } satisfies Attachment);
  return new Response(null, { status: 101, webSocket: client });
}

/** The first frame must authenticate. Later subscribe frames are kept and not rejected. */
export function onSocketMessage(ws: WebSocket, message: string | ArrayBuffer, token: string | undefined) {
  const att = (ws.deserializeAttachment() as Attachment | null) ?? { authed: false, openedAt: Date.now() };
  const text = typeof message === 'string' ? message : '';
  const frame = readClientFrame(text);
  if (att.authed) {
    if (frame?.kind === 'subscribe') {
      ws.serializeAttachment({ ...att, client: { ...att.client, ...frame.extra } } satisfies Attachment);
    }
    return;
  }
  if (frame?.kind === 'auth' && token && isValidAuth(text, token)) {
    ws.serializeAttachment({ authed: true, openedAt: att.openedAt, client: frame.extra } satisfies Attachment);
    ws.send(HELLO);
  } else {
    closeSocket(ws, UNAUTHORIZED_CODE, 'unauthorized');
  }
}

export function closeSocket(ws: WebSocket, code = 1000, reason = '') {
  try {
    ws.close(code, reason);
  } catch {
    // Already closed.
  }
}

/** The one language every authenticated socket agreed on, if they sent `lang`. */
export function agreedSocketLanguage(ctx: DurableObjectState, tag?: string): AppLanguage | undefined {
  const langs: AppLanguage[] = [];
  for (const ws of ctx.getWebSockets(tag)) {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (!att?.authed) continue;
    const lang = languageFromExtra(att.client);
    if (lang) langs.push(lang);
  }
  return agreedLanguage(langs);
}

/** Sends to every authenticated socket; drops sockets that never authenticated. */
export function broadcast(ctx: DurableObjectState, data: string, tag?: string) {
  const now = Date.now();
  for (const ws of ctx.getWebSockets(tag)) {
    const att = ws.deserializeAttachment() as Attachment | null;
    if (att?.authed) {
      try {
        ws.send(data);
      } catch {
        // The socket is closing; the close handler cleans up.
      }
    } else if (now - (att?.openedAt ?? 0) > AUTH_TIMEOUT_MS) {
      closeSocket(ws, UNAUTHORIZED_CODE, 'auth timeout');
    }
  }
}
