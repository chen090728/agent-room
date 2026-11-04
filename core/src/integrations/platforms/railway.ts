import { deployPlatformFailed } from '../../copy.js';
import type { DeployStatus, IntegrationType } from '../types.js';
import { graphql } from './graphql.js';
import { PlatformClient, PlatformError } from './http.js';

const API = 'https://backboard.railway.com';

/** Railway deployment statuses that mean the release is up (including scale-to-zero). */
const READY = new Set(['SUCCESS', 'SLEEPING']);
const FAILED = new Set(['FAILED', 'CRASHED', 'REMOVED', 'REMOVING', 'SKIPPED']);
const QUEUED = new Set(['QUEUED', 'WAITING']);

function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  return value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
}

function metaOf(meta: unknown): Record<string, unknown> {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
}

function commitOf(meta: unknown): string {
  const value = metaOf(meta).commitHash ?? metaOf(meta).commitSha ?? metaOf(meta).commit;
  return typeof value === 'string' ? value : '';
}

function toStatus(d: any): DeployStatus {
  const status = String(d?.status ?? '');
  const state: DeployStatus['state'] = READY.has(status) ? 'ready' : FAILED.has(status) ? 'error' : QUEUED.has(status) ? 'queued' : 'building';
  const failure = state === 'error' ? deployPlatformFailed('Railway') : undefined;
  return {
    state,
    id: d?.id,
    url: httpsUrl(d?.staticUrl),
    error: failure?.content,
    errorNotice: failure?.notice,
  };
}

function nodes<T>(connection: { edges?: { node: T }[] } | null | undefined): T[] {
  return (connection?.edges ?? []).map((edge) => edge?.node).filter((node): node is T => !!node);
}

interface RailwayIds {
  projectId: string;
  environmentId: string;
  serviceId: string;
}

/** Bound resources are `projectId/environmentId/serviceId` (Railway ids do not contain slashes). */
function parseTarget(project: string): RailwayIds {
  const [projectId, environmentId, serviceId] = project.split('/');
  if (!projectId || !environmentId || !serviceId || project.split('/').length !== 3) {
    throw new PlatformError('部署目标不合法，请重新绑定这个 Railway 服务', 400);
  }
  return { projectId, environmentId, serviceId };
}

/**
 * Railway's public API is GraphQL at backboard.railway.com/graphql/v2.
 * `serviceInstanceDeployV2` deploys one commit; `deployments` is how we follow it.
 */
export function createRailwayIntegration(fetchImpl: typeof fetch = fetch): IntegrationType {
  const client = (config: Record<string, string>) => {
    const raw = (config.apiBaseUrl || API).replace(/\/+$/, '').replace(/\/graphql\/v2$/, '');
    return new PlatformClient({
      label: 'Railway',
      base: raw,
      headers: { Authorization: `Bearer ${config.token ?? ''}` },
      secrets: [config.token],
      fetchImpl,
    });
  };
  const query = <T>(config: Record<string, string>, document: string, variables?: Record<string, unknown>) =>
    graphql<T>(client(config), 'Railway', '/graphql/v2', document, variables, [config.token]);

  return {
    type: 'railway',
    label: 'Railway',
    description: '合并后跟踪 Railway 的部署进度，完成后在群里给出链接。服务需要已经连接了 Git 仓库；没有自动部署时会按这次合并的提交触发一次。',
    fields: [
      { key: 'token', label: '访问令牌', kind: 'password', required: true, placeholder: '在 Railway 的 Account Settings → Tokens 创建', secret: true },
      { key: 'apiBaseUrl', label: '接口地址（可选）', kind: 'url', required: false, placeholder: '一般不用填' },
    ],

    async verify(config) {
      try {
        const data = await query<{ me?: { name?: string; email?: string } }>(config, 'query { me { name email } }');
        if (data.me) return { account: data.me.email || data.me.name || '' };
      } catch (err) {
        // A project-scoped token cannot read `me`. A bad token is 401 and still fails.
        const scoped = err instanceof PlatformError && (err.status === 400 || err.status === 403 || err.status === 404);
        if (!scoped) throw err;
      }
      const data = await query<{ projects?: { edges?: { node: { name?: string } }[] } }>(
        config,
        'query { projects(first: 1) { edges { node { name } } } }',
      );
      return { account: data.projects?.edges?.[0]?.node?.name ?? '' };
    },

    async listResources(config) {
      const data = await query<{
        projects?: { edges?: { node: { id: string; name: string; environments?: { edges?: { node: { id: string; name: string } }[] }; services?: { edges?: { node: { id: string; name: string } }[] } } }[] };
      }>(
        config,
        `query {
          projects(first: 100) {
            edges {
              node {
                id
                name
                environments { edges { node { id name } } }
                services { edges { node { id name } } }
              }
            }
          }
        }`,
      );
      const out: { id: string; name: string; description?: string }[] = [];
      for (const project of nodes(data.projects)) {
        const envs = nodes(project.environments);
        const services = nodes(project.services);
        for (const env of envs) {
          for (const service of services) {
            const suffix = envs.length > 1 ? ` (${env.name})` : '';
            out.push({
              id: `${project.id}/${env.id}/${service.id}`,
              name: `${project.name} / ${service.name}${suffix}`,
              description: env.name,
            });
            if (out.length >= 100) return out;
          }
        }
      }
      return out;
    },

    deploy: {
      async find(project, ctx, config) {
        const ids = parseTarget(project);
        const data = await query<{ deployments?: { edges?: { node: any }[] } }>(
          config,
          `query($input: DeploymentListInput!, $first: Int) {
            deployments(input: $input, first: $first) {
              edges { node { id status staticUrl meta } }
            }
          }`,
          { input: { projectId: ids.projectId, environmentId: ids.environmentId, serviceId: ids.serviceId }, first: 10 },
        );
        const match = nodes(data.deployments).find((d) => commitOf(d.meta) === ctx.sha);
        return match ? toStatus(match) : null;
      },
      async trigger(project, ctx, config) {
        const ids = parseTarget(project);
        const data = await query<{ serviceInstanceDeployV2?: string }>(
          config,
          `mutation($serviceId: String!, $environmentId: String!, $commitSha: String) {
            serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha)
          }`,
          { serviceId: ids.serviceId, environmentId: ids.environmentId, commitSha: ctx.sha },
        );
        const id = data.serviceInstanceDeployV2;
        if (!id) throw new PlatformError('Railway 没有返回部署 ID', 502);
        return { state: 'queued', id };
      },
      async status(project, deployId, config) {
        parseTarget(project);
        const data = await query<{ deployment?: any }>(
          config,
          'query($id: String!) { deployment(id: $id) { id status staticUrl meta } }',
          { id: deployId },
        );
        if (!data.deployment) throw new PlatformError('在 Railway 上找不到这次部署', 404);
        return toStatus(data.deployment);
      },
    },
  };
}
