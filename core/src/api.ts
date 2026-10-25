import { z } from 'zod';
import type { AdapterRegistry } from './adapters/registry.js';
import { knownTools } from './bridge.js';
import { safeEqual } from './crypto.js';
import type { Directory } from './directory.js';
import {
  classifyFile,
  fileKey,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_FILE_BYTES,
  sanitizeFileName,
  signFileLink,
  verifyFileLink,
  type FileStore,
} from './files.js';
import type { IntegrationRegistry } from './integrations/registry.js';
import { AVATAR_COLORS, AVATAR_SHAPES, UserError, type Attachment, type Member, type Message } from './types.js';

export interface ApiDeps {
  token: string;
  /** Set when the server is missing configuration; every API call then fails with it. */
  configError?: string;
  directory: Directory;
  registry: AdapterRegistry;
  integrations: IntegrationRegistry;
  /** Where uploaded files go; null when the deployment has no file storage. */
  files: FileStore | null;
  /** Signs the short-lived download links (AGENTHUB_SECRET). */
  signingSecret: string;
  /** Which bridges are connected right now; absent when the host has no bridge support. */
  bridges?: { isOnline(bridgeId: string): Promise<boolean> };
  rooms: {
    post(groupId: string, content: string, attachments: string[]): Promise<Message>;
    registerUpload(groupId: string, attachment: Attachment): Promise<Attachment>;
    messages(groupId: string, limit: number, before?: string): Promise<Message[]>;
    cardAction(groupId: string, messageId: string, action: 'merge' | 'reject'): Promise<Message>;
  };
}

const memberName = z
  .string()
  .trim()
  .min(1, '名字不能为空')
  .max(20, '名字最多 20 个字')
  .refine((s) => !/[\s@＠]/.test(s), '名字不能包含空格或 @');

const avatarBody = z.object({ shape: z.enum(AVATAR_SHAPES), color: z.enum(AVATAR_COLORS) });

const createMemberBody = z.object({
  name: memberName,
  type: z.string(),
  avatar: avatarBody,
  role: z.string().trim().max(20, '角色标签最多 20 个字').default(''),
  persona: z.string().max(2000).default(''),
  config: z.record(z.string(), z.string()).default({}),
});

const pairBody = z.object({
  code: z.string().min(1).max(40),
  name: z.string().max(80).default(''),
  tools: z.array(z.string()).max(10).default([]),
  bridgeId: z.string().max(100).optional(),
  token: z.string().max(200).optional(),
});

const createGroupBody = z.object({
  name: z.string().trim().min(1, '群名不能为空').max(40),
  memberIds: z.array(z.string()).default([]),
});

const setMembersBody = z.object({ memberIds: z.array(z.string()) });
const sendBody = z
  .object({
    content: z.string().trim().max(4000).default(''),
    attachments: z.array(z.string()).max(MAX_ATTACHMENTS_PER_MESSAGE, `一条消息最多带 ${MAX_ATTACHMENTS_PER_MESSAGE} 个文件`).default([]),
  })
  .refine((b) => b.content.length > 0 || b.attachments.length > 0, '消息不能为空');
const cardBody = z.object({ action: z.enum(['merge', 'reject']) });
/** Each key is optional: leave it out to keep the current value, send null to clear it. */
const bindingBody = z.object({
  repo: z
    .object({ integrationId: z.string(), repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, '仓库名要写成 所有者/仓库名') })
    .nullable()
    .optional(),
  deploy: z
    .object({ integrationId: z.string(), project: z.string().min(1).max(200), name: z.string().max(200).default('') })
    .nullable()
    .optional(),
});
const createIntegrationBody = z.object({
  type: z.string(),
  name: z.string().trim().max(40).default(''),
  config: z.record(z.string(), z.string()).default({}),
});

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

/**
 * The HTTP API, shared by the Node server and the Cloudflare Worker.
 * Returns null for paths outside /api so the host can handle them.
 */
