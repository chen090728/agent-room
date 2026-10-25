import { describe, expect, it } from 'vitest';
import { createCloudflarePagesIntegration } from '../src/integrations/platforms/cloudflare-pages.js';
import { createNetlifyIntegration } from '../src/integrations/platforms/netlify.js';
import { createRenderIntegration } from '../src/integrations/platforms/render.js';
import { createVercelIntegration } from '../src/integrations/platforms/vercel.js';
import type { IntegrationType } from '../src/integrations/types.js';
import { CF_ACCOUNT, fakePlatforms, TOKENS, type Platform } from './fake-platforms.js';

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
];

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
  it('Vercel cannot be triggered, the others can', () => {
    const f = fakePlatforms().fetch;
    expect(createVercelIntegration(f).deploy!.trigger).toBeUndefined();
    for (const make of [createNetlifyIntegration, createRenderIntegration, createCloudflarePagesIntegration]) expect(make(f).deploy!.trigger).toBeTypeOf('function');
  });

  it.each(cases.filter((c) => c.platform !== 'vercel'))('$platform starts a deployment', async (c) => {
    const fake = fakePlatforms();
    const status = await c.make(fake.fetch).deploy!.trigger!(c.project, ctx, c.config);
    expect(status.state).toBe('queued');
    expect(status.id).toBeTruthy();
    expect(fake.deploys[c.platform]).toHaveLength(1);
    if (c.platform === 'cloudflare') expect(fake.deploys.cloudflare[0]!.sha).toBe('triggered:main');
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
