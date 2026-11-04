// In-process imitations of the hosting-platform APIs AgentHub uses.
// The integrations take a `fetch`, so tests hand them this one instead of opening any sockets.

export const TOKENS = {
  vercel: 'vercel_fake_token_0123456789',
  netlify: 'netlify_fake_token_0123456789',
  render: 'rnd_fake_key_0123456789',
  cloudflare: 'cf_fake_token_0123456789',
  railway: 'railway_fake_token_0123456789',
  fly: 'fly_fake_token_0123456789',
  workers: 'cfw_fake_token_0123456789',
  azure: 'azure_fake_token_0123456789',
  webhook: 'whsec_fake_token_0123456789',
} as const;
export const CF_ACCOUNT = 'a'.repeat(32);
/** Microsoft's public sample subscription id, used only by the fake Azure API. */
export const AZURE_SUB = '34adfa4f-cedf-4dc0-ba29-b6d1a69ab345';

export type Phase = 'queued' | 'building' | 'ready' | 'error';

export interface FakeDeploy {
  id: string;
  sha: string;
  phase: Phase;
  /** Azure-only: pull request title when the build record has no commit. */
  title?: string;
}

export type Platform = keyof typeof TOKENS;

export interface FakePlatforms {
  fetch: typeof fetch;
  /** Deployments the platform knows about, per platform. */
  deploys: Record<Platform, FakeDeploy[]>;
  /** What each platform shows for a project, to be changed by tests. */
  requests: { method: string; url: string }[];
  /** Fail the next N requests with a 500. */
  failNext(count: number): void;
}

const HOSTS: Record<string, Platform> = {
  'api.vercel.com': 'vercel',
  'api.netlify.com': 'netlify',
  'api.render.com': 'render',
  'api.cloudflare.com': 'cloudflare',
  'backboard.railway.com': 'railway',
  'management.azure.com': 'azure',
  'hooks.example.test': 'webhook',
};

function platformOf(url: URL): Platform | undefined {
  if (url.hostname === 'api.cloudflare.com') {
    return url.pathname.includes('/builds/') || url.pathname.includes('/workers/') ? 'workers' : 'cloudflare';
  }
  if (url.hostname === 'api.machines.dev' || url.hostname === 'api.fly.io') return 'fly';
  return HOSTS[url.hostname];
}

