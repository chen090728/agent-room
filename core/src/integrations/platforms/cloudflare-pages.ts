import type { DeployStatus, IntegrationType } from '../types.js';
import { PlatformClient } from './http.js';

const API = 'https://api.cloudflare.com/client/v4';

function toStatus(d: any): DeployStatus {
  const stage = d?.latest_stage ?? {};
  const failed = stage.status === 'failure' || stage.status === 'canceled';
  const state: DeployStatus['state'] = failed
    ? 'error'
    : stage.name === 'deploy' && stage.status === 'success'
      ? 'ready'
      : stage.name === 'queued'
        ? 'queued'
        : 'building';
  return {
    state,
    id: d?.id,
    url: d?.url ?? undefined,
    error: state === 'error' ? (stage.status === 'canceled' ? '部署被取消了' : `部署在「${stage.name ?? '构建'}」这一步失败了，请到 Cloudflare 查看日志`) : undefined,
  };
}

/** Cloudflare wraps every answer as { success, result, errors }. */
const result = (body: any) => body?.result;

export function createCloudflarePagesIntegration(fetchImpl: typeof fetch = fetch): IntegrationType {
  const client = (config: Record<string, string>) =>
    new PlatformClient({
      label: 'Cloudflare',
      base: API,
      headers: { Authorization: `Bearer ${config.apiToken ?? ''}` },
      secrets: [config.apiToken],
      fetchImpl,
    });
  const acct = (config: Record<string, string>) => `/accounts/${encodeURIComponent(config.accountId ?? '')}/pages/projects`;

  return {
    type: 'cloudflare-pages',
    label: 'Cloudflare Pages',
    description: '合并后跟踪 Cloudflare Pages 的部署进度，完成后在群里给出预览链接。项目需要已经连接了这个 GitHub 仓库；没有自动部署时会主动触发一次。',
    fields: [
      { key: 'apiToken', label: 'API 令牌', kind: 'password', required: true, placeholder: '需要"Cloudflare Pages：编辑"权限', secret: true },
      { key: 'accountId', label: '账户 ID', kind: 'text', required: true, placeholder: '32 位字母数字，在 Cloudflare 后台的网址里' },
    ],

    async verify(config) {
      // Listing Pages projects proves both the token and the account id are right.
      await client(config).request('GET', `${acct(config)}?per_page=1`);
      return { account: `账户 ${config.accountId.slice(0, 6)}…` };
    },

    async listResources(config) {
      const projects = result(await client(config).request('GET', `${acct(config)}?per_page=100`)) ?? [];
      return projects.map((p: any) => ({
        id: p.name,
        name: p.name,
        description: p.source?.config?.owner && p.source?.config?.repo_name ? `${p.source.config.owner}/${p.source.config.repo_name}` : undefined,
      }));
    },

    deploy: {
      async find(project, ctx, config) {
        const list = result(await client(config).request('GET', `${acct(config)}/${encodeURIComponent(project)}/deployments?per_page=10`)) ?? [];
        const match = list.find((d: any) => d.deployment_trigger?.metadata?.commit_hash === ctx.sha);
        return match ? toStatus(match) : null;
      },
      async trigger(project, ctx, config) {
        const form = new FormData();
        form.append('branch', ctx.branch);
        const d = result(await client(config).request('POST', `${acct(config)}/${encodeURIComponent(project)}/deployments`, { form }));
        return { ...toStatus(d), state: 'queued' };
      },
      async status(project, deployId, config) {
        return toStatus(result(await client(config).request('GET', `${acct(config)}/${encodeURIComponent(project)}/deployments/${encodeURIComponent(deployId)}`)));
      },
    },
  };
}
