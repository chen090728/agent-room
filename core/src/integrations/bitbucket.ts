import type { Card } from '../types.js';
import {
  REPO_TWO,
  buildCodeHostTools,
  codeHostCardAction,
  encodePath,
  isProtectedCodePath,
  prBody,
  type CodeHost,
  type ExistingFile,
} from './code-host.js';
import { ForgeClient, ForgeError, basicAuth } from './forge-http.js';
import type { IntegrationType, Resource, ToolContext } from './types.js';

function workspaceOf(config: Record<string, string>): string {
  const workspace = (config.workspace ?? '').trim();
  if (!/^[\w.-]+$/.test(workspace)) throw new Error('工作区名称不合法');
  return workspace;
}

function apiBase(input: string | undefined): string {
  const raw = (input?.trim() || 'https://api.bitbucket.org/2.0').replace(/\/+$/, '');
  if (/\/2\.0$/.test(raw)) return raw;
  if (/api\.bitbucket\.org$/i.test(raw)) return `${raw}/2.0`;
  return raw;
}

function client(config: Record<string, string>, fetchImpl: typeof fetch): ForgeClient {
  const token = config.token ?? '';
  const user = (config.username ?? '').trim();
  const authorization = user ? basicAuth(user, token) : `Bearer ${token}`;
  return new ForgeClient({
    label: 'Bitbucket',
    base: apiBase(config.apiBaseUrl),
    headers: { Authorization: authorization },
    secrets: [token, user ? `${user}:${token}` : '', authorization.startsWith('Basic ') ? authorization.slice('Basic '.length) : ''].filter(Boolean),
    fetchImpl,
  });
}

function splitRepo(repo: string, workspace: string): { workspace: string; slug: string } {
  const slash = repo.indexOf('/');
  const ws = repo.slice(0, slash);
  const slug = repo.slice(slash + 1);
  if (!slug || ws.toLowerCase() !== workspace.toLowerCase()) throw new Error(`仓库不属于工作区 ${workspace}：${repo}`);
  return { workspace: ws, slug };
}

function isListing(res: { contentType: string; json: any }): boolean {
  const values = res.json?.values;
  if (!res.contentType.includes('json') || !Array.isArray(values)) return false;
  if (!values.length) return res.json.pagelen != null || res.json.page != null || res.json.size != null;
  const type = values[0]?.type;
  return type === 'commit_file' || type === 'commit_directory';
}

class BitbucketRepo implements CodeHost {
  readonly label = 'Bitbucket';
  private tip: Promise<{ base: string; hash: string }> | null = null;
  private parts: { workspace: string; slug: string };

  constructor(
    private api: ForgeClient,
    readonly repo: string,
    workspace: string,
  ) {
    this.parts = splitRepo(repo, workspace);
  }

  protectedPath(path: string): boolean {
    return isProtectedCodePath('bitbucket', path);
  }

  private root(): string {
    return `/repositories/${encodeURIComponent(this.parts.workspace)}/${encodeURIComponent(this.parts.slug)}`;
  }

  private async head(): Promise<{ base: string; hash: string }> {
    this.tip ??= (async () => {
      const info = await this.api.json<{ mainbranch?: { name?: string } }>('GET', this.root());
      const base = info.mainbranch?.name || 'main';
      const ref = await this.api.json<{ target?: { hash?: string } }>('GET', `${this.root()}/refs/branches/${encodeURIComponent(base)}`);
      if (!ref.target?.hash) throw new Error('找不到默认分支');
      return { base, hash: ref.target.hash };
    })();
    return this.tip;
  }

  private src(hash: string, path: string): string {
    const suffix = path ? encodePath(path) : '';
    return `${this.root()}/src/${encodeURIComponent(hash)}/${suffix}?pagelen=100`;
  }

  async listDirectory(path: string) {
    const { hash } = await this.head();
    const res = await this.api.send('GET', this.src(hash, path), { accept: '*/*', acceptStatus: [404] });
    if (res.status === 404) throw new ForgeError(`在 Bitbucket 上找不到（${path || '仓库根目录'}）`, 404);
    if (isListing(res)) {
      return (res.json.values as { path: string; type: string; size?: number }[]).map((entry) => ({
        path: entry.path,
        type: entry.type === 'commit_directory' ? ('dir' as const) : ('file' as const),
        size: entry.type === 'commit_file' ? entry.size : undefined,
      }));
    }
    return 'file' as const;
  }

  async readFile(path: string) {
    const { hash } = await this.head();
    const res = await this.api.send('GET', this.src(hash, path), { accept: '*/*', acceptStatus: [404] });
    if (res.status === 404) throw new ForgeError(`在 Bitbucket 上找不到（${path}）`, 404);
    if (isListing(res)) return { kind: 'dir' as const };
    if (res.text.includes('\u0000')) return { kind: 'binary' as const };
    return { kind: 'text' as const, text: res.text };
  }

  async readExisting(path: string): Promise<ExistingFile> {
    const { hash } = await this.head();
    const res = await this.api.send('GET', this.src(hash, path), { accept: '*/*', acceptStatus: [404] });
    if (res.status === 404) return { exists: false, text: null };
    if (isListing(res)) throw new Error(`${path} 是一个目录`);
    if (res.text.includes('\u0000')) return { exists: true, text: null };
    return { exists: true, text: res.text };
  }

