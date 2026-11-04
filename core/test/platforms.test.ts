import { describe, expect, it } from 'vitest';
import { createAzureStaticWebAppsIntegration } from '../src/integrations/platforms/azure-static-web-apps.js';
import { createCloudflarePagesIntegration } from '../src/integrations/platforms/cloudflare-pages.js';
import { createCloudflareWorkersIntegration } from '../src/integrations/platforms/cloudflare-workers.js';
import { createFlyIntegration } from '../src/integrations/platforms/fly.js';
import { createNetlifyIntegration } from '../src/integrations/platforms/netlify.js';
import { createRailwayIntegration } from '../src/integrations/platforms/railway.js';
import { createRenderIntegration } from '../src/integrations/platforms/render.js';
import { createVercelIntegration } from '../src/integrations/platforms/vercel.js';
import { createWebhookIntegration } from '../src/integrations/platforms/webhook.js';
import type { IntegrationType } from '../src/integrations/types.js';
import { AZURE_SUB, CF_ACCOUNT, fakePlatforms, TOKENS, type Platform } from './fake-platforms.js';

const ctx = { repo: 'octo/hello', sha: 'abc123', branch: 'main', title: '改标题' };

interface Case {
  platform: Platform;
  make: (f: typeof fetch) => IntegrationType;
  config: Record<string, string>;
  project: string;
  account: string;
  deployed: string | undefined;
}

const cases: Case[] = [
  { platform: 'vercel', make: createVercelIntegration, config: { token: TOKENS.vercel }, project: 'site', account: 'vera', deployed: 'https://d1.vercel.app' },
  { platform: 'netlify', make: createNetlifyIntegration, config: { token: TOKENS.netlify }, project: 'site-1', account: 'nell@example.com', deployed: 'https://d1--site.netlify.app' },
  { platform: 'render', make: createRenderIntegration, config: { apiKey: TOKENS.render }, project: 'srv-1', account: 'Rena', deployed: 'https://web.onrender.com' },
  { platform: 'cloudflare', make: createCloudflarePagesIntegration, config: { apiToken: TOKENS.cloudflare, accountId: CF_ACCOUNT }, project: 'site', account: `账户 ${CF_ACCOUNT.slice(0, 6)}…`, deployed: 'https://d1.site.pages.dev' },
  { platform: 'railway', make: createRailwayIntegration, config: { token: TOKENS.railway }, project: 'prj/env/svc', account: 'rail@example.com', deployed: 'https://d1.up.railway.app' },
  { platform: 'fly', make: createFlyIntegration, config: { token: TOKENS.fly }, project: 'web', account: 'Fly Org', deployed: 'https://web.fly.dev' },
  { platform: 'workers', make: createCloudflareWorkersIntegration, config: { apiToken: TOKENS.workers, accountId: CF_ACCOUNT }, project: 'worker-tag', account: `账户 ${CF_ACCOUNT.slice(0, 6)}…`, deployed: 'https://my-worker.example.workers.dev' },
  { platform: 'azure', make: createAzureStaticWebAppsIntegration, config: { token: TOKENS.azure, subscriptionId: AZURE_SUB }, project: 'rg/site', account: `订阅 ${AZURE_SUB.slice(0, 8)}…`, deployed: 'https://d1.azurestaticapps.net' },
  {
    platform: 'webhook',
    make: createWebhookIntegration,
    config: { token: TOKENS.webhook, hookUrl: 'https://hooks.example.test/hooks', statusUrl: 'https://hooks.example.test/deploys?id={id}&sha={sha}', projectName: 'hook' },
    project: 'hook',
    account: 'hooks.example.test',
    deployed: 'https://d1.hook.example.test',
  },
];

const NO_TRIGGER = new Set<Platform>(['vercel', 'fly', 'azure']);

describe.each(cases)('$platform integration', (c) => {
  const setup = () => {
    const fake = fakePlatforms();
    return { fake, type: c.make(fake.fetch) };
  };

  it('verifies the token and lists projects', async () => {
    const { type } = setup();
    expect(await type.verify!(c.config)).toEqual({ account: c.account });
    const projects = await type.listResources!(c.config);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.id).toBe(c.project);
  });

  it('reports a wrong token without echoing it', async () => {
    const { type } = setup();
    const bad = Object.fromEntries(Object.entries(c.config).map(([k, v]) => [k, k.toLowerCase().includes('token') || k === 'apiKey' ? 'wrong_token_value_000' : v]));
    const err = await type.verify!(bad).catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('令牌无效或已过期');
    expect((err as Error).message).not.toContain('wrong_token_value_000');
  });

  it('finds the deployment for a commit and follows it to ready', async () => {
    const { fake, type } = setup();
    const deploy = type.deploy!;
    fake.deploys[c.platform].push({ id: 'd0', sha: 'other', phase: 'ready' });
    expect(await deploy.find(c.project, ctx, c.config)).toBeNull();

    fake.deploys[c.platform].push({ id: 'd1', sha: ctx.sha, phase: 'queued' });
    const found = await deploy.find(c.project, ctx, c.config);
    expect(found).toMatchObject({ state: 'queued', id: 'd1' });

    fake.deploys[c.platform][1]!.phase = 'building';
    expect(await deploy.status(c.project, 'd1', c.config)).toMatchObject({ state: 'building' });

    fake.deploys[c.platform][1]!.phase = 'ready';
    const ready = await deploy.status(c.project, 'd1', c.config);
    expect(ready).toMatchObject({ state: 'ready', url: c.deployed });
  });

  it('reports a failed deployment with a readable reason', async () => {
    const { fake, type } = setup();
    fake.deploys[c.platform].push({ id: 'd1', sha: ctx.sha, phase: 'error' });
    const status = await type.deploy!.status(c.project, 'd1', c.config);
    expect(status.state).toBe('error');
    expect(status.error).toBeTruthy();
  });

  it('turns network failures into a short message', async () => {
    const type = c.make((async () => {
      throw new Error(`connect failed for ${Object.values(c.config)[0]}`);
    }) as typeof fetch);
    const err = (await type.verify!(c.config).catch((e) => e)) as Error;
    expect(err.message).toContain('连不上');
    expect(err.message).not.toContain(Object.values(c.config)[0]);
  });
});

