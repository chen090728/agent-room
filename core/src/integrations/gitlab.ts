import type { Card } from '../types.js';
import {
  REPO_NESTED,
  buildCodeHostTools,
  codeHostCardAction,
  decodeBase64Utf8,
  isProtectedCodePath,
  prBody,
  type CodeHost,
  type ExistingFile,
} from './code-host.js';
import { ForgeClient, ForgeError, siteApi } from './forge-http.js';
import type { IntegrationType, Resource, ToolContext } from './types.js';

const DEFAULT_SITE = 'https://gitlab.com';

function client(config: Record<string, string>, fetchImpl: typeof fetch): ForgeClient {
  return new ForgeClient({
    label: 'GitLab',
    base: siteApi(config.apiBaseUrl, DEFAULT_SITE, '/api/v4'),
    headers: { 'PRIVATE-TOKEN': config.token ?? '' },
    secrets: [config.token ?? ''],
    fetchImpl,
  });
}

/** One GitLab project. `repo` may be `group/subgroup/project`. */
class GitLabRepo implements CodeHost {
  readonly label = 'GitLab';
  private baseBranch: Promise<string> | null = null;

  constructor(
    private api: ForgeClient,
    readonly repo: string,
  ) {}

  protectedPath(path: string): boolean {
    return isProtectedCodePath('gitlab', path);
  }

  private id(): string {
    return encodeURIComponent(this.repo);
  }

  private async base(): Promise<string> {
    this.baseBranch ??= this.api.json<{ default_branch: string }>('GET', `/projects/${this.id()}`).then((project) => project.default_branch);
    return this.baseBranch;
  }

  async listDirectory(path: string) {
    const ref = await this.base();
    const query = new URLSearchParams({ ref, per_page: '100' });
    if (path) query.set('path', path);
    const res = await this.api.send('GET', `/projects/${this.id()}/repository/tree?${query}`, { acceptStatus: [404] });
    if (res.status === 404) {
      if (!path) throw new ForgeError('在 GitLab 上找不到这个仓库', 404);
      const file = await this.api.send('GET', `/projects/${this.id()}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`, { acceptStatus: [404] });
      if (file.status === 200) return 'file' as const;
      throw new ForgeError(`在 GitLab 上找不到（${path}）`, 404);
    }
    const entries = Array.isArray(res.json) ? res.json : [];
    return entries.map((entry: { path: string; type: string }) => ({
      path: entry.path,
      type: entry.type === 'tree' ? ('dir' as const) : ('file' as const),
    }));
  }

  async readFile(path: string) {
    const ref = await this.base();
    const res = await this.api.send('GET', `/projects/${this.id()}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`, {
      accept: '*/*',
      acceptStatus: [404],
    });
    if (res.status === 404) {
      const listed = await this.listDirectory(path).catch((err: unknown) => {
        if (err instanceof ForgeError && err.status === 404) return 'file' as const;
        throw err;
      });
      if (Array.isArray(listed)) return { kind: 'dir' as const };
      throw new ForgeError(`在 GitLab 上找不到（${path}）`, 404);
    }
    if (res.text.includes('\u0000')) return { kind: 'binary' as const };
    return { kind: 'text' as const, text: res.text };
  }

  async readExisting(path: string): Promise<ExistingFile> {
    const ref = await this.base();
    const res = await this.api.send('GET', `/projects/${this.id()}/repository/files/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`, {
      acceptStatus: [404],
    });
    if (res.status === 404) return { exists: false, text: null };
    const data = res.json ?? {};
    if (data.encoding === 'base64' && typeof data.content === 'string') {
      const text = decodeBase64Utf8(data.content);
      return { exists: true, text: text.includes('\u0000') ? null : text };
    }
    return { exists: true, text: null };
  }

