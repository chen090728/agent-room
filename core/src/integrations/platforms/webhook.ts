import { DEPLOY_FAILED, deployUpstream } from '../../copy.js';
import type { DeployContext, DeployStatus, IntegrationType } from '../types.js';
import { PlatformClient, PlatformError } from './http.js';

/**
 * Generic deploy hook for hosts without a first-party plugin.
 * Verify sends HEAD only, so connecting does not start a build.
 * A 2xx with no `state` is treated as finished. Return `state: "queued"` or `"building"`
 * only when `statusUrl` is set; otherwise the next poll cannot see progress and the
 * trigger is reported as ready. Placeholders in the status URL: `{id}` `{project}` `{sha}` `{branch}` `{repo}`.
 */

const STATES = {
  ready: ['ready', 'success', 'succeeded', 'live', 'completed', 'complete'],
  error: ['error', 'failed', 'failure', 'canceled', 'cancelled', 'crashed'],
  queued: ['queued', 'waiting', 'pending', 'waitingfordeployment'],
  building: ['building', 'deploying', 'in_progress', 'running', 'uploading'],
} as const;

function mapState(value: unknown): DeployStatus['state'] | undefined {
  const state = String(value ?? '').toLowerCase();
  if (!state) return undefined;
  if ((STATES.ready as readonly string[]).includes(state)) return 'ready';
  if ((STATES.error as readonly string[]).includes(state)) return 'error';
  if ((STATES.queued as readonly string[]).includes(state)) return 'queued';
  if ((STATES.building as readonly string[]).includes(state)) return 'building';
  return undefined;
}

function httpsUrl(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PlatformError(`${label}不是合法的网址`, 400);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new PlatformError(`${label}只支持 http 或 https`, 400);
  if (url.username || url.password) throw new PlatformError(`请把令牌填在单独的栏里，不要写进${label}`, 400);
  return url;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(id|sha|project|branch|repo)\}/g, (_, key: string) => encodeURIComponent(vars[key] ?? ''));
}

function toStatus(body: any, fallbackId: string): DeployStatus {
  const state = mapState(body?.state ?? body?.status);
  const id = String(body?.id ?? body?.deployment_id ?? fallbackId);
  const url = typeof body?.url === 'string' ? body.url : undefined;
  if (state === 'error') {
    const detail = typeof body?.error === 'string' && body.error ? body.error : DEPLOY_FAILED.content;
    const upstream = typeof body?.error === 'string' && body.error ? deployUpstream('Webhook', body.error) : undefined;
    return { state, id, url, error: detail, errorNotice: upstream?.errorNotice ?? DEPLOY_FAILED.notice };
  }
  return { state: state ?? 'ready', id, url };
}

export function createWebhookIntegration(fetchImpl: typeof fetch = fetch): IntegrationType {
  const clientFor = (url: string, config: Record<string, string>) => {
    const headers: Record<string, string> = {};
    if (config.token) headers.Authorization = `Bearer ${config.token}`;
    return new PlatformClient({
      label: 'Webhook',
      base: url,
      headers,
      secrets: [config.token, config.hookUrl, config.statusUrl].filter((item): item is string => !!item),
      fetchImpl,
    });
  };

  const hookUrl = (config: Record<string, string>) => httpsUrl(config.hookUrl ?? '', '部署地址').toString();

  const readStatus = async (config: Record<string, string>, vars: Record<string, string>, missingIsNull: boolean) => {
    if (!config.statusUrl?.trim()) return null;
    // Fill placeholders before parsing so `{id}` is not percent-encoded away by URL.toString().
    const url = httpsUrl(fill(config.statusUrl, vars), '状态地址').toString();
    try {
      const body = await clientFor(url, config).request<any>('GET', '');
      const reported = body?.sha ?? body?.commit;
      if (missingIsNull && typeof reported === 'string' && reported && vars.sha && reported !== vars.sha) return null;
      return toStatus(body, vars.id || vars.sha || 'webhook');
    } catch (err) {
      if (missingIsNull && err instanceof PlatformError && err.status === 404) return null;
      throw err;
    }
  };

  return {
    type: 'webhook',
    label: 'Webhook',
    description: '合并后向你自己的 https 地址 POST 一次部署请求，适合没有专用插件的托管平台。可以再填一个状态地址，用来继续查询进度。',
    fields: [
      { key: 'hookUrl', label: '部署地址', kind: 'url', required: true, placeholder: 'https://example.com/hooks/deploy', secret: true },
      { key: 'token', label: '令牌（可选）', kind: 'password', required: false, placeholder: '有的话放在 Authorization: Bearer', secret: true },
      { key: 'statusUrl', label: '状态地址（可选）', kind: 'url', required: false, placeholder: 'https://example.com/deploys/{id}', secret: true },
      { key: 'projectName', label: '项目名称（可选）', kind: 'text', required: false, placeholder: '绑定列表里显示的名字' },
    ],

    async verify(config) {
      const url = hookUrl(config);
      try {
        await clientFor(url, config).request('HEAD', '');
      } catch (err) {
        // Many deploy hooks only accept POST. HEAD must not be retried as POST: that would deploy.
        const unsupported = err instanceof PlatformError && [400, 404, 405, 501].includes(err.status);
        if (!unsupported) throw err;
      }
      return { account: new URL(url).hostname };
    },

    async listResources(config) {
      const name = config.projectName?.trim() || 'webhook';
      return [{ id: name, name, description: '自定义部署钩子' }];
    },

    deploy: {
      async find(project, ctx, config) {
        const found = await readStatus(config, placeholders(project, ctx, ''), true);
        if (!found) return null;
        return found;
      },
      async trigger(project, ctx, config) {
        const url = hookUrl(config);
        const body = await clientFor(url, config).request('POST', '', {
          body: { event: 'deploy', project, repo: ctx.repo, sha: ctx.sha, branch: ctx.branch, title: ctx.title },
        });
        const status = toStatus(body, 'webhook');
        if (!config.statusUrl?.trim() && (status.state === 'queued' || status.state === 'building')) return { ...status, state: 'ready' };
        return status;
      },
      async status(project, deployId, config) {
        if (!config.statusUrl?.trim()) return { state: 'ready', id: deployId };
        const found = await readStatus(config, { id: deployId, sha: '', project, branch: '', repo: '' }, false);
        return found ?? { state: 'ready', id: deployId };
      },
    },
  };
}

function placeholders(project: string, ctx: DeployContext, id: string): Record<string, string> {
  return { id, sha: ctx.sha, project, branch: ctx.branch, repo: ctx.repo };
}