describe('triggering', () => {
  it('Vercel, Fly.io, and Azure cannot be triggered; the others can', () => {
    const f = fakePlatforms().fetch;
    expect(createVercelIntegration(f).deploy!.trigger).toBeUndefined();
    expect(createFlyIntegration(f).deploy!.trigger).toBeUndefined();
    expect(createAzureStaticWebAppsIntegration(f).deploy!.trigger).toBeUndefined();
    for (const make of [createNetlifyIntegration, createRenderIntegration, createCloudflarePagesIntegration, createRailwayIntegration, createCloudflareWorkersIntegration, createWebhookIntegration]) {
      expect(make(f).deploy!.trigger).toBeTypeOf('function');
    }
  });

  it.each(cases.filter((c) => !NO_TRIGGER.has(c.platform)))('$platform starts a deployment', async (c) => {
    const fake = fakePlatforms();
    const status = await c.make(fake.fetch).deploy!.trigger!(c.project, ctx, c.config);
    expect(status.state).toBe('queued');
    expect(status.id).toBeTruthy();
    expect(fake.deploys[c.platform]).toHaveLength(1);
    if (c.platform === 'cloudflare') expect(fake.deploys.cloudflare[0]!.sha).toBe('triggered:main');
  });
});

describe('extra deploy contracts', () => {
  it('sends the Fly org slug', async () => {
    const fake = fakePlatforms();
    await createFlyIntegration(fake.fetch).verify!({ token: TOKENS.fly, orgSlug: 'personal' });
    expect(fake.requests.at(-1)!.url).toContain('org_slug=personal');
  });

  it('follows an Azure build by pull request title when the commit is missing', async () => {
    const fake = fakePlatforms();
    fake.deploys.azure.push({ id: 'b1', sha: '', phase: 'building', title: ctx.title });
    const found = await createAzureStaticWebAppsIntegration(fake.fetch).deploy!.find('rg/site', ctx, { token: TOKENS.azure, subscriptionId: AZURE_SUB });
    expect(found).toMatchObject({ state: 'building', id: 'b1' });
  });

  it('webhook verify is a HEAD and still accepts a hook with no HEAD', async () => {
    const calls: string[] = [];
    const recording = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push((init?.method ?? 'GET').toUpperCase());
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const type = createWebhookIntegration(recording);
    await expect(type.verify!({ hookUrl: 'https://hooks.example.test/hooks', projectName: 'hook' })).resolves.toEqual({ account: 'hooks.example.test' });
    expect(calls).toEqual(['HEAD']);
    await expect(type.listResources!({ hookUrl: 'https://hooks.example.test/hooks', projectName: 'hook' })).resolves.toEqual([
      { id: 'hook', name: 'hook', description: '自定义部署钩子' },
    ]);

    const headless = (async () => new Response('no', { status: 405 })) as typeof fetch;
    await expect(createWebhookIntegration(headless).verify!({ hookUrl: 'https://example.com/hooks/deploy' })).resolves.toEqual({ account: 'example.com' });
    const denied = (async () => Response.json({ message: 'nope' }, { status: 401 })) as typeof fetch;
    await expect(createWebhookIntegration(denied).verify!({ hookUrl: 'https://example.com/hooks/deploy', token: 'secret-token-value' })).rejects.toThrow(/令牌无效/);
    await expect(createWebhookIntegration(recording).verify!({ hookUrl: 'ftp://example.com/hook' })).rejects.toThrow(/http/);
  });

  it('treats a webhook 2xx with no status URL as finished, without polling', async () => {
    const fetchImpl = (async () => Response.json({ id: 'job-1' }, { status: 202 })) as typeof fetch;
    const status = await createWebhookIntegration(fetchImpl).deploy!.trigger!('hook', ctx, { hookUrl: 'https://example.com/hooks/deploy' });
    expect(status).toMatchObject({ state: 'ready', id: 'job-1' });
  });
});

describe('Vercel team and project errors', () => {
  it('sends the team id and explains a missing project', async () => {
    const fake = fakePlatforms();
    const type = createVercelIntegration(fake.fetch);
    await type.verify!({ token: TOKENS.vercel, teamId: 'team_9' });
    expect(fake.requests.at(-1)!.url).toContain('teamId=team_9');
    await expect(type.deploy!.find('missing', ctx, { token: TOKENS.vercel })).rejects.toThrow(/找不到/);
  });
});
