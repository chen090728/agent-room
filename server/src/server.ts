import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { createMockAdapter } from './adapters/mock.js';
import { createOpenAICompatibleAdapter } from './adapters/openai-compatible.js';
import { AdapterRegistry } from './adapters/registry.js';
import type { Config } from './config.js';
import { Coordinator, type ServerEvent } from './coordinator.js';
import { maskSecret, safeEqual, SecretBox } from './crypto.js';
import { Repo } from './db/repo.js';
import { openDatabase } from './db/schema.js';
import { seedIfEmpty } from './seed.js';
import { MEMBER_COLORS, type Member } from './types.js';

export interface BuildOptions {
  config: Config;
  registry?: AdapterRegistry;
  logger?: boolean;
}

export interface AgentHubServer {
  app: FastifyInstance;
  repo: Repo;
  coordinator: Coordinator;
  registry: AdapterRegistry;
}

const memberName = z
  .string()
  .trim()
  .min(1, '名字不能为空')
  .max(20, '名字最多 20 个字')
  .refine((s) => !/[\s@＠]/.test(s), '名字不能包含空格或 @');

const createMemberBody = z.object({
  name: memberName,
  type: z.string(),
  color: z.enum(MEMBER_COLORS),
  persona: z.string().max(2000).default(''),
  config: z.record(z.string(), z.string()).default({}),
});

const createGroupBody = z.object({
  name: z.string().trim().min(1, '群名不能为空').max(40),
  memberIds: z.array(z.string()).default([]),
});

const setMembersBody = z.object({ memberIds: z.array(z.string()) });
const sendBody = z.object({ content: z.string().trim().min(1).max(4000) });
const wsAuth = z.object({ type: z.literal('auth'), token: z.string() });

export function defaultRegistry(config: Config): AdapterRegistry {
  return new AdapterRegistry()
    .register(createMockAdapter({ delayMs: config.mockDelayMs }))
    .register(createOpenAICompatibleAdapter());
}

