import type { Card, PullRequestCard, PullRequestFile } from '../types.js';
import type { IntegrationType, Resource, ToolContext, ToolDef, ToolRuntime } from './types.js';

const DEFAULT_API = 'https://api.github.com';
const MAX_READ_CHARS = 60_000;
const MAX_FILES_PER_PR = 20;
const MAX_FILE_CHARS = 200_000;
const MAX_TOTAL_CHARS = 1_000_000;
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** A thin GitHub REST client. The token never appears in error messages. */
export class GitHubClient {
  private base: string;
  private token: string;

  constructor(
    config: Record<string, string>,
    private fetchImpl: typeof fetch,
  ) {
    this.base = (config.apiBaseUrl || DEFAULT_API).replace(/\/+$/, '');
    this.token = config.token ?? '';
  }

  async raw(method: string, path: string, body?: unknown, accept = 'application/vnd.github+json'): Promise<Response> {
    let res: Response;
    // Called without `this`: on Cloudflare Workers `fetch` throws "Illegal invocation" when bound to another object.
    const doFetch = this.fetchImpl;
    try {
      res = await doFetch(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: accept,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'AgentHub',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message.split(this.token).join('***') : '';
      throw new GitHubError(`连不上 GitHub，请检查接口地址和网络${reason ? `（${reason}）` : ''}`, 0);
    }
    if (res.ok) return res;
    const text = (await res.text()).split(this.token).join('***');
    let message = text.slice(0, 200);
    try {
      message = JSON.parse(text).message ?? message;
    } catch {
      // Not JSON.
    }
    throw new GitHubError(describeStatus(res.status, message), res.status);
  }

  async json<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.raw(method, path, body);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }
}

function describeStatus(status: number, message: string): string {
  if (status === 401) return '令牌无效或已过期';
  if (status === 403 || status === 404) {
    return `没有权限或找不到（${message}）。细粒度令牌需要对这个仓库开启 Contents 和 Pull requests 的读写权限`;
  }
  return `GitHub 返回 ${status}：${message}`;
}

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

/** Normalizes a repository path; rejects anything that could escape or touch git internals. */
function cleanPath(value: unknown, { allowEmpty = false } = {}): string {
  const path = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!path && !allowEmpty) throw new Error('缺少文件路径');
  if (path.split('/').some((seg) => seg === '..' || seg === '.' || seg.toLowerCase() === '.git')) {
    throw new Error(`路径不合法：${path}`);
  }
  return path;
}

/** Assistants may not edit CI workflows: they run with repository secrets. */
function isProtectedPath(path: string): boolean {
  return path.toLowerCase().startsWith('.github/workflows/');
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '') || 'change';
}

