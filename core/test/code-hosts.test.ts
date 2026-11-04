import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createBitbucketIntegration } from '../src/integrations/bitbucket.js';
import { createGiteaIntegration } from '../src/integrations/gitea.js';
import { createGitLabIntegration } from '../src/integrations/gitlab.js';
import type { ToolRuntime } from '../src/integrations/types.js';
import type { PullRequestCard } from '../src/types.js';
import { FAKE_REPO as BB_REPO, FAKE_TOKEN as BB_TOKEN, FAKE_WORKSPACE, startFakeBitbucket, type FakeBitbucket } from './fake-bitbucket.js';
import { FAKE_REPO as GT_REPO, FAKE_TOKEN as GT_TOKEN, startFakeGitea, type FakeGitea } from './fake-gitea.js';
import { FAKE_REPO as GL_REPO, FAKE_TOKEN as GL_TOKEN, startFakeGitLab, type FakeGitLab } from './fake-gitlab.js';

const ctx = { integrationId: 'int-1', assistantName: '小青' };

function tool(rt: ToolRuntime, name: string) {
  return rt.tools.find((item) => item.name === name)!;
}

async function openChange(rt: ToolRuntime, title: string, content: string) {
  await tool(rt, 'create_pull_request').run({ title, files: [{ path: 'README.md', content }] });
  return rt.cards[0] as PullRequestCard;
}