  async open(input: Parameters<CodeHost['open']>[0]) {
    const { base, hash } = await this.head();
    await this.api.json('POST', `${this.root()}/refs/branches`, { name: input.branch, target: { hash } });
    const form = new FormData();
    form.append('message', input.description ? `${input.title}\n\n${input.description}` : input.title);
    form.append('branch', input.branch);
    for (const file of input.files) {
      if (file.delete) form.append('files', file.path);
      // A Blob keeps the bytes. A plain string field is normalized to CRLF and would change the file.
      else form.append(file.path, new Blob([file.content ?? ''], { type: 'application/octet-stream' }), file.path.split('/').pop() || 'file');
    }
    try {
      await this.api.send('POST', `${this.root()}/src`, { form });
    } catch (err) {
      await this.deleteBranch(input.branch);
      throw err;
    }
    const pr = await this.api.json<{ id: number; links?: { html?: { href?: string } } }>('POST', `${this.root()}/pullrequests`, {
      title: input.title,
      description: prBody(input.description, input.assistantName),
      source: { branch: { name: input.branch } },
      destination: { branch: { name: base } },
      close_source_branch: false,
    });
    return { number: pr.id, url: pr.links?.html?.href ?? '', base };
  }

  async getRequest(number: number) {
    const pr = await this.api.json<{ state?: string; merge_commit?: { hash?: string } }>('GET', `${this.root()}/pullrequests/${number}`);
    const state = String(pr.state ?? '').toUpperCase();
    if (state === 'MERGED') return { state: 'merged' as const, mergeSha: pr.merge_commit?.hash };
    if (state === 'DECLINED' || state === 'SUPERSEDED') return { state: 'closed' as const };
    return { state: 'open' as const };
  }

  async merge(number: number, title: string) {
    const pr = await this.api.json<{ merge_commit?: { hash?: string } }>('POST', `${this.root()}/pullrequests/${number}/merge`, {
      merge_strategy: 'squash',
      close_source_branch: true,
      message: `${title} (#${number})`,
    });
    return { sha: pr.merge_commit?.hash };
  }

  async close(number: number) {
    await this.api.json('POST', `${this.root()}/pullrequests/${number}/decline`);
  }

  async deleteBranch(branch: string) {
    try {
      await this.api.send('DELETE', `${this.root()}/refs/branches/${encodeURIComponent(branch)}`, { acceptStatus: [404] });
    } catch {
      // Already deleted, or the token cannot delete it.
    }
  }
}

export function createBitbucketIntegration(fetchImpl: typeof fetch = fetch): IntegrationType & Required<Pick<IntegrationType, 'createTools' | 'cardAction'>> {
  return {
    type: 'bitbucket',
    label: 'Bitbucket',
    description: '让助手读取 Bitbucket Cloud 仓库里的文件，并通过 Pull Request 提交修改（合并前需要你确认）。',
    fields: [
      { key: 'workspace', label: '工作区', kind: 'text', required: true, placeholder: 'my-team' },
      { key: 'token', label: 'API 令牌', kind: 'password', required: true, placeholder: 'ATATT…', secret: true },
      { key: 'username', label: '邮箱或用户名（可选）', kind: 'text', required: false, placeholder: 'you@example.com' },
      { key: 'apiBaseUrl', label: '接口地址（可选）', kind: 'url', required: false, placeholder: 'https://api.bitbucket.org/2.0' },
    ],

    async verify(config) {
      const workspace = workspaceOf(config);
      const api = client(config, fetchImpl);
      try {
        const user = await api.json<{ username?: string; display_name?: string; nickname?: string }>('GET', '/user');
        return { account: user.username || user.nickname || user.display_name || '' };
      } catch (err) {
        if (err instanceof ForgeError && (err.status === 403 || err.status === 404)) {
          const found = await api.json<{ slug?: string; name?: string }>('GET', `/workspaces/${encodeURIComponent(workspace)}`);
          return { account: found.slug || found.name || workspace };
        }
        throw err;
      }
    },

    async listResources(config): Promise<Resource[]> {
      const workspace = workspaceOf(config);
      const page = await client(config, fetchImpl).json<{ values?: any[] }>('GET', `/repositories/${encodeURIComponent(workspace)}?pagelen=100&sort=-updated_on`);
      return (page.values ?? []).map((repo) => ({
        id: repo.full_name,
        name: repo.full_name,
        description: repo.description || undefined,
      }));
    },

    createTools(resource, config, ctx: ToolContext) {
      if (!REPO_TWO.test(resource)) throw new Error(`仓库名不合法：${resource}`);
      return buildCodeHostTools(new BitbucketRepo(client(config, fetchImpl), resource, workspaceOf(config)), ctx);
    },

    async cardAction(card: Card, action, config) {
      if (card.type !== 'pull_request') throw new Error('不支持的卡片类型');
      if (!REPO_TWO.test(card.repo)) throw new Error(`仓库名不合法：${card.repo}`);
      return codeHostCardAction(new BitbucketRepo(client(config, fetchImpl), card.repo, workspaceOf(config)), card, action);
    },
  };
}