function decodeBase64Utf8(text: string): string {
  const binary = atob(text.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function createGitHubIntegration(fetchImpl: typeof fetch = fetch): IntegrationType & Required<Pick<IntegrationType, 'createTools' | 'cardAction'>> {
  const client = (config: Record<string, string>) => new GitHubClient(config, fetchImpl);

  return {
    type: 'github',
    label: 'GitHub',
    description: '让助手读取仓库里的文件，并通过 Pull Request 提交修改（合并前需要你确认）。',
    fields: [
      { key: 'token', label: '细粒度访问令牌', kind: 'password', required: true, placeholder: 'github_pat_…', secret: true },
      { key: 'apiBaseUrl', label: '接口地址（可选）', kind: 'url', required: false, placeholder: 'https://api.github.com' },
    ],

    async verify(config) {
      const gh = client(config);
      try {
        const user = await gh.json<{ login: string }>('GET', '/user');
        return { account: user.login };
      } catch (err) {
        // Some fine-grained tokens cannot read /user; the repository list still proves they work.
        if (err instanceof GitHubError && (err.status === 403 || err.status === 404)) {
          await gh.json('GET', '/user/repos?per_page=1');
          return { account: '' };
        }
        throw err;
      }
    },

    async listResources(config): Promise<Resource[]> {
      const repos = await client(config).json<any[]>('GET', '/user/repos?per_page=100&sort=pushed');
      return repos.map((r) => ({ id: r.full_name, name: r.full_name, description: r.description ?? undefined }));
    },

    createTools(resource, config, ctx) {
      if (!REPO_RE.test(resource)) throw new Error(`仓库名不合法：${resource}`);
      return buildTools(client(config), resource, ctx);
    },

    async cardAction(card, action, config) {
      if (card.type !== 'pull_request') throw new Error('不支持的卡片类型');
      return pullRequestAction(client(config), card, action);
    },
  };
}

function buildTools(gh: GitHubClient, repo: string, ctx: ToolContext): ToolRuntime {
  const cards: Card[] = [];

  const listDirectory: ToolDef = {
    name: 'list_directory',
    description: `列出仓库 ${repo} 默认分支里某个目录的内容。path 留空表示仓库根目录。`,
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '目录路径，例如 src/components；根目录留空' } },
    },
    async run(args) {
      const path = cleanPath(args.path, { allowEmpty: true });
      const res = await gh.raw('GET', `/repos/${repo}/contents/${encodePath(path)}`);
      const data = await res.json();
      if (!Array.isArray(data)) return `${path} 是一个文件，请用 read_file 读取。`;
      if (!data.length) return '（空目录）';
      return data
        .map((e: any) => `${e.type === 'dir' ? '目录' : '文件'} ${e.path}${e.type === 'file' ? `（${e.size} 字节）` : ''}`)
        .join('\n');
    },
  };

  const readFile: ToolDef = {
    name: 'read_file',
    description: `读取仓库 ${repo} 默认分支里的一个文本文件。`,
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '文件路径，例如 src/index.ts' } },
      required: ['path'],
    },
    async run(args) {
      const path = cleanPath(args.path);
      const res = await gh.raw('GET', `/repos/${repo}/contents/${encodePath(path)}`, undefined, 'application/vnd.github.raw+json');
      if ((res.headers.get('content-type') ?? '').includes('json')) {
        const data: any = await res.json();
        if (Array.isArray(data)) return `${path} 是一个目录，请用 list_directory 查看。`;
        if (typeof data?.content === 'string' && data.encoding === 'base64') return limit(decodeBase64Utf8(data.content));
        return `无法读取 ${path}`;
      }
      return limit(await res.text());
    },
  };

  const createPullRequest: ToolDef = {
    name: 'create_pull_request',
    description:
      `把对仓库 ${repo} 的修改提交到一个新分支并创建 Pull Request。你不能合并它：用户会在聊天里看到确认卡片，点"同意合并"后才会合并。` +
      '每个文件都要给出完整的新内容（不是差异）。先用 read_file 读过原文件再修改。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'PR 标题，简短说明改了什么' },
        description: { type: 'string', description: 'PR 说明：为什么改、改了什么' },
        files: {
          type: 'array',
          description: `要新增、修改或删除的文件，最多 ${MAX_FILES_PER_PR} 个`,
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string', description: '文件的完整新内容；删除文件时省略' },
              delete: { type: 'boolean', description: '设为 true 表示删除这个文件' },
            },
            required: ['path'],
          },
        },
      },
      required: ['title', 'files'],
    },
    async run(args) {
      const card = await openPullRequest(gh, repo, args, ctx);
      cards.push(card);
      return (
        `已在新分支 ${card.branch} 提交，并创建了 PR #${card.number}（${card.files.length} 个文件，+${card.additions} −${card.deletions}）。` +
        '这个 PR 需要用户在聊天里点"同意合并"后才会合并，你不能合并。请用一两句话告诉用户你改了什么。'
      );
    },
  };

  return {
    tools: [listDirectory, readFile, createPullRequest],
    cards,
    instructions: [
      `这个对话绑定了 GitHub 仓库 ${repo}。你可以用工具读取其中的目录和文件，不用凭空猜测代码。`,
      '需要改代码时，先读相关文件，再调用 create_pull_request 提交：修改会进入新分支并开 PR，由用户确认后才合并，你不能合并。',
      '不要修改 .github/workflows 里的文件。',
    ].join('\n'),
  };
}

function limit(text: string): string {
  if (text.includes('\u0000')) return '这是二进制文件，无法显示。';
  return text.length > MAX_READ_CHARS ? `${text.slice(0, MAX_READ_CHARS)}\n…（文件太长，只显示了前 ${MAX_READ_CHARS} 个字符）` : text;
}

