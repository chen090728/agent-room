import { z } from 'zod';
import type { AdapterRegistry } from './adapters/registry.js';
import { safeEqual } from './crypto.js';
import type { Directory } from './directory.js';
import { AVATAR_COLORS, AVATAR_SHAPES, type Member, type Message } from './types.js';

export interface ApiDeps {
  token: string;
  /** Set when the server is missing configuration; every API call then fails with it. */
  configError?: string;
  directory: Directory;
  registry: AdapterRegistry;
  rooms: {
    post(groupId: string, content: string): Promise<Message>;
    messages(groupId: string, limit: number, before?: string): Promise<Message[]>;
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

const createGroupBody = z.object({
  name: z.string().trim().min(1, '群名不能为空').max(40),
  memberIds: z.array(z.string()).default([]),
});

const setMembersBody = z.object({ memberIds: z.array(z.string()) });
const sendBody = z.object({ content: z.string().trim().min(1).max(4000) });

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

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!safeEqual(token, deps.token)) return fail(401, '访问令牌无效');

  try {
    return (await route(request, url, path, deps)) ?? fail(404, '接口不存在');
  } catch (err) {
    if (err instanceof z.ZodError) return fail(400, err.issues[0]?.message ?? '参数错误');
    if (err instanceof SyntaxError) return fail(400, '请求内容不是有效的 JSON');
    console.error('[api]', err);
    return fail(500, '服务器内部错误');
  }
}

async function route(request: Request, url: URL, path: string, deps: ApiDeps): Promise<Response | null> {
  const { directory, registry, rooms } = deps;
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

      const created = await directory.createMember({ ...input, config, secrets });
      if (!created.ok) return fail(409, created.error);
      return json(201, memberView(created.value));
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

  const groupMatch = path.match(/^\/api\/groups\/([\w-]+)(\/members|\/messages)?$/);
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

    if (sub === '/messages' && method === 'GET') {
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
      return json(200, await rooms.messages(groupId, limit, url.searchParams.get('before') ?? undefined));
    }

    if (sub === '/messages' && method === 'POST') {
      const { content } = sendBody.parse(await body());
      return json(201, await rooms.post(groupId, content));
    }
  }

  return null;
}
