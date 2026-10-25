import {
  AUTH_TIMEOUT_MS,
  Coordinator,
  registerUpload,
  defaultIntegrations,
  defaultRegistry,
  handleApi,
  HELLO,
  isValidAuth,
  SecretBox,
  seedIfEmpty,
  socketTarget,
  SqlDirectory,
  SqlRoom,
  UNAUTHORIZED_CODE,
  type Attachment,
  type ChatEvent,
  type ListEvent,
} from '@agenthub/core';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Config } from './config.js';
import { LocalFileStore } from './files.js';
import { openSqlite } from './sqlite.js';

export interface Hub {
  server: Server;
  /** Resolves once the group's queued replies are done (used by tests). */
  idle(groupId: string): Promise<void>;
}

/** Wires the shared core to node:http, ws and SQLite. */
export async function createHub(config: Config, { log = true } = {}): Promise<Hub> {
  const db = openSqlite(config.dbPath);
  const registry = defaultRegistry(config);
  const integrations = defaultIntegrations();
  const files = new LocalFileStore(config.filesDir);

  const listSockets = new Set<WebSocket>();
  const groupSockets = new Map<string, Set<WebSocket>>();
  const send = (sockets: Iterable<WebSocket>, data: string) => {
    for (const ws of sockets) if (ws.readyState === ws.OPEN) ws.send(data);
  };

  const directory = new SqlDirectory(db, new SecretBox(config.secret), (e: ListEvent) =>
    send(listSockets, JSON.stringify(e)),
  );
  const room = new SqlRoom(db);
  const coordinator = new Coordinator(
    room,
    directory,
    registry,
    integrations,
    files,
    (e: ChatEvent) => {
      const groupId = e.type === 'message' || e.type === 'message_updated' ? e.message.groupId : e.type === 'relay' ? e.relay.groupId : e.groupId;
      send(groupSockets.get(groupId) ?? [], JSON.stringify(e));
    },
    config,
  );

  // Runs queued replies one step at a time, one loop per group.
  const loops = new Map<string, Promise<void>>();
  const drive = (groupId: string) => {
    const next = (loops.get(groupId) ?? Promise.resolve())
      .then(async () => {
        while (await coordinator.step(groupId));
      })
      .catch((err) => console.error('[coordinator]', err));
    loops.set(groupId, next);
  };

  // Follows deployments: one timer per group, set for the earliest check that is due.
  const watchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const scheduleWatch = (groupId: string) => {
    const due = room.nextWatchDue(groupId);
    clearTimeout(watchTimers.get(groupId));
    watchTimers.delete(groupId);
    if (due === undefined) return;
    const timer = setTimeout(() => {
      watchTimers.delete(groupId);
      const next = (loops.get(groupId) ?? Promise.resolve())
        .then(() => coordinator.pollWatches(groupId))
        .catch((err) => console.error('[deploy]', err))
        .then(() => scheduleWatch(groupId));
      loops.set(groupId, next);
    }, Math.max(0, due - Date.now()));
    timer.unref();
    watchTimers.set(groupId, timer);
  };
  const idle = async (groupId: string) => {
    let current: Promise<void> | undefined;
    while ((current = loops.get(groupId))) {
      await current;
      if (loops.get(groupId) === current) return;
    }
  };

  if (await seedIfEmpty(directory, (groupId, content) => coordinator.addSystemMessage(groupId, content))) {
    if (log) console.log('Created demo group with mock members');
  }
  // Pick up relays interrupted by a restart.
  room.pendingGroups().forEach(drive);
  room.watchGroups().forEach(scheduleWatch);

  const rooms = {
    async post(groupId: string, content: string, attachments: string[]) {
      const { message, pending } = await coordinator.postUserMessage(groupId, content, attachments);
      if (pending) drive(groupId);
      return message;
    },
    async messages(groupId: string, limit: number, before?: string) {
      return room.recentMessages(groupId, limit, before);
    },
    registerUpload: (groupId: string, attachment: Attachment) => registerUpload(room, files, groupId, attachment),
    cardAction: async (groupId: string, messageId: string, action: 'merge' | 'reject') => {
      const message = await coordinator.cardAction(groupId, messageId, action);
      scheduleWatch(groupId); // a merge may have started following a deployment
      return message;
    },
  };

  const server = createServer(async (req, res) => {
    try {
      const response = await handleApi(await toRequest(req), { token: config.token, directory, registry, integrations, files, signingSecret: config.secret, rooms });
      await writeResponse(res, response ?? Response.json({ error: '接口不存在' }, { status: 404 }));
    } catch (err) {
      console.error('[http]', err);
      if (!res.headersSent) res.writeHead(500).end();
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const target = socketTarget(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (!target) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => {
      let authed = false;
      const timer = setTimeout(() => !authed && ws.close(UNAUTHORIZED_CODE, 'auth timeout'), AUTH_TIMEOUT_MS);
      ws.on('message', (raw) => {
        if (authed) return;
        if (!isValidAuth(raw.toString(), config.token)) return ws.close(UNAUTHORIZED_CODE, 'unauthorized');
        authed = true;
        clearTimeout(timer);
        if (target === 'list') {
          listSockets.add(ws);
        } else {
          const set = groupSockets.get(target.groupId) ?? new Set();
          set.add(ws);
          groupSockets.set(target.groupId, set);
        }
        ws.send(HELLO);
      });
      ws.on('close', () => {
        clearTimeout(timer);
        listSockets.delete(ws);
        if (target !== 'list') groupSockets.get(target.groupId)?.delete(ws);
      });
    });
  });

  return { server, idle };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0;
  return new Request(new URL(req.url ?? '/', 'http://localhost'), {
    method: req.method,
    headers,
    body: hasBody ? Buffer.concat(chunks) : undefined,
  });
}

async function writeResponse(res: ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}
