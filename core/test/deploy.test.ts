import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdapterRegistry } from '../src/adapters/registry.js';
import type { MemberAdapter } from '../src/adapters/types.js';
import { Coordinator } from '../src/coordinator.js';
import { SecretBox } from '../src/crypto.js';
import { SqlDirectory } from '../src/directory.js';
import { MemoryFileStore } from '../src/files.js';
import { createGitHubIntegration } from '../src/integrations/github.js';
import { createNetlifyIntegration } from '../src/integrations/platforms/netlify.js';
import { createVercelIntegration } from '../src/integrations/platforms/vercel.js';
import { IntegrationRegistry } from '../src/integrations/registry.js';
import { SqlRoom } from '../src/room.js';
import type { ChatEvent, DeploymentCard, PullRequestCard } from '../src/types.js';
import { FAKE_REPO, FAKE_TOKEN, startFakeGitHub, type FakeGitHub } from './fake-github.js';
import { fakePlatforms, TOKENS } from './fake-platforms.js';
import { memoryDriver } from './sqlite.js';

const POLL = 10_000;
const limits = { maxHops: 5, maxReplies: 10, contextSize: 30, llmTimeoutMs: 5000, userDisplayName: '用户', deployPollMs: POLL };

let gh: FakeGitHub;
beforeAll(async () => {
  gh = await startFakeGitHub();
});
afterAll(() => gh.close());

/** An assistant that opens a pull request whenever it is asked. */
const coder: MemberAdapter = {
  type: 'coder',
  label: 'coder',
  description: '',
  fields: [],
  reply: async (ctx) => {
    const open = ctx.tools!.tools.find((t) => t.name === 'create_pull_request')!;
    await open.run({ title: '改标题', description: '', files: [{ path: 'README.md', content: `# ${Math.random()}\n` }] });
    return '已提交。';
  },
};

async function setup(platform: 'vercel' | 'netlify' = 'vercel', opts: { bindDeploy?: boolean } = {}) {
  const db = memoryDriver();
  const directory = new SqlDirectory(db, new SecretBox('s'.repeat(20)), () => {});
  const room = new SqlRoom(db);
  const fake = fakePlatforms();
  const integrations = new IntegrationRegistry()
    .register(createGitHubIntegration())
    .register(createVercelIntegration(fake.fetch))
    .register(createNetlifyIntegration(fake.fetch));
  const events: ChatEvent[] = [];
  const coordinator = new Coordinator(room, directory, new AdapterRegistry().register(coder), integrations, new MemoryFileStore(), (e) => events.push(e), limits);

  const member = await directory.createMember({ name: '甲', type: 'coder', avatar: { shape: 'cloud', color: 'blue' }, role: '', persona: '', config: {}, secrets: {} });
  const group = await directory.createGroup('群', [member.ok ? member.value.id : '']);
  if (!group.ok) throw new Error(group.error);
  const groupId = group.value.id;

  const github = await directory.createIntegration({ type: 'github', typeLabel: 'GitHub', name: 'gh', config: { apiBaseUrl: gh.url }, secrets: { token: FAKE_TOKEN } });
  const host =
    platform === 'vercel'
      ? await directory.createIntegration({ type: 'vercel', typeLabel: 'Vercel', name: 'v', config: {}, secrets: { token: TOKENS.vercel } })
      : await directory.createIntegration({ type: 'netlify', typeLabel: 'Netlify', name: 'n', config: {}, secrets: { token: TOKENS.netlify } });
  const githubId = github.ok ? github.value.id : '';
  const hostId = host.ok ? host.value.id : '';
  await directory.setBinding(groupId, {
    repo: { integrationId: githubId, repo: FAKE_REPO },
    ...(opts.bindDeploy === false ? {} : { deploy: { integrationId: hostId, project: platform === 'vercel' ? 'site' : 'site-1', name: '官网' } }),
  });

  /** Asks the assistant for a change and returns the pull request message. */
  const propose = async () => {
    await coordinator.postUserMessage(groupId, '@甲 改一下标题');
    while (await coordinator.step(groupId));
    return room.recentMessages(groupId, 20).filter((m) => m.card?.type === 'pull_request').at(-1)!;
  };
  const deployMessages = () => room.recentMessages(groupId, 50).filter((m) => m.card?.type === 'deployment');
  const deployCard = () => deployMessages().at(-1)!.card as DeploymentCard;

  return { directory, room, fake, events, coordinator, groupId, hostId, propose, deployMessages, deployCard };
}