  async open(input: Parameters<CodeHost['open']>[0]) {
    const base = await this.base();
    await this.api.json('POST', `/projects/${this.id()}/repository/commits`, {
      branch: input.branch,
      start_branch: base,
      commit_message: input.description ? `${input.title}\n\n${input.description}` : input.title,
      actions: input.files.map((file) =>
        file.delete
          ? { action: 'delete', file_path: file.path }
          : { action: file.existing.exists ? 'update' : 'create', file_path: file.path, content: file.content ?? '' },
      ),
    });
    const mr = await this.api.json<{ iid: number; web_url: string }>('POST', `/projects/${this.id()}/merge_requests`, {
      source_branch: input.branch,
      target_branch: base,
      title: input.title,
      description: prBody(input.description, input.assistantName),
    });
    return { number: mr.iid, url: mr.web_url, base };
  }

  async getRequest(number: number) {
    const mr = await this.api.json<{ state: string; squash_commit_sha?: string; merge_commit_sha?: string }>('GET', `/projects/${this.id()}/merge_requests/${number}`);
    if (mr.state === 'merged') return { state: 'merged' as const, mergeSha: mr.squash_commit_sha || mr.merge_commit_sha };
    if (mr.state === 'closed') return { state: 'closed' as const };
    return { state: 'open' as const };
  }

  async merge(number: number, title: string) {
    const mr = await this.api.json<{ squash_commit_sha?: string; merge_commit_sha?: string }>('PUT', `/projects/${this.id()}/merge_requests/${number}/merge`, {
      squash: true,
      should_remove_source_branch: true,
      squash_commit_message: `${title} (!${number})`,
    });
    return { sha: mr.squash_commit_sha || mr.merge_commit_sha };
  }

  async close(number: number) {
    await this.api.json('PUT', `/projects/${this.id()}/merge_requests/${number}`, { state_event: 'close' });
  }

  async deleteBranch(branch: string) {
    try {
      await this.api.send('DELETE', `/projects/${this.id()}/repository/branches/${encodeURIComponent(branch)}`, { acceptStatus: [404] });
    } catch {
      // The branch may already be gone. The merge request state matters more.
    }
  }
}

export function createGitLabIntegration(fetchImpl: typeof fetch = fetch): IntegrationType & Required<Pick<IntegrationType, 'createTools' | 'cardAction'>> {
  return {
    type: 'gitlab',
    label: 'GitLab',
    description: '让助手读取 GitLab（含自建）仓库里的文件，并通过合并请求提交修改（合并前需要你确认）。',
    fields: [
      { key: 'token', label: '个人或群组访问令牌', kind: 'password', required: true, placeholder: 'glpat-…', secret: true },
      { key: 'apiBaseUrl', label: '网站地址（可选）', kind: 'url', required: false, placeholder: 'https://gitlab.com' },
    ],

    async verify(config) {
      const api = client(config, fetchImpl);
      try {
        const user = await api.json<{ username?: string; name?: string }>('GET', '/user');
        return { account: user.username || user.name || '' };
      } catch (err) {
        if (err instanceof ForgeError && (err.status === 403 || err.status === 404)) {
          await api.json('GET', '/projects?membership=true&simple=true&per_page=1');
          return { account: '' };
        }
        throw err;
      }
    },

    async listResources(config): Promise<Resource[]> {
      const projects = await client(config, fetchImpl).json<any[]>('GET', '/projects?membership=true&simple=true&per_page=100&order_by=last_activity_at&sort=desc');
      return (projects ?? []).map((project) => ({
        id: project.path_with_namespace,
        name: project.path_with_namespace,
        description: project.description || undefined,
      }));
    },

    createTools(resource, config, ctx: ToolContext) {
      if (!REPO_NESTED.test(resource)) throw new Error(`仓库名不合法：${resource}`);
      return buildCodeHostTools(new GitLabRepo(client(config, fetchImpl), resource), ctx);
    },

    async cardAction(card: Card, action, config) {
      if (card.type !== 'pull_request') throw new Error('不支持的卡片类型');
      if (!REPO_NESTED.test(card.repo)) throw new Error(`仓库名不合法：${card.repo}`);
      return codeHostCardAction(new GitLabRepo(client(config, fetchImpl), card.repo), card, action);
    },
  };
}