describe('GitLab', () => {
  let gl: FakeGitLab;
  const integration = createGitLabIntegration();
  const config = () => ({ token: GL_TOKEN, apiBaseUrl: gl.url });
  const tools = () => integration.createTools(GL_REPO, config(), ctx);

  beforeAll(async () => {
    gl = await startFakeGitLab();
  });
  afterAll(() => gl.close());
  beforeEach(() => {
    gl.requests.length = 0;
  });

  it('verifies a token, including when the address already ends in /api/v4', async () => {
    expect(await integration.verify(config())).toEqual({ account: 'octocat' });
    expect(await integration.verify({ token: GL_TOKEN, apiBaseUrl: `${gl.url}/api/v4` })).toEqual({ account: 'octocat' });
  });

  it('explains a bad token without echoing it', async () => {
    const err = (await integration.verify({ token: 'glpat-wrong-token-value', apiBaseUrl: gl.url }).catch((e) => e)) as Error;
    expect(err.message).toBe('GitLab 的令牌无效或已过期');
    expect(err.message).not.toContain('wrong-token');
  });

  it('does not pass the token through when the connection fails', async () => {
    const token = 'glpat-secretvalue-9999';
    const fetchImpl: typeof fetch = async () => {
      throw new Error(`boom ${token}`);
    };
    const err = (await createGitLabIntegration(fetchImpl).verify({ token, apiBaseUrl: 'https://gitlab.example.com' }).catch((e) => e)) as Error;
    expect(err.message).toContain('连不上 GitLab');
    expect(err.message).not.toContain('secretvalue');
  });

  it('lists repositories, including a nested group path', async () => {
    expect(await integration.listResources(config())).toEqual([{ id: GL_REPO, name: GL_REPO, description: 'Hello world' }]);
  });

  it('rejects an invalid repository name', () => {
    expect(() => integration.createTools('not a repo', config(), ctx)).toThrow(/仓库名不合法/);
  });

  it('lists directories and reads files from the default branch', async () => {
    const rt = tools();
    expect(await tool(rt, 'list_directory').run({})).toBe('文件 README.md\n目录 src');
    expect(await tool(rt, 'list_directory').run({ path: 'src' })).toBe('文件 src/index.ts');
    expect(await tool(rt, 'read_file').run({ path: 'README.md' })).toBe('# Hello\n');
    expect(await tool(rt, 'read_file').run({ path: '/src/index.ts' })).toBe('export const x = 1;\n');
  });

  it('refuses paths that escape the repository', async () => {
    const rt = tools();
    await expect(tool(rt, 'read_file').run({ path: '../secrets' })).rejects.toThrow(/路径不合法/);
    await expect(tool(rt, 'read_file').run({ path: 'a/.git/config' })).rejects.toThrow(/路径不合法/);
  });

  it('opens a merge request on a new branch and leaves the default branch untouched', async () => {
    const rt = tools();
    const result = await tool(rt, 'create_pull_request').run({
      title: 'Add a greeting',
      description: '加一行问候',
      files: [
        { path: 'README.md', content: '# Hello\nHello, world!\n' },
        { path: 'docs/new.md', content: 'new\n' },
        { path: 'src/index.ts', delete: true },
      ],
    });
    expect(result).toContain('PR #1');
    expect(result).toContain('你不能合并');
    const card = rt.cards[0] as PullRequestCard;
    expect(card).toMatchObject({ type: 'pull_request', integrationId: 'int-1', repo: GL_REPO, number: 1, title: 'Add a greeting', base: 'main', state: 'open' });
    expect(card.branch).toMatch(/^agenthub\/add-a-greeting-[0-9a-f]{6}$/);
    expect(card.files).toEqual([
      { path: 'README.md', status: 'modified', additions: 1, deletions: 0 },
      { path: 'docs/new.md', status: 'added', additions: 1, deletions: 0 },
      { path: 'src/index.ts', status: 'removed', additions: 0, deletions: 1 },
    ]);
    expect([card.additions, card.deletions]).toEqual([2, 1]);
    expect(gl.files('main')).toEqual({ 'README.md': '# Hello\n', 'src/index.ts': 'export const x = 1;\n' });
    expect(gl.files(card.branch)['README.md']).toBe('# Hello\nHello, world!\n');
    expect(gl.files(card.branch)['docs/new.md']).toBe('new\n');
    expect(gl.files(card.branch)['src/index.ts']).toBeUndefined();
    expect(gl.pulls[0]?.description).toContain('小青');
    expect(rt.tools.map((item) => item.name)).toEqual(['list_directory', 'read_file', 'create_pull_request']);
    expect(gl.requests.some((request) => request.path.endsWith('/merge'))).toBe(false);
  });

  it('refuses CI workflows before calling GitLab', async () => {
    const rt = tools();
    const run = (path: string) => tool(rt, 'create_pull_request').run({ title: 't', files: [{ path, content: 'x' }] });
    await expect(run('.gitlab-ci.yml')).rejects.toThrow(/不允许改 CI 工作流/);
    await expect(run('.github/workflows/deploy.yml')).rejects.toThrow(/不允许改 CI 工作流/);
    await expect(run('.gitlab/ci/build.yml')).rejects.toThrow(/不允许改 CI 工作流/);
    expect(gl.requests.filter((request) => request.method === 'POST')).toHaveLength(0);
  });

  it('merges when the user agrees, and deletes the branch', async () => {
    const card = await openChange(tools(), 'Merge me', '# Hello\nmerged line\n');
    const merged = (await integration.cardAction(card, 'merge', config())) as PullRequestCard;
    expect(merged.state).toBe('merged');
    expect(merged.mergeSha).toBeTruthy();
    expect(gl.files('main')['README.md']).toBe('# Hello\nmerged line\n');
    expect(gl.branches()).not.toContain(card.branch);
    expect(((await integration.cardAction(merged, 'merge', config())) as PullRequestCard).state).toBe('merged');
  });

  it('closes the merge request when the user rejects it', async () => {
    const card = await openChange(tools(), 'Reject me', '# Hello\nnope\n');
    const closed = (await integration.cardAction(card, 'reject', config())) as PullRequestCard;
    expect(closed.state).toBe('closed');
    expect(gl.pulls[card.number - 1]?.state).toBe('closed');
    expect(gl.files('main')['README.md']).not.toContain('nope');
    expect(gl.branches()).not.toContain(card.branch);
  });

  it('reports a failed merge on the card instead of throwing', async () => {
    const card = await openChange(tools(), 'Conflicting', '# Hello\nconflict\n');
    gl.failNextMerge();
    const failed = (await integration.cardAction(card, 'merge', config())) as PullRequestCard;
    expect(failed.state).toBe('failed');
    expect(failed.error).toContain('无法合并');
    expect(failed.error).not.toContain(GL_TOKEN);
    expect(((await integration.cardAction(failed, 'merge', config())) as PullRequestCard).state).toBe('merged');
  });
});