/** Merges the proposed change and returns the clock to poll with. */
async function merge(s: Awaited<ReturnType<typeof setup>>) {
  const pr = await s.propose();
  await s.coordinator.cardAction(s.groupId, pr.id, 'merge');
  const merged = s.room.getMessage(pr.id)!.card as PullRequestCard;
  // The first check is due one interval after the deployment was announced.
  return { merged, t0: s.deployMessages().length ? s.deployCard().startedAt : Date.now() };
}

describe('deployments after a merge', () => {
  it('announces the deployment and follows it until the preview link is ready', async () => {
    const s = await setup('vercel');
    const { merged, t0 } = await merge(s);
    expect(merged).toMatchObject({ state: 'merged' });
    expect(merged.mergeSha).toBeTruthy();

    const updates = () => s.events.filter((e) => e.type === 'message_updated').length;
    const baseline = updates(); // the merged pull request card
    const [message] = s.deployMessages();
    expect(message!.senderKind).toBe('system');
    expect(message!.content).toContain('正在部署到 Vercel');
    expect(s.deployCard()).toMatchObject({ platform: 'vercel', platformLabel: 'Vercel', projectName: '官网', state: 'queued', commit: merged.mergeSha, title: '改标题' });
    expect((await s.directory.getGroup(s.groupId))!.lastMessage!.id).toBe(message!.id);

    // Not due yet.
    expect(await s.coordinator.pollWatches(s.groupId, t0 + POLL - 1)).toBeGreaterThan(t0);
    expect(s.fake.requests).toHaveLength(0);

    // The platform has not noticed the commit yet: keep waiting, nothing changes.
    expect(await s.coordinator.pollWatches(s.groupId, t0 + POLL)).toBe(t0 + 2 * POLL);
    expect(s.deployCard().state).toBe('queued');

    s.fake.deploys.vercel.push({ id: 'd1', sha: merged.mergeSha!, phase: 'building' });
    expect(await s.coordinator.pollWatches(s.groupId, t0 + 2 * POLL)).toBe(t0 + 3 * POLL);
    expect(s.deployCard()).toMatchObject({ state: 'building', deployId: 'd1' });
    expect(updates()).toBe(baseline + 1);

    // Nothing new: no event, still watching.
    await s.coordinator.pollWatches(s.groupId, t0 + 3 * POLL);
    expect(updates()).toBe(baseline + 1);

    s.fake.deploys.vercel[0]!.phase = 'ready';
    expect(await s.coordinator.pollWatches(s.groupId, t0 + 4 * POLL)).toBeUndefined();
    expect(s.deployCard()).toMatchObject({ state: 'ready', url: 'https://d1.vercel.app' });
    const last = s.events.filter((e) => e.type === 'message_updated').at(-1) as Extract<ChatEvent, { type: 'message_updated' }>;
    expect(last.message.card).toMatchObject({ state: 'ready' });
    // The group list shows the finished deployment.
    expect(((await s.directory.getGroup(s.groupId))!.lastMessage!.card as DeploymentCard).state).toBe('ready');
  });

  it('shows the platform\'s failure', async () => {
    const s = await setup('vercel');
    const { merged, t0 } = await merge(s);
    s.fake.deploys.vercel.push({ id: 'd1', sha: merged.mergeSha!, phase: 'error' });
    expect(await s.coordinator.pollWatches(s.groupId, t0 + POLL)).toBeUndefined();
    expect(s.deployCard()).toMatchObject({ state: 'error', error: 'Build failed' });
  });

  it('does nothing without a deploy target, and not when the change is rejected', async () => {
    const plain = await setup('vercel', { bindDeploy: false });
    await merge(plain);
    expect(plain.deployMessages()).toHaveLength(0);
    expect(await plain.coordinator.pollWatches(plain.groupId, Date.now() + 1e9)).toBeUndefined();

    const s = await setup('vercel');
    const pr = await s.propose();
    await s.coordinator.cardAction(s.groupId, pr.id, 'reject');
    expect(s.deployMessages()).toHaveLength(0);
  });

  it('starts a deployment itself when the platform has not, if it can', async () => {
    const s = await setup('netlify');
    const { t0 } = await merge(s);
    for (let k = 1; k <= 8; k++) await s.coordinator.pollWatches(s.groupId, t0 + k * POLL);
    expect(s.fake.deploys.netlify).toHaveLength(0);
    await s.coordinator.pollWatches(s.groupId, t0 + 9 * POLL);
    expect(s.fake.deploys.netlify).toHaveLength(1);
    expect(s.deployCard()).toMatchObject({ state: 'queued', deployId: expect.any(String) });
    // Only once.
    s.fake.deploys.netlify[0]!.phase = 'building';
    await s.coordinator.pollWatches(s.groupId, t0 + 10 * POLL);
    expect(s.fake.deploys.netlify).toHaveLength(1);
    expect(s.deployCard().state).toBe('building');
    s.fake.deploys.netlify[0]!.phase = 'ready';
    await s.coordinator.pollWatches(s.groupId, t0 + 11 * POLL);
    expect(s.deployCard()).toMatchObject({ state: 'ready', url: expect.stringContaining('netlify.app') });
  });

  it('gives up when a platform that cannot be triggered never starts', async () => {
    const s = await setup('vercel');
    const { t0 } = await merge(s);
    let due: number | undefined = t0 + POLL;
    for (let k = 1; due !== undefined && k < 100; k++) due = await s.coordinator.pollWatches(s.groupId, t0 + k * POLL);
    expect(due).toBeUndefined();
    expect(s.deployCard()).toMatchObject({ state: 'error', error: expect.stringContaining('自动部署') });
  });

  it('stops following a build that never finishes', async () => {
    const s = await setup('vercel');
    const { merged, t0 } = await merge(s);
    s.fake.deploys.vercel.push({ id: 'd1', sha: merged.mergeSha!, phase: 'building' });
    let due: number | undefined = t0 + POLL;
    for (let k = 1; due !== undefined && k < 200; k++) due = await s.coordinator.pollWatches(s.groupId, t0 + k * POLL);
    expect(s.deployCard()).toMatchObject({ state: 'error', error: expect.stringContaining('时间太长') });
  });

  it('tolerates a few failed requests but not a streak of them', async () => {
    const s = await setup('vercel');
    const { merged, t0 } = await merge(s);
    s.fake.deploys.vercel.push({ id: 'd1', sha: merged.mergeSha!, phase: 'building' });
    s.fake.failNext(2);
    // /v9/projects/site fails twice, then recovers.
    await s.coordinator.pollWatches(s.groupId, t0 + POLL);
    await s.coordinator.pollWatches(s.groupId, t0 + 2 * POLL);
    expect(s.deployCard().state).toBe('queued');
    await s.coordinator.pollWatches(s.groupId, t0 + 3 * POLL);
    expect(s.deployCard().state).toBe('building');

    s.fake.failNext(99);
    let due: number | undefined = t0 + 4 * POLL;
    for (let k = 4; due !== undefined && k < 20; k++) due = await s.coordinator.pollWatches(s.groupId, t0 + k * POLL);
    expect(s.deployCard()).toMatchObject({ state: 'error', error: expect.stringContaining('500') });
  });

  it('survives the connection being deleted mid-deployment', async () => {
    const s = await setup('vercel');
    const { t0 } = await merge(s);
    await s.directory.deleteIntegration(s.hostId);
    expect(await s.coordinator.pollWatches(s.groupId, t0 + POLL)).toBeUndefined();
    expect(s.deployCard()).toMatchObject({ state: 'error', error: expect.stringContaining('已经被删除') });
    expect((await s.directory.getGroup(s.groupId))!.binding).toMatchObject({ repo: expect.anything() });
    expect((await s.directory.getGroup(s.groupId))!.binding!.deploy).toBeUndefined();
  });

  it('does not accept card actions on a deployment card', async () => {
    const s = await setup('vercel');
    await merge(s);
    await expect(s.coordinator.cardAction(s.groupId, s.deployMessages()[0]!.id, 'merge')).rejects.toMatchObject({ status: 404 });
  });
});

describe('deploy target binding', () => {
  it('keeps the repository when only the deploy target changes, and checks the connection exists', async () => {
    const s = await setup('vercel');
    const before = (await s.directory.getGroup(s.groupId))!.binding!;
    expect(await s.directory.setBinding(s.groupId, { repo: before.repo, deploy: { integrationId: 'missing', project: 'x', name: 'x' } })).toEqual({ ok: false, error: '这个部署平台的连接不存在' });
    const cleared = await s.directory.setBinding(s.groupId, { repo: before.repo });
    expect(cleared.ok && cleared.value.binding).toEqual({ repo: before.repo });
    const none = await s.directory.setBinding(s.groupId, {});
    expect(none.ok && none.value.binding).toBeNull();
  });
});
