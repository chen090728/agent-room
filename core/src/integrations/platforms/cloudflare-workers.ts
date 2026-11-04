import { DEPLOY_CANCELED, deployPlatformFailed } from '../../copy.js';
import type { DeployStatus, IntegrationType } from '../types.js';
import { PlatformClient, PlatformError } from './http.js';

const API = 'https://api.cloudflare.com/client/v4';

/**
 * Cloudflare Workers Builds, separate from Pages.
 * Scripts are listed by name; builds are addressed by the script tag (`external_script_id`).
 * Trigger: list the Worker's build triggers, then POST /builds/triggers/{uuid}/builds with the commit.
 * Docs: https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/
 */

function cfResult(body: any): any {
  if (body && body.success === false) {
    const message = body.errors?.[0]?.message || '请求失败';
    throw new PlatformError(String(message), 400);
  }
  return body?.result;
}

function asList(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.builds)) return value.builds;
  if (Array.isArray(value?.triggers)) return value.triggers;
  return [];
}

function toStatus(d: any): DeployStatus {
  const outcome = String(d?.build_outcome ?? '').toLowerCase();
  const status = String(d?.status ?? '').toLowerCase();
  const canceled = outcome === 'cancelled' || outcome === 'canceled' || status === 'canceled' || status === 'cancelled';
  const failed = outcome === 'fail' || outcome === 'failed' || outcome === 'skipped' || status === 'failure' || status === 'failed';
  const state: DeployStatus['state'] = outcome === 'success'
    ? 'ready'
    : canceled || failed
      ? 'error'
      : status === 'queued' || status === 'pending'
        ? 'queued'
        : 'building';
  const failure = state === 'error' ? (canceled ? DEPLOY_CANCELED : deployPlatformFailed('Cloudflare Workers')) : undefined;
  return {
    state,
    id: d?.build_uuid ?? d?.id,
    error: failure?.content,
    errorNotice: failure?.notice,
  };
}

export function createCloudflareWorkersIntegration(fetchImpl: typeof fetch = fetch): IntegrationType {
  const client = (config: Record<string, string>) =>
    new PlatformClient({
      label: 'Cloudflare',
      base: config.apiBaseUrl || API,
      headers: { Authorization: `Bearer ${config.apiToken ?? ''}` },
      secrets: [config.apiToken],
      fetchImpl,
    });
  const account = (config: Record<string, string>) => `/accounts/${encodeURIComponent(config.accountId ?? '')}`;

  const scriptName = async (config: Record<string, string>, tag: string): Promise<string | undefined> => {
    const scripts = asList(cfResult(await client(config).request('GET', `${account(config)}/workers/scripts`)));
    const found = scripts.find((script) => script?.tag === tag || script?.id === tag);
    return typeof found?.id === 'string' ? found.id : undefined;
  };

  const withUrl = async (config: Record<string, string>, project: string, status: DeployStatus): Promise<DeployStatus> => {
    if (status.state !== 'ready') return status;
    try {
      const name = await scriptName(config, project);
      const subdomain = cfResult(await client(config).request('GET', `${account(config)}/workers/subdomain`))?.subdomain;
      if (!name || !subdomain) return status;
      return { ...status, url: `https://${name}.${subdomain}.workers.dev` };
    } catch {
      return status;
    }
  };

  return {
    type: 'cloudflare-workers',
    label: 'Cloudflare Workers',
    description: '合并后跟踪 Cloudflare Workers Builds 的构建（和 Pages 是两种连接）。Worker 需要已经在 Builds 里连接了 Git 仓库；没有自动构建时会按这次提交触发一次。',
    fields: [
      { key: 'apiToken', label: 'API 令牌', kind: 'password', required: true, placeholder: '用户令牌：Workers Scripts 读 + Workers Builds 编辑', secret: true },
      { key: 'accountId', label: '账户 ID', kind: 'text', required: true, placeholder: '32 位字母数字，在 Cloudflare 后台的网址里' },
      { key: 'apiBaseUrl', label: '接口地址（可选）', kind: 'url', required: false, placeholder: '一般不用填' },
    ],

    async verify(config) {
      cfResult(await client(config).request('GET', `${account(config)}/workers/scripts`));
      const id = config.accountId ?? '';
      return { account: `账户 ${id.slice(0, 6)}…` };
    },

    async listResources(config) {
      const scripts = asList(cfResult(await client(config).request('GET', `${account(config)}/workers/scripts`)));
      return scripts.map((script) => ({
        id: String(script.tag || script.id),
        name: String(script.id || script.tag),
      }));
    },

    deploy: {
      async find(project, ctx, config) {
        const builds = asList(cfResult(await client(config).request('GET', `${account(config)}/builds/workers/${encodeURIComponent(project)}/builds?per_page=20`)));
        const match = builds.find((build) => build?.build_trigger_metadata?.commit_hash === ctx.sha);
        return match ? withUrl(config, project, toStatus(match)) : null;
      },
      async trigger(project, ctx, config) {
        const c = client(config);
        const triggers = asList(cfResult(await c.request('GET', `${account(config)}/builds/workers/${encodeURIComponent(project)}/triggers`)));
        const chosen = triggers.find((trigger) => trigger?.branch === ctx.branch) ?? triggers[0];
        const uuid = chosen?.trigger_uuid ?? chosen?.uuid ?? chosen?.id;
        if (!uuid) throw new PlatformError('这个 Worker 还没有 Builds 触发器。请先在 Cloudflare 里把 Worker 连到 Git 仓库。', 400);
        const build = cfResult(
          await c.request('POST', `${account(config)}/builds/triggers/${encodeURIComponent(String(uuid))}/builds`, {
            body: { branch: ctx.branch, commit_hash: ctx.sha },
          }),
        );
        return toStatus(build);
      },
      async status(project, deployId, config) {
        const build = cfResult(await client(config).request('GET', `${account(config)}/builds/builds/${encodeURIComponent(deployId)}`));
        return withUrl(config, project, toStatus(build));
      },
    },
  };
}
