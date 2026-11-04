import { deployPlatformFailed } from '../../copy.js';
import type { DeployContext, DeployStatus, IntegrationType } from '../types.js';
import { PlatformClient, PlatformError } from './http.js';

const API = 'https://management.azure.com';
const API_VERSION = '2024-11-01';

/**
 * Azure Resource Manager bearer tokens (for example `az account get-access-token`).
 * Static Web Apps builds do not include the git SHA in the documented schema, so find()
 * looks for it on any property and otherwise matches a single build whose pull-request
 * title equals the merged PR. There is no ARM call that starts a GitHub build; use the
 * webhook plugin to poke a workflow when a trigger is required. No `deploy.trigger`.
 */

function mapState(status: string | undefined): DeployStatus['state'] {
  switch (status) {
    case 'Ready':
      return 'ready';
    case 'Failed':
    case 'Detached':
    case 'Deleting':
      return 'error';
    case 'WaitingForDeployment':
      return 'queued';
    default:
      return 'building';
  }
}

function toStatus(build: any): DeployStatus {
  const props = build?.properties ?? {};
  const state = mapState(props.status);
  const failure = state === 'error' ? deployPlatformFailed('Azure') : undefined;
  const hostname = typeof props.hostname === 'string' ? props.hostname : undefined;
  return {
    state,
    id: props.buildId || build?.name,
    url: hostname ? (hostname.startsWith('http') ? hostname : `https://${hostname}`) : undefined,
    error: failure?.content,
    errorNotice: failure?.notice,
  };
}

function hasSha(build: any, sha: string): boolean {
  if (!sha) return false;
  return JSON.stringify(build?.properties ?? {}).includes(sha);
}

function parseProject(project: string): { resourceGroup: string; name: string } {
  const slash = project.indexOf('/');
  const resourceGroup = slash > 0 ? project.slice(0, slash) : '';
  const name = slash > 0 ? project.slice(slash + 1) : '';
  if (!resourceGroup || !name || name.includes('/')) throw new PlatformError('部署目标不合法，请重新绑定这个 Static Web App', 400);
  return { resourceGroup, name };
}

function armSite(config: Record<string, string>, project: string): string {
  const { resourceGroup, name } = parseProject(project);
  const sub = encodeURIComponent(config.subscriptionId ?? '');
  return `/subscriptions/${sub}/resourceGroups/${encodeURIComponent(resourceGroup)}/providers/Microsoft.Web/staticSites/${encodeURIComponent(name)}`;
}

export function createAzureStaticWebAppsIntegration(fetchImpl: typeof fetch = fetch): IntegrationType {
  const client = (config: Record<string, string>) =>
    new PlatformClient({
      label: 'Azure',
      base: (config.apiBaseUrl || API).replace(/\/+$/, ''),
      headers: { Authorization: `Bearer ${config.token ?? ''}` },
      secrets: [config.token],
      fetchImpl,
    });
  const versioned = (path: string) => `${path}${path.includes('?') ? '&' : '?'}api-version=${API_VERSION}`;

  const builds = async (config: Record<string, string>, project: string) => {
    const body = await client(config).request<{ value?: any[] }>('GET', versioned(`${armSite(config, project)}/builds`));
    return body?.value ?? [];
  };

  const matchBuild = (list: any[], ctx: DeployContext) => {
    const bySha = list.find((build) => hasSha(build, ctx.sha));
    if (bySha) return bySha;
    if (!ctx.title) return undefined;
    const byTitle = list.filter((build) => build?.properties?.pullRequestTitle === ctx.title);
    return byTitle.length === 1 ? byTitle[0] : undefined;
  };

  return {
    type: 'azure-static-web-apps',
    label: 'Azure Static Web Apps',
    description:
      '合并后跟踪 Azure Static Web Apps 的构建。官方构建记录通常没有提交 SHA，AgentHub 会在返回内容里查找这个 SHA，或在只有一个构建的 PR 标题与这次合并相同时跟上它。这里不能触发 Git 构建；要主动触发请改用 Webhook。',
    fields: [
      { key: 'token', label: '访问令牌', kind: 'password', required: true, placeholder: 'az account get-access-token 的 accessToken', secret: true },
      { key: 'subscriptionId', label: '订阅 ID', kind: 'text', required: true, placeholder: '订阅概览里的 GUID' },
      { key: 'apiBaseUrl', label: '接口地址（可选）', kind: 'url', required: false, placeholder: '一般不用填' },
    ],

    async verify(config) {
      const sub = encodeURIComponent(config.subscriptionId ?? '');
      await client(config).request('GET', versioned(`/subscriptions/${sub}/providers/Microsoft.Web/staticSites`));
      const id = config.subscriptionId ?? '';
      return { account: `订阅 ${id.slice(0, 8)}…` };
    },

    async listResources(config) {
      const sub = encodeURIComponent(config.subscriptionId ?? '');
      const body = await client(config).request<{ value?: any[] }>('GET', versioned(`/subscriptions/${sub}/providers/Microsoft.Web/staticSites`));
      return (body?.value ?? []).map((site) => {
        const match = String(site.id ?? '').match(/\/resourceGroups\/([^/]+)\/providers\/Microsoft\.Web\/staticSites\/([^/]+)/i);
        const resourceGroup = match?.[1] ?? '';
        const name = match?.[2] ?? site.name;
        return {
          id: resourceGroup ? `${resourceGroup}/${name}` : String(name),
          name: String(site.name ?? name),
          description: site.properties?.repositoryUrl ?? site.properties?.defaultHostname ?? undefined,
        };
      });
    },

    deploy: {
      async find(project, ctx, config) {
        const match = matchBuild(await builds(config, project), ctx);
        return match ? toStatus(match) : null;
      },
      async status(project, deployId, config) {
        const build = await client(config).request('GET', versioned(`${armSite(config, project)}/builds/${encodeURIComponent(deployId)}`));
        return toStatus(build);
      },
    },
  };
}
