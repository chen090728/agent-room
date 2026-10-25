import type { DeployStatus, IntegrationType } from '../types.js';
import { PlatformClient } from './http.js';

const API = 'https://api.vercel.com';

function mapState(state: string | undefined): DeployStatus['state'] {
  switch (state) {
    case 'READY':
      return 'ready';
    case 'ERROR':
    case 'CANCELED':
      return 'error';
    case 'QUEUED':
      return 'queued';
    default:
      return 'building'; // INITIALIZING, BUILDING, and anything new
  }
}

function toStatus(d: any): DeployStatus {
  const state = mapState(d.readyState ?? d.state);
  return {
    state,
    id: d.uid ?? d.id,
    url: d.url ? `https://${d.url}` : undefined,
    error: state === 'error' ? d.errorMessage ?? ((d.readyState ?? d.state) === 'CANCELED' ? '部署被取消了' : '部署失败，请到 Vercel 查看日志') : undefined,
  };
}

export function createVercelIntegration(fetchImpl: typeof fetch = fetch): IntegrationType {
  const client = (config: Record<string, string>) =>
    new PlatformClient({
      label: 'Vercel',
      base: config.apiBaseUrl || API,
      headers: { Authorization: `Bearer ${config.token ?? ''}` },
      query: config.teamId ? { teamId: config.teamId } : undefined,
      secrets: [config.token],
      fetchImpl,
    });

  return {
    type: 'vercel',
    label: 'Vercel',
    description: '合并后跟踪 Vercel 的部署进度，完成后在群里给出预览链接。需要项目已经在 Vercel 里连接了这个 GitHub 仓库。',
    fields: [
      { key: 'token', label: '访问令牌', kind: 'password', required: true, placeholder: '在 Vercel 的 Account Settings → Tokens 创建', secret: true },
      { key: 'teamId', label: '团队 ID（可选）', kind: 'text', required: false, placeholder: '项目属于团队时填写，形如 team_…' },
      { key: 'apiBaseUrl', label: '接口地址（可选）', kind: 'url', required: false, placeholder: '一般不用填' },
    ],

    async verify(config) {
      const { user } = await client(config).request('GET', '/v2/user');
      return { account: user?.username ?? user?.name ?? user?.email ?? '' };
    },

    async listResources(config) {
      const { projects = [] } = await client(config).request('GET', '/v9/projects?limit=100');
      return projects.map((p: any) => ({
        id: p.name,
        name: p.name,
        description: p.link?.org && p.link?.repo ? `${p.link.org}/${p.link.repo}` : undefined,
      }));
    },

    deploy: {
      async find(project, ctx, config) {
        const c = client(config);
        const found = await c.request('GET', `/v9/projects/${encodeURIComponent(project)}`);
        const { deployments = [] } = await c.request('GET', `/v6/deployments?projectId=${encodeURIComponent(found.id)}&limit=20`);
        const match = deployments.find((d: any) => d.meta?.githubCommitSha === ctx.sha);
        return match ? toStatus(match) : null;
      },
      // Vercel starts deployments from its own Git integration; there is no simple way to trigger one here.
      async status(_project, deployId, config) {
        return toStatus(await client(config).request('GET', `/v13/deployments/${encodeURIComponent(deployId)}`));
      },
    },
  };
}