export async function handleApi(request: Request, deps: ApiDeps): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/api/')) return null;

  if (path === '/api/health') {
    return json(200, { ok: true, name: 'AgentHub', configured: !deps.configError });
  }
  if (deps.configError) return fail(503, deps.configError);

  // Signed download links are opened in the phone's browser, which cannot send the token header.
  const publicFile = path.match(/^\/api\/f\/([\w-]+)\/([\w-]+)$/);
  if (publicFile && request.method === 'GET') {
    const [, groupId, fileId] = publicFile;
    const ok = await verifyFileLink(deps.signingSecret, groupId, fileId, Number(url.searchParams.get('exp')), url.searchParams.get('sig') ?? '');
    if (!ok) return fail(403, '链接已过期，请回到 App 重新打开');
    return serveFile(deps.files, groupId, fileId);
  }

  // A bridge has no access token yet: the one-time pairing code is its credential.
  if (path === '/api/bridge/pair' && request.method === 'POST') {
    try {
      const input = pairBody.parse(await request.json());
      const paired = await deps.directory.completePairing({ ...input, tools: knownTools(input.tools) });
      return paired.ok ? json(200, paired.value) : fail(400, paired.error);
    } catch (err) {
      if (err instanceof z.ZodError || err instanceof SyntaxError) return fail(400, '请求内容不对');
      console.error('[api]', err);
      return fail(500, '服务器内部错误');
    }
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!safeEqual(token, deps.token)) return fail(401, '访问令牌无效');

  try {
    return (await route(request, url, path, deps)) ?? fail(404, '接口不存在');
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, err.issues[0]?.message ?? '参数错误');
    if (err instanceof UserError) return fail(err.status, err.message);
    if (err instanceof SyntaxError) return fail(400, '请求内容不是有效的 JSON');
    console.error('[api]', err);
    return fail(500, '服务器内部错误');
  }
}