async function openPullRequest(gh: GitHubClient, repo: string, args: Record<string, unknown>, ctx: ToolContext): Promise<PullRequestCard> {
  const title = String(args.title ?? '').trim().slice(0, 200);
  const description = String(args.description ?? '').trim();
  if (!title) throw new Error('缺少 PR 标题');
  if (!Array.isArray(args.files) || !args.files.length) throw new Error('至少要修改一个文件');
  if (args.files.length > MAX_FILES_PER_PR) throw new Error(`一次最多修改 ${MAX_FILES_PER_PR} 个文件`);

  let total = 0;
  const seen = new Set<string>();
  const entries = (args.files as Record<string, unknown>[]).map((f) => {
    const path = cleanPath(f?.path);
    if (isProtectedPath(path)) throw new Error(`不能修改 ${path}：助手不允许改 CI 工作流`);
    if (seen.has(path)) throw new Error(`文件重复：${path}`);
    seen.add(path);
    if (f.delete === true) return { path, mode: '100644', type: 'blob', sha: null };
    if (typeof f.content !== 'string') throw new Error(`缺少 ${path} 的完整内容`);
    if (f.content.length > MAX_FILE_CHARS) throw new Error(`${path} 太大`);
    total += f.content.length;
    return { path, mode: '100644', type: 'blob', content: f.content };
  });
  if (total > MAX_TOTAL_CHARS) throw new Error('这次修改的内容太多，请拆成几个 PR');

  const base: string = (await gh.json('GET', `/repos/${repo}`)).default_branch;
  const baseSha: string = (await gh.json('GET', `/repos/${repo}/git/ref/heads/${encodePath(base)}`)).object.sha;
  const baseTree: string = (await gh.json('GET', `/repos/${repo}/git/commits/${baseSha}`)).tree.sha;
  const tree = await gh.json('POST', `/repos/${repo}/git/trees`, { base_tree: baseTree, tree: entries });
  const commit = await gh.json('POST', `/repos/${repo}/git/commits`, {
    message: description ? `${title}\n\n${description}` : title,
    tree: tree.sha,
    parents: [baseSha],
  });
  const branch = `agenthub/${slug(title)}-${crypto.randomUUID().slice(0, 6)}`;
  await gh.json('POST', `/repos/${repo}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
  const pr = await gh.json('POST', `/repos/${repo}/pulls`, {
    title,
    head: branch,
    base,
    body: `${description}${description ? '\n\n' : ''}---\n由 AgentHub 里的助手「${ctx.assistantName}」创建；需要在 AgentHub 里确认后才会合并。`,
  });
  const changed = await gh.json<any[]>('GET', `/repos/${repo}/pulls/${pr.number}/files?per_page=100`);
  const files: PullRequestFile[] = changed.map((f) => ({
    path: f.filename,
    status: f.status,
    additions: f.additions ?? 0,
    deletions: f.deletions ?? 0,
  }));

  return {
    type: 'pull_request',
    integrationId: ctx.integrationId,
    repo,
    number: pr.number,
    title,
    url: pr.html_url,
    branch,
    base,
    files,
    additions: files.reduce((n, f) => n + f.additions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
    state: 'open',
  };
}

async function deleteBranch(gh: GitHubClient, card: PullRequestCard) {
  try {
    await gh.raw('DELETE', `/repos/${card.repo}/git/refs/heads/${encodePath(card.branch)}`);
  } catch {
    // The branch may already be gone, or the token cannot delete it; the PR state matters more.
  }
}

async function pullRequestAction(gh: GitHubClient, card: PullRequestCard, action: 'merge' | 'reject'): Promise<PullRequestCard> {
  if (card.state === 'merged' || card.state === 'closed') return card;
  const path = `/repos/${card.repo}/pulls/${card.number}`;
  const current = await gh.json('GET', path);
  // Someone may have acted on GitHub already.
  if (current.merged) return { ...card, state: 'merged', error: undefined };
  if (current.state === 'closed') return { ...card, state: 'closed', error: undefined };

  if (action === 'reject') {
    await gh.json('PATCH', path, { state: 'closed' });
    await deleteBranch(gh, card);
    return { ...card, state: 'closed', error: undefined };
  }

  let merged: { sha?: string } | undefined;
  try {
    merged = await gh.json('PUT', `${path}/merge`, { merge_method: 'squash', commit_title: `${card.title} (#${card.number})` });
  } catch (err) {
    if (err instanceof GitHubError && (err.status === 405 || err.status === 409 || err.status === 422)) {
      return { ...card, state: 'failed', error: `无法合并：${err.message.replace(/^GitHub 返回 \d+：/, '')}` };
    }
    throw err;
  }
  await deleteBranch(gh, card);
  return { ...card, state: 'merged', error: undefined, mergeSha: merged?.sha };
}
