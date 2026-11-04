import type { Card } from '../types.js';
import {
  REPO_TWO,
  buildCodeHostTools,
  codeHostCardAction,
  decodeBase64Utf8,
  encodeBase64Utf8,
  encodePath,
  isProtectedCodePath,
  prBody,
  type CodeHost,
  type ExistingFile,
} from './code-host.js';
import { ForgeClient, ForgeError, siteApi } from './forge-http.js';
import type { IntegrationType, Resource, ToolContext } from './types.js';

function client(config: Record<string, string>, fetchImpl: typeof fetch): ForgeClient {
  const token = config.token ?? '';
  return new ForgeClient({
    label: 'Gitea',
    base: siteApi(config.apiBaseUrl, '', '/api/v1'),
    headers: { Authorization: `token ${token}` },
    secrets: [token],
    fetchImpl,
  });
}

function parts(repo: string): { owner: string; name: string } {
  const slash = repo.indexOf('/');
  return { owner: repo.slice(0, slash), name: repo.slice(slash + 1) };
}

class GiteaRepo implements CodeHost {
  readonly label = 'Gitea';
  private baseBranch: Promise<string> | null = null;
  private owner: string;
  private name: string;

  constructor(
    private api: ForgeClient,
    readonly repo: string,
  ) {
    const split = parts(repo);
    this.owner = split.owner;
    this.name = split.name;
  }

  protectedPath(path: string): boolean {
    return isProtectedCodePath('gitea', path);
  }

  private root(): string {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.name)}`;
  }

  private async base(): Promise<string> {
    this.baseBranch ??= this.api.json<{ default_branch: string }>('GET', this.root()).then((repo) => repo.default_branch);
    return this.baseBranch;
  }

  private async contents(path: string, acceptStatus: number[] = []) {
    const ref = await this.base();
    const suffix = path ? `/${encodePath(path)}` : '';
    return this.api.send('GET', `${this.root()}/contents${suffix}?ref=${encodeURIComponent(ref)}`, { acceptStatus });
  }

  async listDirectory(path: string) {
    const res = await this.contents(path, [404]);
    if (res.status === 404) throw new ForgeError(`在 Gitea 上找不到（${path || '仓库根目录'}）`, 404);
    if (Array.isArray(res.json)) {
      return res.json.map((entry: { path: string; type: string; size?: number }) => ({
        path: entry.path,
        type: entry.type === 'dir' ? ('dir' as const) : ('file' as const),
        size: entry.type === 'file' ? entry.size : undefined,
      }));
    }
    return 'file' as const;
  }

  async readFile(path: string) {
    const res = await this.contents(path, [404]);
    if (res.status === 404) throw new ForgeError(`在 Gitea 上找不到（${path}）`, 404);
    if (Array.isArray(res.json)) return { kind: 'dir' as const };
    const data = res.json ?? {};
    if (data.encoding === 'base64' && typeof data.content === 'string') {
      const text = decodeBase64Utf8(data.content);
      if (text.includes('\u0000')) return { kind: 'binary' as const };
      return { kind: 'text' as const, text };
    }
    return { kind: 'binary' as const };
  }

  async readExisting(path: string): Promise<ExistingFile> {
    const res = await this.contents(path, [404]);
    if (res.status === 404) return { exists: false, text: null };
    if (Array.isArray(res.json)) throw new Error(`${path} 是一个目录`);
    const data = res.json ?? {};
    const text = data.encoding === 'base64' && typeof data.content === 'string' ? decodeBase64Utf8(data.content) : null;
    return { exists: true, text: text?.includes('\u0000') ? null : text, sha: typeof data.sha === 'string' ? data.sha : undefined };
  }

  async open(input: Parameters<CodeHost['open']>[0]) {
    const base = await this.base();
    await this.api.json('POST', `${this.root()}/contents`, {
      branch: base,
      new_branch: input.branch,
      message: input.description ? `${input.title}\n\n${input.description}` : input.title,
      files: input.files.map((file) => {
        if (file.delete) {
          if (!file.existing.sha) throw new Error(`找不到 ${file.path} 的版本，无法删除`);
          return { operation: 'delete', path: file.path, sha: file.existing.sha };
        }
        const content = encodeBase64Utf8(file.content ?? '');
        if (!file.existing.exists) return { operation: 'create', path: file.path, content };
        if (!file.existing.sha) throw new Error(`找不到 ${file.path} 的版本，无法修改`);
        return { operation: 'update', path: file.path, content, sha: file.existing.sha };
      }),
    });
    const pr = await this.api.json<{ number: number; html_url?: string; url?: string }>('POST', `${this.root()}/pulls`, {
      title: input.title,
      body: prBody(input.description, input.assistantName),
      head: input.branch,
      base,
    });
    return { number: pr.number, url: pr.html_url || pr.url || '', base };
  }

  async getRequest(number: number) {
    const pr = await this.api.json<{ merged?: boolean; state?: string; merge_commit_sha?: string }>('GET', `${this.root()}/pulls/${number}`);
    if (pr.merged) return { state: 'merged' as const, mergeSha: pr.merge_commit_sha };
    if (pr.state === 'closed') return { state: 'closed' as const };
    return { state: 'open' as const };
  }

  async merge(number: number, title: string) {
    await this.api.json('POST', `${this.root()}/pulls/${number}/merge`, {
      Do: 'squash',
      MergeTitleField: `${title} (#${number})`,
      MergeMessageField: `${title} (#${number})`,
      delete_branch_after_merge: true,
    });
    const pr = await this.api.json<{ merge_commit_sha?: string }>('GET', `${this.root()}/pulls/${number}`);
    return { sha: pr.merge_commit_sha };
  }

  async close(number: number) {
    await this.api.json('PATCH', `${this.root()}/pulls/${number}`, { state: 'closed' });
  }

  async deleteBranch(branch: string) {
    try {
      await this.api.send('DELETE', `${this.root()}/branches/${encodeURIComponent(branch)}`, { acceptStatus: [404] });
    } catch {
      // The branch may already be gone.
    }
  }
}