export function fakePlatforms(): FakePlatforms {
  const deploys: FakePlatforms['deploys'] = { vercel: [], netlify: [], render: [], cloudflare: [], railway: [], fly: [], workers: [], azure: [], webhook: [] };
  const requests: FakePlatforms['requests'] = [];
  let failing = 0;
  let counter = 0;

  const json = (status: number, body: unknown) => Response.json(body, { status });

  const handler = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    requests.push({ method, url: url.toString() });
    const platform = platformOf(url);
    if (!platform) return json(404, { message: 'unknown host' });
    if (failing > 0) {
      failing--;
      return json(500, { message: 'internal error' });
    }
    const auth = new Headers(init.headers).get('authorization');
    if (auth !== `Bearer ${TOKENS[platform]}`) return json(401, { message: 'Not authorized' });
    const path = url.pathname;
    const list = deploys[platform];

    if (platform === 'vercel') {
      const view = (d: FakeDeploy) => ({
        uid: d.id,
        url: `${d.id}.vercel.app`,
        readyState: { queued: 'QUEUED', building: 'BUILDING', ready: 'READY', error: 'ERROR' }[d.phase],
        meta: { githubCommitSha: d.sha },
        errorMessage: d.phase === 'error' ? 'Build failed' : undefined,
      });
      if (path === '/v2/user') return json(200, { user: { username: 'vera' } });
      if (path === '/v9/projects') return json(200, { projects: [{ name: 'site', id: 'prj_1', link: { org: 'octo', repo: 'hello' } }] });
      if (path === '/v9/projects/site') return json(200, { id: 'prj_1', name: 'site' });
      if (path === '/v9/projects/missing') return json(404, { error: { message: 'Project not found' } });
      if (path === '/v6/deployments') return json(200, { deployments: list.map(view) });
      const one = path.match(/^\/v13\/deployments\/(.+)$/);
      if (one) {
        const d = list.find((x) => x.id === one[1]);
        return d ? json(200, view(d)) : json(404, { error: { message: 'not found' } });
      }
    }

    if (platform === 'netlify') {
      const view = (d: FakeDeploy) => ({
        id: d.id,
        commit_ref: d.sha,
        state: { queued: 'enqueued', building: 'building', ready: 'ready', error: 'error' }[d.phase],
        deploy_ssl_url: `https://${d.id}--site.netlify.app`,
        error_message: d.phase === 'error' ? 'Build script returned non-zero exit code' : undefined,
      });
      if (path === '/api/v1/user') return json(200, { email: 'nell@example.com' });
      if (path === '/api/v1/sites') return json(200, [{ id: 'site-1', name: 'my-site', build_settings: { repo_url: 'https://github.com/octo/hello' } }]);
      if (path === '/api/v1/sites/site-1/deploys') return json(200, list.map(view));
      if (path === '/api/v1/sites/site-1/builds' && method === 'POST') {
        const d: FakeDeploy = { id: `nd-${++counter}`, sha: 'triggered', phase: 'queued' };
        list.push(d);
        return json(201, { id: `build-${counter}`, deploy_id: d.id });
      }
      const one = path.match(/^\/api\/v1\/deploys\/(.+)$/);
      if (one) {
        const d = list.find((x) => x.id === one[1]);
        return d ? json(200, view(d)) : json(404, { message: 'Not Found' });
      }
    }

    if (platform === 'render') {
      const view = (d: FakeDeploy) => ({
        deploy: { id: d.id, commit: { id: d.sha }, status: { queued: 'created', building: 'build_in_progress', ready: 'live', error: 'build_failed' }[d.phase] },
      });
      if (path === '/v1/owners') return json(200, [{ owner: { name: 'Rena' } }]);
      if (path === '/v1/services') return json(200, [{ service: { id: 'srv-1', name: 'web', repo: 'https://github.com/octo/hello' } }]);
      if (path === '/v1/services/srv-1') return json(200, { id: 'srv-1', serviceDetails: { url: 'https://web.onrender.com' } });
      if (path === '/v1/services/srv-1/deploys' && method === 'GET') return json(200, list.map(view));
      if (path === '/v1/services/srv-1/deploys' && method === 'POST') {
        const d: FakeDeploy = { id: `dep-${++counter}`, sha: 'triggered', phase: 'queued' };
        list.push(d);
        return json(201, view(d).deploy);
      }
      const one = path.match(/^\/v1\/services\/srv-1\/deploys\/(.+)$/);
      if (one) {
        const d = list.find((x) => x.id === one[1]);
        return d ? json(200, view(d).deploy) : json(404, { message: 'not found' });
      }
    }

    if (platform === 'cloudflare') {
      const base = `/client/v4/accounts/${CF_ACCOUNT}/pages/projects`;
      const view = (d: FakeDeploy) => ({
        id: d.id,
        url: `https://${d.id}.site.pages.dev`,
        deployment_trigger: { metadata: { commit_hash: d.sha } },
        latest_stage:
          d.phase === 'ready'
            ? { name: 'deploy', status: 'success' }
            : d.phase === 'error'
              ? { name: 'build', status: 'failure' }
              : d.phase === 'queued'
                ? { name: 'queued', status: 'active' }
                : { name: 'build', status: 'active' },
      });
      const ok = (result: unknown) => json(200, { success: true, errors: [], result });
      if (path === base) return ok([{ name: 'site', source: { config: { owner: 'octo', repo_name: 'hello' } } }]);
      if (path === `${base}/site/deployments` && method === 'GET') return ok(list.map(view));
      if (path === `${base}/site/deployments` && method === 'POST') {
        const form = init.body as FormData;
        const d: FakeDeploy = { id: `cf-${++counter}`, sha: `triggered:${form.get('branch')}`, phase: 'queued' };
        list.push(d);
        return ok(view(d));
      }
      const one = path.match(new RegExp(`^${base}/site/deployments/(.+)$`));
      if (one) {
        const d = list.find((x) => x.id === one[1]);
        return d ? ok(view(d)) : json(404, { success: false, errors: [{ message: 'not found' }] });
      }
    }

    if (platform === 'railway') {
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
      const q = String(body.query ?? '');
      const view = (d: FakeDeploy) => ({
        id: d.id,
        status: { queued: 'QUEUED', building: 'BUILDING', ready: 'SUCCESS', error: 'FAILED' }[d.phase],
        staticUrl: `${d.id}.up.railway.app`,
        meta: { commitHash: d.sha },
      });
      if (q.includes('serviceInstanceDeployV2')) {
        const d: FakeDeploy = { id: `rw-${++counter}`, sha: body.variables?.commitSha ?? 'triggered', phase: 'queued' };
        list.push(d);
        return json(200, { data: { serviceInstanceDeployV2: d.id } });
      }
      if (q.includes('deployments(')) return json(200, { data: { deployments: { edges: list.map((d) => ({ node: view(d) })) } } });
      if (q.includes('deployment(')) {
        const d = list.find((x) => x.id === body.variables?.id);
        return d ? json(200, { data: { deployment: view(d) } }) : json(200, { data: { deployment: null } });
      }
      if (q.includes('projects')) {
        return json(200, {
          data: {
            projects: {
              edges: [{ node: { id: 'prj', name: 'app', environments: { edges: [{ node: { id: 'env', name: 'production' } }] }, services: { edges: [{ node: { id: 'svc', name: 'web' } }] } } }],
            },
          },
        });
      }
      if (q.includes('me {') || q.includes(' me {')) return json(200, { data: { me: { name: 'Rail', email: 'rail@example.com' } } });
    }

    if (platform === 'fly') {
      const view = (d: FakeDeploy) => ({ id: d.id, status: { queued: 'pending', building: 'running', ready: 'complete', error: 'failed' }[d.phase], description: d.sha, reason: '', imageRef: '' });
      if (path === '/v1/apps') return json(200, { apps: [{ name: 'web', organization: { name: 'Fly Org', slug: 'personal' } }] });
      if (path === '/graphql') {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
        if (body.variables?.appName !== 'web') return json(200, { data: { app: null } });
        return json(200, { data: { app: { hostname: 'web.fly.dev', releasesUnprocessed: { nodes: list.map(view) } } } });
      }
    }

    if (platform === 'workers') {
      const base = `/client/v4/accounts/${CF_ACCOUNT}`;
      const view = (d: FakeDeploy) => ({
        build_uuid: d.id,
        status: { queued: 'queued', building: 'running', ready: 'stopped', error: 'stopped' }[d.phase],
        build_outcome: d.phase === 'ready' ? 'success' : d.phase === 'error' ? 'fail' : undefined,
        build_trigger_metadata: { commit_hash: d.sha, branch: 'main' },
      });
      const ok = (result: unknown) => json(200, { success: true, errors: [], result });
      if (path === `${base}/workers/scripts`) return ok([{ id: 'my-worker', tag: 'worker-tag' }]);
      if (path === `${base}/workers/subdomain`) return ok({ subdomain: 'example' });
      if (path === `${base}/builds/workers/worker-tag/builds`) return ok(list.map(view));
      if (path === `${base}/builds/workers/worker-tag/triggers`) return ok([{ trigger_uuid: 'trig-1', branch: 'main' }]);
      if (path === `${base}/builds/triggers/trig-1/builds` && method === 'POST') {
        const payload = typeof init.body === 'string' ? JSON.parse(init.body) : {};
        const d: FakeDeploy = { id: `cfw-${++counter}`, sha: payload.commit_hash ?? 'triggered', phase: 'queued' };
        list.push(d);
        return ok(view(d));
      }
      const one = path.match(new RegExp(`^${base}/builds/builds/(.+)$`));
      if (one) {
        const d = list.find((x) => x.id === one[1]);
        return d ? ok(view(d)) : json(404, { success: false, errors: [{ message: 'not found' }] });
      }
    }

    if (platform === 'azure') {
      const site = `/subscriptions/${AZURE_SUB}/resourceGroups/rg/providers/Microsoft.Web/staticSites/site`;
      const view = (d: FakeDeploy) => ({
        name: d.id,
        properties: {
          buildId: d.id,
          status: { queued: 'WaitingForDeployment', building: 'Deploying', ready: 'Ready', error: 'Failed' }[d.phase],
          sourceVersion: d.sha || undefined,
          pullRequestTitle: d.title,
          hostname: `${d.id}.azurestaticapps.net`,
        },
      });
      if (path === `/subscriptions/${AZURE_SUB}/providers/Microsoft.Web/staticSites`) {
        return json(200, { value: [{ id: site, name: 'site', properties: { defaultHostname: 'site.azurestaticapps.net', repositoryUrl: 'https://github.com/octo/hello' } }] });
      }
      if (path === `${site}/builds`) return json(200, { value: list.map(view) });
      const one = path.match(new RegExp(`^${site}/builds/(.+)$`));
      if (one) {
        const d = list.find((x) => x.id === one[1]);
        return d ? json(200, view(d)) : json(404, { error: { message: 'not found' } });
      }
    }

    if (platform === 'webhook') {
      const view = (d: FakeDeploy) => ({
        id: d.id,
        state: d.phase,
        sha: d.sha,
        url: `https://${d.id}.hook.example.test`,
        error: d.phase === 'error' ? 'build failed' : undefined,
      });
      if (path === '/hooks' && method === 'HEAD') return json(200, {});
      if (path === '/hooks' && method === 'POST') {
        const payload = typeof init.body === 'string' ? JSON.parse(init.body) : {};
        const d: FakeDeploy = { id: `wh-${++counter}`, sha: payload.sha ?? 'triggered', phase: 'queued' };
        list.push(d);
        return json(200, { id: d.id, state: 'queued' });
      }
      if (path === '/deploys' && method === 'GET') {
        const id = url.searchParams.get('id');
        const sha = url.searchParams.get('sha');
        const d = id ? list.find((x) => x.id === id) : list.find((x) => x.sha === sha);
        return d ? json(200, view(d)) : json(404, { message: 'not found' });
      }
    }

    return json(404, { message: `no route ${method} ${path}` });
  };

  return { fetch: handler as typeof fetch, deploys, requests, failNext: (n) => (failing = n) };
}

/**
 * Exposes the fakes over HTTP for the end-to-end suite: the first path segment
 * picks the platform (`/vercel/v9/projects`), the rest is the platform's own path.
 */
export async function serveFakePlatforms(fake: FakePlatforms): Promise<{ url: string; close(): Promise<void> }> {
  const { createServer } = await import('node:http');
  const hostOf = Object.fromEntries(Object.entries(HOSTS).map(([host, name]) => [name, host]));
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const [, name, ...rest] = (req.url ?? '').split('?')[0]!.split('/');
      const host = hostOf[name ?? ''];
      const query = req.url!.includes('?') ? `?${req.url!.split('?')[1]}` : '';
      const response = host
        ? await fake.fetch(`https://${host}/${rest.join('/')}${query}`, {
            method: req.method,
            headers: { authorization: req.headers.authorization ?? '' },
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          })
        : Response.json({ message: 'unknown platform' }, { status: 404 });
      res.writeHead(response.status, { 'Content-Type': 'application/json' }).end(await response.text());
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as import('node:net').AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))),
  };
}
