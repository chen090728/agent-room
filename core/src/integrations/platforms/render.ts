import { DEPLOY_CANCELED, deployPlatformFailed } from '../../copy.js';
import type { DeployStatus, IntegrationType } from '../types.js';
import { PlatformClient } from './http.js';

const API = 'https://api.render.com/v1';

function toStatus(raw: any): DeployStatus {
  const d = raw?.deploy ?? raw;
  const s: string = d?.status ?? '';
  const state: DeployStatus['state'] =
    s === 'live' || s === 'deactivated'
      ? 'ready'
      : ['build_failed', 'update_failed', 'pre_deploy_failed', 'canceled'].includes(s)
        ? 'error'
        : s === 'created'
          ? 'queued'
          : 'building';
  const failure = state === 'error' ? (s === 'canceled' ? DEPLOY_CANCELED : deployPlatformFailed('Render')) : undefined;
  return { state, id: d?.id, error: failure?.content, errorNotice: failure?.notice };
}

export function createRenderIntegration(fetchImpl: typeof fetch = fetch): IntegrationType {
  const client = (config: Record<string, string>) =>
    new PlatformClient({
      label: 'Render',
      base: config.apiBaseUrl || API,
      headers: { Authorization: `Bearer ${config.apiKey ?? ''}` },
      secrets: [config.apiKey],
      fetchImpl,
    });

  /** The address of a service, shown once its deployment is live. */
  const serviceUrl = async (c: PlatformClient, id: string): Promise<string | undefined> => {
    try {
      const service = await c.request('GET', `/services/${encodeURIComponent(id)}`);
      return service?.serviceDetails?.url ?? service?.service?.serviceDetails?.url ?? undefined;
    } catch {
      return undefined;
    }
  };

  const withUrl = async (c: PlatformClient, project: string, status: DeployStatus): Promise<DeployStatus> =>
    status.state === 'ready' ? { ...status, url: await serviceUrl(c, project) } : status;

  return {
    type: 'render',
    label: 'Render',
    description: '合并后跟踪 Render 的部署进度，完成后在群里给出链接。服务需要已经连接了这个 GitHub 仓库；没有自动部署时会主动触发一次。',
    fields: [
      { key: 'apiKey', label: 'API Key', kind: 'password', required: true, placeholder: '在 Render 的 Account Settings → API Keys 创建', secret: true },
      { key: 'apiBaseUrl', label: '接口地址（可选）', kind: 'url', required: false, placeholder: '一般不用填' },
    ],

    async verify(config) {
      const owners = await client(config).request<any[]>('GET', '/owners?limit=1');
      const owner = owners?.[0]?.owner;
      return { account: owner?.name ?? owner?.email ?? '' };
    },

    async listResources(config) {
      const items = await client(config).request<any[]>('GET', '/services?limit=100');
      return items.map((i) => {
        const s = i.service ?? i;
        return { id: s.id, name: s.name, description: s.repo ?? undefined };
      });
    },

    deploy: {
      async find(project, ctx, config) {
        const c = client(config);
        const items = await c.request<any[]>('GET', `/services/${encodeURIComponent(project)}/deploys?limit=10`);
        const match = items.map((i) => i.deploy ?? i).find((d) => d.commit?.id === ctx.sha);
        return match ? withUrl(c, project, toStatus(match)) : null;
      },
      async trigger(project, _ctx, config) {
        const d = await client(config).request('POST', `/services/${encodeURIComponent(project)}/deploys`, { body: { clearCache: 'do_not_clear' } });
        return { ...toStatus(d), state: 'queued' };
      },
      async status(project, deployId, config) {
        const c = client(config);
        const d = await c.request('GET', `/services/${encodeURIComponent(project)}/deploys/${encodeURIComponent(deployId)}`);
        return withUrl(c, project, toStatus(d));
      },
    },
  };
}