export function createGiteaIntegration(fetchImpl: typeof fetch = fetch): IntegrationType & Required<Pick<IntegrationType, 'createTools' | 'cardAction'>> {
  return {
    type: 'gitea',
    label: 'Gitea / Forgejo',
    description: '让助手读取 Gitea 或 Forgejo 仓库里的文件，并通过 Pull Request 提交修改（合并前需要你确认）。',
    fields: [
      { key: 'apiBaseUrl', label: '网站地址', kind: 'url', required: true, placeholder: 'https://gitea.example.com' },
      { key: 'token', label: '访问令牌', kind: 'password', required: true, placeholder: '令牌', secret: true },
    ],

    async verify(config) {
      if (!config.apiBaseUrl?.trim()) throw new Error('请填写网站地址');
      const api = client(config, fetchImpl);
      try {
        const user = await api.json<{ login?: string; username?: string }>('GET', '/user');
        return { account: user.login || user.username || '' };
      } catch (err) {
        if (err instanceof ForgeError && (err.status === 403 || err.status === 404)) {
          await api.json('GET', '/user/repos?limit=1');
          return { account: '' };
        }
        throw err;
      }
    },

    async listResources(config): Promise<Resource[]> {
      const repos = await client(config, fetchImpl).json<any[]>('GET', '/user/repos?limit=50');
      return (repos ?? []).map((repo) => ({
        id: repo.full_name,
        name: repo.full_name,
        description: repo.description || undefined,
      }));
    },

    createTools(resource, config, ctx: ToolContext) {
      if (!REPO_TWO.test(resource)) throw new Error(`仓库名不合法：${resource}`);
      return buildCodeHostTools(new GiteaRepo(client(config, fetchImpl), resource), ctx);
    },

    async cardAction(card: Card, action, config) {
      if (card.type !== 'pull_request') throw new Error('不支持的卡片类型');
      if (!REPO_TWO.test(card.repo)) throw new Error(`仓库名不合法：${card.repo}`);
      return codeHostCardAction(new GiteaRepo(client(config, fetchImpl), card.repo), card, action);
    },
  };
}