describe('Bitbucket', () => {
  let bb: FakeBitbucket;
  const integration = createBitbucketIntegration();
  const config = () => ({ token: BB_TOKEN, workspace: FAKE_WORKSPACE, apiBaseUrl: bb.url });
  const tools = () => integration.createTools(BB_REPO, config(), ctx);

  beforeAll(async () => {
    bb = await startFakeBitbucket();
  });
  afterAll(() => bb.close());
  beforeEach(() => {
    bb.requests.length = 0;
  });

  it('verifies a bearer token and a basic-auth email', async () => {
    expect(await integration.verify(config())).toEqual({ account: 'octocat' });
    expect(await integration.verify({ ...config(), username: 'you@example.com' })).toEqual({ account: 'octocat' });
  });

  it('explains a bad token without echoing it', async () => {
    const err = (await integration.verify({ ...config(), token: 'bb-wrong-token-value' }).catch((e) => e)) as Error;
    expect(err.message).toBe('Bitbucket 的令牌无效或已过期');
    expect(err.message).not.toContain('wrong-token');
  });

  it('uses the Cloud API root when the address omits /2.0', async () => {
    let seen = '';
    const fetchImpl: typeof fetch = async (input) => {
      seen = String(input);
      return new Response(JSON.stringify({ username: 'octocat' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await createBitbucketIntegration(fetchImpl).verify({ workspace: 'octo', token: 't'.repeat(12), apiBaseUrl: 'https://api.bitbucket.org' });
    expect(seen).toBe('https://api.bitbucket.org/2.0/user');
  });

  it('lists repositories in the workspace', async () => {
    expect(await integration.listResources(config())).toEqual([{ id: BB_REPO, name: BB_REPO, description: 'Hello world' }]);
  });

  it('rejects a repository outside the workspace', async () => {
    expect(() => integration.createTools('other/hello', config(), ctx)).toThrow(/不属于工作区/);
    expect(() => integration.createTools('not a repo', config(), ctx)).toThrow(/仓库名不合法/);
    await expect(integration.verify({ token: BB_TOKEN, workspace: 'a/b', apiBaseUrl: bb.url })).rejects.toThrow(/工作区名称不合法/);
  });

  it('lists directories and reads files', async () => {
    const rt = tools();
    expect(await tool(rt, 'list_directory').run({})).toBe('文件 README.md（8 字节）\n目录 src');
    expect(await tool(rt, 'read_file').run({ path: 'src/index.ts' })).toBe('export const x = 1;\n');
  });

  it('opens a pull request without merging it', async () => {
    const rt = tools();
    const result = await tool(rt, 'create_pull_request').run({
      title: 'Add a greeting',
      description: '加一行问候',
      files: [
        { path: 'README.md', content: '# Hello\nHello, world!\n' },
        { path: 'src/index.ts', delete: true },
      ],
    });
    expect(result).toContain('PR #1');
    const card = rt.cards[0] as PullRequestCard;
    expect(card.branch).toMatch(/^agenthub\/add-a-greeting-[0-9a-f]{6}$/);
    expect(card.files).toEqual([
      { path: 'README.md', status: 'modified', additions: 1, deletions: 0 },
      { path: 'src/index.ts', status: 'removed', additions: 0, deletions: 1 },
    ]);
    expect(bb.files('main')['README.md']).toBe('# Hello\n');
    expect(bb.files(card.branch)['README.md']).toBe('# Hello\nHello, world!\n');
    expect(bb.files(card.branch)['src/index.ts']).toBeUndefined();
    expect(bb.pulls[0]?.description).toContain('小青');
    expect(bb.requests.some((request) => request.path.endsWith('/merge'))).toBe(false);
  });

  it('refuses pipeline files before calling Bitbucket', async () => {
    const rt = tools();
    await expect(tool(rt, 'create_pull_request').run({ title: 't', files: [{ path: 'bitbucket-pipelines.yml', content: 'x' }] })).rejects.toThrow(/不允许改 CI 工作流/);
    await expect(tool(rt, 'create_pull_request').run({ title: 't', files: [{ path: '.github/workflows/deploy.yml', content: 'x' }] })).rejects.toThrow(/不允许改 CI 工作流/);
    expect(bb.requests.filter((request) => request.method === 'POST')).toHaveLength(0);
  });

  it('merges and rejects from the card', async () => {
    const mergeCard = await openChange(tools(), 'Merge me', '# Hello\nmerged line\n');
    const merged = (await integration.cardAction(mergeCard, 'merge', config())) as PullRequestCard;
    expect(merged.state).toBe('merged');
    expect(bb.files('main')['README.md']).toBe('# Hello\nmerged line\n');
    expect(bb.branches()).not.toContain(mergeCard.branch);

    const rejectCard = await openChange(tools(), 'Reject me', '# Hello\nnope\n');
    const closed = (await integration.cardAction(rejectCard, 'reject', config())) as PullRequestCard;
    expect(closed.state).toBe('closed');
    expect(bb.pulls[rejectCard.number - 1]?.state).toBe('DECLINED');
    expect(bb.files('main')['README.md']).not.toContain('nope');
  });

  it('reports a failed merge on the card', async () => {
    const card = await openChange(tools(), 'Conflicting', '# Hello\nconflict\n');
    bb.failNextMerge();
    const failed = (await integration.cardAction(card, 'merge', config())) as PullRequestCard;
    expect(failed.state).toBe('failed');
    expect(failed.error).toContain('无法合并');
    expect(((await integration.cardAction(failed, 'merge', config())) as PullRequestCard).state).toBe('merged');
  });
});

describe('Gitea / Forgejo', () => {
  let gt: FakeGitea;
  const integration = createGiteaIntegration();
  const config = () => ({ token: GT_TOKEN, apiBaseUrl: gt.url });
  const tools = () => integration.createTools(GT_REPO, config(), ctx);

  beforeAll(async () => {
    gt = await startFakeGitea();
  });
  afterAll(() => gt.close());
  beforeEach(() => {
    gt.requests.length = 0;
  });

  it('verifies a token and accepts an address that already includes /api/v1', async () => {
    expect(await integration.verify(config())).toEqual({ account: 'octocat' });
    expect(await integration.verify({ token: GT_TOKEN, apiBaseUrl: `${gt.url}/api/v1` })).toEqual({ account: 'octocat' });
  });

  it('requires a site address and does not echo a bad token', async () => {
    await expect(integration.verify({ token: GT_TOKEN })).rejects.toThrow(/网站地址/);
    const err = (await integration.verify({ token: 'gitea-wrong-token-value', apiBaseUrl: gt.url }).catch((e) => e)) as Error;
    expect(err.message).toBe('Gitea 的令牌无效或已过期');
    expect(err.message).not.toContain('wrong-token');
  });

  it('lists repositories the token can see', async () => {
    expect(await integration.listResources(config())).toEqual([{ id: GT_REPO, name: GT_REPO, description: 'Hello world' }]);
    expect(integration.fields.find((field) => field.key === 'token')).toMatchObject({ secret: true, required: true });
  });

  it('lists directories and reads files', async () => {
    const rt = tools();
    expect(await tool(rt, 'list_directory').run({})).toBe('文件 README.md（8 字节）\n目录 src');
    expect(await tool(rt, 'read_file').run({ path: 'README.md' })).toBe('# Hello\n');
  });

  it('opens a pull request without merging it', async () => {
    const rt = tools();
    const result = await tool(rt, 'create_pull_request').run({
      title: 'Add a greeting',
      files: [
        { path: 'README.md', content: '# Hello\nHello, world!\n' },
        { path: 'src/index.ts', delete: true },
      ],
    });
    expect(result).toContain('PR #1');
    const card = rt.cards[0] as PullRequestCard;
    expect(card.repo).toBe(GT_REPO);
    expect(gt.files('main')['src/index.ts']).toBe('export const x = 1;\n');
    expect(gt.files(card.branch)['src/index.ts']).toBeUndefined();
    expect(gt.files(card.branch)['README.md']).toBe('# Hello\nHello, world!\n');
    expect(gt.pulls[0]?.body).toContain('小青');
    expect(gt.requests.some((request) => request.path.endsWith('/merge'))).toBe(false);
  });

  it('refuses Gitea, Forgejo and GitHub Actions workflows', async () => {
    const rt = tools();
    const run = (path: string) => tool(rt, 'create_pull_request').run({ title: 't', files: [{ path, content: 'x' }] });
    await expect(run('.gitea/workflows/ci.yml')).rejects.toThrow(/不允许改 CI 工作流/);
    await expect(run('.forgejo/workflows/ci.yml')).rejects.toThrow(/不允许改 CI 工作流/);
    await expect(run('.github/workflows/ci.yml')).rejects.toThrow(/不允许改 CI 工作流/);
    expect(gt.requests.filter((request) => request.method === 'POST')).toHaveLength(0);
  });

  it('merges and rejects from the card', async () => {
    const mergeCard = await openChange(tools(), 'Merge me', '# Hello\nmerged line\n');
    const merged = (await integration.cardAction(mergeCard, 'merge', config())) as PullRequestCard;
    expect(merged.state).toBe('merged');
    expect(gt.files('main')['README.md']).toBe('# Hello\nmerged line\n');
    expect(gt.branches()).not.toContain(mergeCard.branch);

    const rejectCard = await openChange(tools(), 'Reject me', '# Hello\nnope\n');
    const closed = (await integration.cardAction(rejectCard, 'reject', config())) as PullRequestCard;
    expect(closed.state).toBe('closed');
    expect(gt.files('main')['README.md']).not.toContain('nope');
    expect(gt.branches()).not.toContain(rejectCard.branch);
  });
});
