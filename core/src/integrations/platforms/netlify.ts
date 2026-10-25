import type { DeployStatus, IntegrationType } from '../types.js';
import { PlatformClient } from './http.js';

const API = 'https://api.netlify.com/api/v1';

function toStatus(d: any): DeployStatus {
  const state: DeployStatus['state'] =
    d.state === 'ready' ? 'ready' : d.state === 'error' ? 'error' : d.state === 'new' || d.state === 'enqueued' ? 'queued' : 'building';
  return {
    state,
    id: d.id,
    url: d.deploy_ssl_url ?? d.ssl_url ?? d.url ?? undefined,
    error: state === 'error' ? d.error_message ?? '部署失败' : undefined,
  };
}

export function createNetlifyIntegration(fetchImpl: typeof fetch = fetch): IntegrationType {
  const client = (config: Record<string, string>) =>
    new PlatformClient({
      label: 'Netlify',
      base: config.apiBaseUrl || API,
      headers: { Authorization: `Bearer ${config.token ?? ''}` },
      secrets: [config.token],
      fetchImpl,
    });

  return {
    type: 'netlify',
    label: 'Netlify',
    description: '合并后跟踪 Netlify 的部署进度，完成后在群里给出预览链接。站点需要已经连接了这个 GitHub 仓库。',
    fields: [
      { key: 'token', label: '访问令牌', kind: 'password', required: true, placeholder: '在 Netlify 的 User settings → Applications 创建', secret: true },
      { key: 'apiBaseUrl', label: '接口地址（可选）', kind: 'url', required: false, placeholder: '一般不用填' },
    ],

    async verify(config) {
      const user = await client(config).request('GET', '/user');
      return { account: user?.email ?? user?.full_name ?? '' };
    },

    async listResources(config) {
      const sites = await client(config).request<any[]>('GET', '/sites?per_page=100');
      return sites.map((s) => ({ id: s.id, name: s.name, description: s.build_settings?.repo_url ?? s.ssl_url ?? undefined }));
    },

    deploy: {
      async find(project, ctx, config) {
        const deploys = await client(config).request<any[]>('GET', `/sites/${encodeURIComponent(project)}/deploys?per_page=10`);
        const match = deploys.find((d) => d.commit_ref === ctx.sha);
        return match ? toStatus(match) : null;
      },
      async trigger(project, _ctx, config) {
        const build = await client(config).request('POST', `/sites/${encodeURIComponent(project)}/builds`, { body: {} });
        return { state: 'queued', id: build?.deploy_id ?? build?.id };
      },
      async status(_project, deployId, config) {
        return toStatus(await client(config).request('GET', `/deploys/${encodeURIComponent(deployId)}`));
      },
    },
  };
}