export function buildServer({ config, registry = defaultRegistry(config), logger = true }: BuildOptions): AgentHubServer {
  const repo = new Repo(openDatabase(config.dbPath), new SecretBox(config.secret));
  if (seedIfEmpty(repo) && logger) console.log('Created demo group with mock members');

  const clients = new Set<WebSocket>();
  const broadcast = (event: ServerEvent) => {
    const data = JSON.stringify(event);
    for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
  };
  const coordinator = new Coordinator(repo, registry, broadcast, config);

  const app = Fastify({ logger: logger ? { level: 'info' } : false });

  const fail = (reply: FastifyReply, status: number, error: string) => reply.code(status).send({ error });

  const memberView = (m: Member) => {
    const adapter = registry.get(m.type);
    return {
      ...m,
      typeLabel: adapter?.label ?? m.type,
      secrets: repo.getSecretPreview(m.id, maskSecret),
    };
  };

  const groupView = (groupId: string) => {
    const group = repo.getGroup(groupId)!;
    const last = repo.lastMessage(groupId);
    return {
      ...group,
      members: repo.groupMembers(groupId).map((m) => ({ id: m.id, name: m.name, color: m.color, type: m.type })),
      lastMessage: last ?? null,
      lastActivityAt: last?.createdAt ?? group.createdAt,
      relay: coordinator.relayFor(groupId) ?? null,
    };
  };

  app.register(websocket);

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url === '/api/health') return;
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!safeEqual(token, config.token)) return fail(reply, 401, '访问令牌无效');
  });

  app.setErrorHandler((err: any, _req, reply) => {
    if (err instanceof z.ZodError) return fail(reply, 400, err.issues[0]?.message ?? '参数错误');
    if (err?.statusCode && err.statusCode < 500) return fail(reply, err.statusCode, err.message);
    app.log.error(err);
    return fail(reply, 500, '服务器内部错误');
  });

  app.get('/api/health', async () => ({ ok: true, name: 'AgentHub' }));

  app.get('/api/adapters', async () =>
    registry.list().map(({ type, label, description, fields }) => ({ type, label, description, fields })),
  );

  // ---- members ----

  app.get('/api/members', async () => repo.listMembers().map(memberView));

  app.post('/api/members', async (req, reply) => {
    const body = createMemberBody.parse(req.body);
    const adapter = registry.get(body.type);
    if (!adapter) return fail(reply, 400, `未知的成员类型：${body.type}`);
    if (repo.memberNameTaken(body.name)) return fail(reply, 409, `已经有叫「${body.name}」的成员了`);

    const config: Record<string, string> = {};
    const secrets: Record<string, string> = {};
    for (const field of adapter.fields) {
      const value = (body.config[field.key] ?? '').trim();
      if (field.required && !value) return fail(reply, 400, `请填写${field.label}`);
      if (value && field.kind === 'url' && !/^https?:\/\/\S+$/i.test(value)) {
        return fail(reply, 400, `${field.label}需要以 http:// 或 https:// 开头`);
      }
      if (value) (field.secret ? secrets : config)[field.key] = value;
    }

    const member = repo.createMember({ ...body, config, secrets });
    broadcast({ type: 'members_changed' });
    return reply.code(201).send(memberView(member));
  });

  app.delete<{ Params: { id: string } }>('/api/members/:id', async (req, reply) => {
    if (!repo.deleteMember(req.params.id)) return fail(reply, 404, '成员不存在');
    broadcast({ type: 'members_changed' });
    broadcast({ type: 'groups_changed' });
    return { ok: true };
  });

  // ---- groups ----

  app.get('/api/groups', async () =>
    repo
      .listGroups()
      .map((g) => groupView(g.id))
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt),
  );

  app.post('/api/groups', async (req, reply) => {
    const body = createGroupBody.parse(req.body);
    const unknown = body.memberIds.find((id) => !repo.getMember(id));
    if (unknown) return fail(reply, 400, '有成员不存在');
    const group = repo.createGroup(body.name, body.memberIds);
    broadcast({ type: 'groups_changed' });
    return reply.code(201).send(groupView(group.id));
  });

  app.get<{ Params: { id: string } }>('/api/groups/:id', async (req, reply) => {
    if (!repo.getGroup(req.params.id)) return fail(reply, 404, '群聊不存在');
    return groupView(req.params.id);
  });

  app.put<{ Params: { id: string } }>('/api/groups/:id/members', async (req, reply) => {
    if (!repo.getGroup(req.params.id)) return fail(reply, 404, '群聊不存在');
    const body = setMembersBody.parse(req.body);
    if (body.memberIds.some((id) => !repo.getMember(id))) return fail(reply, 400, '有成员不存在');
    repo.setGroupMembers(req.params.id, body.memberIds);
    broadcast({ type: 'groups_changed' });
    return groupView(req.params.id);
  });

  app.get<{ Params: { id: string }; Querystring: { before?: string; limit?: string } }>(
    '/api/groups/:id/messages',
    async (req, reply) => {
      if (!repo.getGroup(req.params.id)) return fail(reply, 404, '群聊不存在');
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      return repo.recentMessages(req.params.id, limit, req.query.before);
    },
  );

  app.post<{ Params: { id: string } }>('/api/groups/:id/messages', async (req, reply) => {
    if (!repo.getGroup(req.params.id)) return fail(reply, 404, '群聊不存在');
    const { content } = sendBody.parse(req.body);
    return reply.code(201).send(coordinator.postUserMessage(req.params.id, content));
  });

  // ---- realtime ----
  // The first frame must be {"type":"auth","token":"..."}; afterwards the
  // socket only receives server events.

  app.register(async (scope) => {
    scope.get('/ws', { websocket: true }, (socket) => {
      let authed = false;
      const timer = setTimeout(() => !authed && socket.close(4401, 'auth timeout'), 5000);
      socket.on('message', (raw) => {
        if (authed) {
          return;
        }
        let parsed: z.infer<typeof wsAuth> | undefined;
        try {
          parsed = wsAuth.parse(JSON.parse(raw.toString()));
        } catch {
          parsed = undefined;
        }
        if (!parsed || !safeEqual(parsed.token, config.token)) {
          socket.close(4401, 'unauthorized');
          return;
        }
        authed = true;
        clearTimeout(timer);
        clients.add(socket);
        socket.send(JSON.stringify({ type: 'hello' }));
      });
      socket.on('close', () => {
        clearTimeout(timer);
        clients.delete(socket);
      });
    });
  });

  return { app, repo, coordinator, registry };
}