async function route(request: Request, url: URL, path: string, deps: ApiDeps): Promise<Response | null> {
  const { directory, registry, integrations, rooms } = deps;
  const method = request.method;
  const body = async () => (request.headers.get('content-length') === '0' ? {} : await request.json());

  const memberView = (m: Member) => {
    const { secretPreview, ...rest } = m;
    return { ...rest, typeLabel: registry.get(m.type)?.label ?? m.type, secrets: secretPreview };
  };

  if (path === '/api/adapters' && method === 'GET') {
    return json(
      200,
      registry.list().map(({ type, label, description, fields }) => ({ type, label, description, fields })),
    );
  }

  if (path === '/api/members') {
    if (method === 'GET') return json(200, (await directory.listMembers()).map(memberView));
    if (method === 'POST') {
      const input = createMemberBody.parse(await body());
      const adapter = registry.get(input.type);
      if (!adapter) return fail(400, `未知的成员类型：${input.type}`);

      const config: Record<string, string> = {};
      const secrets: Record<string, string> = {};
      for (const field of adapter.fields) {
        const value = (input.config[field.key] ?? '').trim();
        if (field.required && !value) return fail(400, `请填写${field.label}`);
        if (value && field.kind === 'url' && !/^https?:\/\/\S+$/i.test(value)) {
          return fail(400, `${field.label}需要以 http:// 或 https:// 开头`);
        }
        if (value) (field.secret ? secrets : config)[field.key] = value;
      }

      const problem = adapter.validate?.(config);
      if (problem) return fail(400, problem);

      const created = await directory.createMember({ ...input, config, secrets });
      if (!created.ok) return fail(409, created.error);
      return json(201, memberView(created.value));
    }
  }

  const bridgeMatch = path.match(/^\/api\/members\/([\w-]+)\/(pairing|bridge)$/);
  if (bridgeMatch) {
    const [, memberId, sub] = bridgeMatch;
    if (sub === 'pairing' && method === 'POST') {
      const pairing = await directory.createPairing(memberId);
      return pairing.ok ? json(200, pairing.value) : fail(400, pairing.error);
    }
    if (sub === 'bridge' && method === 'GET') {
      const member = (await directory.listMembers()).find((m) => m.id === memberId);
      if (!member) return fail(404, '成员不存在');
      const info = member.config.bridgeId ? await directory.getBridge(member.config.bridgeId) : null;
      const online = info ? (await deps.bridges?.isOnline(info.id)) ?? false : false;
      return json(200, { paired: !!info, online, name: info?.name ?? null, tools: info?.tools ?? [], lastSeen: info?.lastSeen ?? null });
    }
  }

  const memberMatch = path.match(/^\/api\/members\/([\w-]+)$/);
  if (memberMatch && method === 'DELETE') {
    if (!(await directory.deleteMember(memberMatch[1]))) return fail(404, '成员不存在');
    return json(200, { ok: true });
  }

  if (path === '/api/groups') {
    if (method === 'GET') return json(200, await directory.listGroups());
    if (method === 'POST') {
      const input = createGroupBody.parse(await body());
      const created = await directory.createGroup(input.name, input.memberIds);
      if (!created.ok) return fail(400, created.error);
      return json(201, created.value);
    }
  }

  // ---- integrations (connections to outside services) ----

  if (path === '/api/integrations/types' && method === 'GET') {
    return json(
      200,
      integrations.list().map(({ type, label, description, fields }) => ({ type, label, description, fields })),
    );
  }

  if (path === '/api/integrations') {
    if (method === 'GET') return json(200, await directory.listIntegrations());
    if (method === 'POST') {
      const input = createIntegrationBody.parse(await body());
      const type = integrations.get(input.type);
      if (!type) return fail(400, `未知的连接类型：${input.type}`);

      const config: Record<string, string> = {};
      const secrets: Record<string, string> = {};
      for (const field of type.fields) {
        const value = (input.config[field.key] ?? '').trim();
        if (field.required && !value) return fail(400, `请填写${field.label}`);
        if (value && field.kind === 'url' && !/^https?:\/\/\S+$/i.test(value)) {
          return fail(400, `${field.label}需要以 http:// 或 https:// 开头`);
        }
        if (value) (field.secret ? secrets : config)[field.key] = value;
      }

      let account: string;
      try {
        ({ account } = await type.verify({ ...config, ...secrets }));
      } catch (err) {
        return fail(400, err instanceof Error ? err.message : '验证失败');
      }
      const created = await directory.createIntegration({
        type: type.type,
        typeLabel: type.label,
        name: input.name || (account ? `${type.label} · ${account}` : type.label),
        config: account ? { ...config, account } : config,
        secrets,
      });
      if (!created.ok) return fail(400, created.error);
      return json(201, created.value);
    }
  }

  const integrationMatch = path.match(/^\/api\/integrations\/([\w-]+)(\/resources)?$/);
  if (integrationMatch) {
    const [, id, sub] = integrationMatch;
    if (!sub && method === 'DELETE') {
      if (!(await directory.deleteIntegration(id))) return fail(404, '连接不存在');
      return json(200, { ok: true });
    }
    if (sub && method === 'GET') {
      const full = await directory.getIntegration(id);
      const type = full && integrations.get(full.type);
      if (!full || !type) return fail(404, '连接不存在');
      try {
        return json(200, await type.listResources({ ...full.config, ...full.secrets }));
      } catch (err) {
        return fail(502, err instanceof Error ? err.message : '读取失败');
      }
    }
  }

  const cardMatch = path.match(/^\/api\/groups\/([\w-]+)\/messages\/([\w-]+)\/card$/);
  if (cardMatch && method === 'POST') {
    const [, groupId, messageId] = cardMatch;
    if (!(await directory.getGroup(groupId))) return fail(404, '群聊不存在');
    const { action } = cardBody.parse(await body());
    return json(200, await rooms.cardAction(groupId, messageId, action));
  }

  // ---- files ----

  const uploadMatch = path.match(/^\/api\/groups\/([\w-]+)\/uploads$/);
  if (uploadMatch && method === 'POST') {
    const groupId = uploadMatch[1];
    if (!deps.files) return fail(503, '服务器没有开通文件存储。Cloudflare 版需要先开通 R2，见《手机部署指南》');
    if (!(await directory.getGroup(groupId))) return fail(404, '群聊不存在');
    if (Number(request.headers.get('content-length')) > MAX_FILE_BYTES) return fail(413, `文件太大，最多 ${MAX_FILE_BYTES / 1024 / 1024} MB`);
    const data = new Uint8Array(await request.arrayBuffer());
    if (!data.length) return fail(400, '文件是空的');
    if (data.length > MAX_FILE_BYTES) return fail(413, `文件太大，最多 ${MAX_FILE_BYTES / 1024 / 1024} MB`);

    let rawName = request.headers.get('x-file-name') ?? '';
    try {
      rawName = decodeURIComponent(rawName);
    } catch {
      // Use the name as sent.
    }
    const name = sanitizeFileName(rawName);
    const kind = classifyFile(name, request.headers.get('content-type') ?? '');
    if (!kind) return fail(415, '暂不支持这种文件。可以发送图片、PDF，以及常见的文本和代码文件');

    const id = crypto.randomUUID();
    await deps.files.put(fileKey(groupId, id), data, { contentType: kind.mime, name });
    try {
      return json(201, await rooms.registerUpload(groupId, { id, name, mime: kind.mime, size: data.length, kind: kind.kind }));
    } catch (err) {
      await deps.files.delete(fileKey(groupId, id));
      throw err;
    }
  }

  const fileMatch = path.match(/^\/api\/groups\/([\w-]+)\/files\/([\w-]+)(\/link)?$/);
  if (fileMatch) {
    const [, groupId, fileId, link] = fileMatch;
    if (!link && method === 'GET') return serveFile(deps.files, groupId, fileId);
    if (link && method === 'POST') {
      const expiresAt = Date.now() + 10 * 60 * 1000;
      const sig = await signFileLink(deps.signingSecret, groupId, fileId, expiresAt);
      return json(200, { path: `/api/f/${groupId}/${fileId}?exp=${expiresAt}&sig=${sig}`, expiresAt });
    }
  }

  const groupMatch = path.match(/^\/api\/groups\/([\w-]+)(\/members|\/messages|\/binding)?$/);
  if (groupMatch) {
    const [, groupId, sub] = groupMatch;
    const group = await directory.getGroup(groupId);
    if (!group) return fail(404, '群聊不存在');

    if (!sub && method === 'GET') return json(200, group);

    if (sub === '/members' && method === 'PUT') {
      const input = setMembersBody.parse(await body());
      const updated = await directory.setGroupMembers(groupId, input.memberIds);
      if (!updated.ok) return fail(400, updated.error);
      return json(200, updated.value);
    }

    if (sub === '/binding' && method === 'PUT') {
      const input = bindingBody.parse(await body());
      const current = (await directory.getGroup(groupId))?.binding ?? {};
      const next = { repo: input.repo === undefined ? current.repo : input.repo ?? undefined, deploy: input.deploy === undefined ? current.deploy : input.deploy ?? undefined };
      const updated = await directory.setBinding(groupId, next);
      if (!updated.ok) return fail(400, updated.error);
      return json(200, updated.value);
    }

    if (sub === '/messages' && method === 'GET') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
      return json(200, await rooms.messages(groupId, limit, url.searchParams.get('before') ?? undefined));
    }

    if (sub === '/messages' && method === 'POST') {
      const { content, attachments } = sendBody.parse(await body());
      return json(201, await rooms.post(groupId, content, attachments));
    }
  }

  return null;
}

/** Streams a stored file. Content types are fixed by the server, and sniffing is off, so an upload can never run as a page. */
async function serveFile(files: FileStore | null, groupId: string, fileId: string): Promise<Response> {
  if (!files) return fail(503, '服务器没有开通文件存储');
  const stored = await files.get(fileKey(groupId, fileId));
  if (!stored) return fail(404, '文件不存在');
  const contentType = stored.contentType === 'text/plain' ? 'text/plain; charset=utf-8' : stored.contentType;
  return new Response(stored.data.slice(), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stored.data.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(stored.name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
