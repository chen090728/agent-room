// In-process imitations of the hosting-platform REST endpoints AgentHub uses
// (Vercel, Netlify, Render, Cloudflare Pages). The integrations take a `fetch`,
// so tests hand them this one instead of opening any sockets.

export const TOKENS = { vercel: 'vercel_fake_token_0123456789', netlify: 'netlify_fake_token_0123456789', render: 'rnd_fake_key_0123456789', cloudflare: 'cf_fake_token_0123456789' } as const;
export const CF_ACCOUNT = 'a'.repeat(32);

export type Phase = 'queued' | 'building' | 'ready' | 'error';

export interface FakeDeploy {
  id: string;
  sha: string;
  phase: Phase;
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
};

export function fakePlatforms(): FakePlatforms {
  const deploys: FakePlatforms['deploys'] = { vercel: [], netlify: [], render: [], cloudflare: [] };
  const requests: FakePlatforms['requests'] = [];
  let failing = 0;
  let counter = 0;

  const json = (status: number, body: unknown) => Response.json(body, { status });

  const handler = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    requests.push({ method, url: url.toString() });
    const platform = HOSTS[url.hostname];
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
