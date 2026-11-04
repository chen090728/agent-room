import { deployPlatformFailed } from '../../copy.js';
import type { DeployStatus, IntegrationType } from '../types.js';
import { graphql } from './graphql.js';
import { PlatformClient, PlatformError } from './http.js';

const MACHINES = 'https://api.machines.dev';
const GRAPHQL = 'https://api.fly.io';

/**
 * Fly.io has no HTTP API that deploys a git commit (flyctl builds the image itself).
 * This connection lists apps on the Machines API and follows GraphQL releases.
 * A release counts only when its description, reason, or image ref contains the merge SHA,
 * so CI should pass it through, e.g. `fly deploy --deploy-message "$GITHUB_SHA"`.
 * There is no `deploy.trigger`.
 */

interface FlyApp {
  name: string;
  organization?: { name?: string; slug?: string };
}

interface FlyRelease {
  id: string;
  status?: string;
  description?: string;
  reason?: string;
  imageRef?: string;
}

function httpsUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
}

function mapState(status: string | undefined): DeployStatus['state'] {
  const value = (status ?? '').toLowerCase();
  if (['complete', 'completed', 'succeeded', 'success'].includes(value)) return 'ready';
  if (['failed', 'failure', 'interrupted', 'error'].includes(value)) return 'error';
  if (['pending', 'accepted', 'queued'].includes(value)) return 'queued';
  return 'building';
}

function toStatus(node: FlyRelease, hostname: string | undefined): DeployStatus {
  const state = mapState(node.status);
  const failure = state === 'error' ? deployPlatformFailed('Fly.io') : undefined;
  return {
    state,
    id: node.id,
    url: httpsUrl(hostname),
    error: failure?.content,
    errorNotice: failure?.notice,
  };
}

function releaseText(node: FlyRelease): string {
  return [node.description, node.reason, node.imageRef].map((part) => String(part ?? '')).join('\n').toLowerCase();
}

export function createFlyIntegration(fetchImpl: typeof fetch = fetch): IntegrationType {
  const machines = (config: Record<string, string>) =>
    new PlatformClient({
      label: 'Fly.io',
      base: (config.apiBaseUrl || MACHINES).replace(/\/+$/, ''),
      headers: { Authorization: `Bearer ${config.token ?? ''}` },
      query: config.orgSlug ? { org_slug: config.orgSlug } : undefined,
      secrets: [config.token],
      fetchImpl,
    });
  const gql = (config: Record<string, string>) =>
    new PlatformClient({
      label: 'Fly.io',
      base: GRAPHQL,
      headers: { Authorization: `Bearer ${config.token ?? ''}` },
      secrets: [config.token],
      fetchImpl,
    });

  const releases = async (config: Record<string, string>, appName: string) => {
    const data = await graphql<{ app?: { hostname?: string; releasesUnprocessed?: { nodes?: FlyRelease[] } } | null }>(
      gql(config),
      'Fly.io',
      '/graphql',
      `query($appName: String!) {
        app(name: $appName) {
          hostname
          releasesUnprocessed(first: 15) {
            nodes { id status description reason imageRef }
          }
        }
      }`,
      { appName },
      [config.token],
    );
    if (!data.app) throw new PlatformError(`在 Fly.io 上找不到应用 ${appName}`, 404);
    return { hostname: data.app.hostname, nodes: data.app.releasesUnprocessed?.nodes ?? [] };
  };

  return {
    type: 'fly',
    label: 'Fly.io',
    description:
      '合并后跟踪 Fly.io 的发布记录。Fly 不能从这里按提交触发部署：请在 CI 里部署，并把提交 SHA 写进发布说明（例如 fly deploy --deploy-message），AgentHub 才能对上这一次合并。',
    fields: [
      { key: 'token', label: '访问令牌', kind: 'password', required: true, placeholder: 'fly tokens create org 的输出', secret: true },
      { key: 'orgSlug', label: '组织 slug（可选）', kind: 'text', required: false, placeholder: '多个组织时填写，例如 personal' },
      { key: 'apiBaseUrl', label: '接口地址（可选）', kind: 'url', required: false, placeholder: '一般不用填' },
    ],

    async verify(config) {
      const { apps = [] } = await machines(config).request<{ apps?: FlyApp[] }>('GET', '/v1/apps');
      const org = apps.find((app) => app.organization?.name || app.organization?.slug)?.organization;
      return { account: org?.name || org?.slug || 'Fly' };
    },

    async listResources(config) {
      const { apps = [] } = await machines(config).request<{ apps?: FlyApp[] }>('GET', '/v1/apps');
      return apps.map((app) => ({ id: app.name, name: app.name, description: app.organization?.slug }));
    },

    deploy: {
      async find(project, ctx, config) {
        const { hostname, nodes } = await releases(config, project);
        const sha = ctx.sha.toLowerCase();
        const match = nodes.find((node) => sha && releaseText(node).includes(sha));
        return match ? toStatus(match, hostname) : null;
      },
      async status(project, deployId, config) {
        const { hostname, nodes } = await releases(config, project);
        const match = nodes.find((node) => node.id === deployId);
        if (!match) throw new PlatformError('在 Fly.io 上找不到这次发布', 404);
        return toStatus(match, hostname);
      },
    },
  };
}
