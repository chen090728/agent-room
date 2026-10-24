import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PullRequestCard } from '../src/types.js';
import { createGitHubIntegration } from '../src/integrations/github.js';
import type { ToolRuntime } from '../src/integrations/types.js';
import { FAKE_REPO, FAKE_TOKEN, startFakeGitHub, type FakeGitHub } from './fake-github.js';

let gh: FakeGitHub;
const integration = createGitHubIntegration();
const config = () => ({ token: FAKE_TOKEN, apiBaseUrl: gh.url });
const tools = (): ToolRuntime => integration.createTools(FAKE_REPO, config(), { integrationId: 'int-1', assistantName: '小青' });
const tool = (rt: ToolRuntime, name: string) => rt.tools.find((t) => t.name === name)!;

beforeAll(async () => {
  gh = await startFakeGitHub();
});
afterAll(() => gh.close());
beforeEach(() => {
  gh.requests.length = 0;
});

describe('GitHub connection', () => {
  it('verifies a token and names the account', async () => {
    expect(await integration.verify(config())).toEqual({ account: 'octocat' });
  });

  it('explains a bad token without echoing it', async () => {
    const bad = { token: 'github_pat_wrong_token_value', apiBaseUrl: gh.url };
    const err = await integration.verify(bad).catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('令牌无效或已过期');
    expect((err as Error).message).not.toContain('wrong_token');
  });

  it('lists the repositories the token can see', async () => {
    expect(await integration.listResources(config())).toEqual([{ id: FAKE_REPO, name: FAKE_REPO, description: 'Hello world' }]);
  });

  it('rejects an invalid repository name', () => {
    expect(() => integration.createTools('not a repo', config(), { integrationId: 'x', assistantName: 'a' })).toThrow(/仓库名不合法/);
  });
});

describe('GitHub tools', () => {
  it('lists directories and reads files from the default branch', async () => {
    const rt = tools();
    expect(await tool(rt, 'list_directory').run({})).toBe('文件 README.md（8 字节）\n目录 src');
    expect(await tool(rt, 'list_directory').run({ path: 'src' })).toBe('文件 src/index.ts（20 字节）');
    expect(await tool(rt, 'read_file').run({ path: 'README.md' })).toBe('# Hello\n');
    expect(await tool(rt, 'read_file').run({ path: '/src/index.ts' })).toBe('export const x = 1;\n');
  });

  it('refuses paths that escape the repository or touch .git', async () => {
    const rt = tools();
    await expect(tool(rt, 'read_file').run({ path: '../secrets' })).rejects.toThrow(/路径不合法/);
    await expect(tool(rt, 'read_file').run({ path: 'a/.git/config' })).rejects.toThrow(/路径不合法/);
    await expect(tool(rt, 'read_file').run({})).rejects.toThrow(/缺少文件路径/);
  });

  it('does not pass the token to the model when GitHub rejects the request', async () => {
    const rt = integration.createTools(FAKE_REPO, { token: 'github_pat_secretvalue_9999', apiBaseUrl: gh.url }, { integrationId: 'x', assistantName: 'a' });
    const err = await tool(rt, 'read_file').run({ path: 'README.md' }).catch((e) => e as Error);
    expect((err as Error).message).toContain('令牌无效');
    expect((err as Error).message).not.toContain('secretvalue');
  });

  it('opens a pull request on a new branch and leaves the default branch untouched', async () => {
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
    expect(card).toMatchObject({ type: 'pull_request', integrationId: 'int-1', repo: FAKE_REPO, number: 1, title: 'Add a greeting', base: 'main', state: 'open' });
    expect(card.branch).toMatch(/^agenthub\/add-a-greeting-[0-9a-f]{6}$/);
    expect(card.files).toEqual([
      { path: 'README.md', status: 'modified', additions: 1, deletions: 0 },
      { path: 'docs/new.md', status: 'added', additions: 1, deletions: 0 },
      { path: 'src/index.ts', status: 'removed', additions: 0, deletions: 1 },
    ]);
    expect([card.additions, card.deletions]).toEqual([2, 1]);

    expect(gh.files('main')).toEqual({ 'README.md': '# Hello\n', 'src/index.ts': 'export const x = 1;\n' });
    expect(gh.files(card.branch)['README.md']).toBe('# Hello\nHello, world!\n');
    expect(gh.pulls[0].body).toContain('小青');
    // Nothing in the tool set can merge.
    expect(rt.tools.map((t) => t.name)).toEqual(['list_directory', 'read_file', 'create_pull_request']);
    expect(gh.requests.some((r) => r.path.endsWith('/merge'))).toBe(false);
  });

  it('refuses to edit CI workflows, duplicates and oversized changes', async () => {
    const rt = tools();
    const run = (args: Record<string, unknown>) => tool(rt, 'create_pull_request').run(args);
    await expect(run({ title: 't', files: [{ path: '.github/workflows/deploy.yml', content: 'x' }] })).rejects.toThrow(/不允许改 CI 工作流/);
    await expect(run({ title: 't', files: [{ path: 'a', content: 'x' }, { path: 'a', content: 'y' }] })).rejects.toThrow(/文件重复/);
    await expect(run({ title: 't', files: [{ path: 'a' }] })).rejects.toThrow(/缺少 a 的完整内容/);
    await expect(run({ title: '', files: [{ path: 'a', content: 'x' }] })).rejects.toThrow(/缺少 PR 标题/);
    await expect(run({ title: 't', files: [] })).rejects.toThrow(/至少要修改一个文件/);
    await expect(run({ title: 't', files: [{ path: 'big', content: 'x'.repeat(200_001) }] })).rejects.toThrow(/太大/);
    expect(gh.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });
});

describe('pull request cards', () => {
  const open = async (title: string, content: string) => {
    const rt = tools();
    await tool(rt, 'create_pull_request').run({ title, files: [{ path: 'README.md', content }] });
    return rt.cards[0] as PullRequestCard;
  };

  it('merges when the user agrees, and deletes the branch', async () => {
    const card = await open('Merge me', '# Hello\nmerged line\n');
    const merged = (await integration.cardAction(card, 'merge', config())) as PullRequestCard;
    expect(merged.state).toBe('merged');
    expect(gh.files('main')['README.md']).toBe('# Hello\nmerged line\n');
    expect(gh.branches()).not.toContain(card.branch);
    // Tapping again is harmless.
    expect(((await integration.cardAction(merged, 'merge', config())) as PullRequestCard).state).toBe('merged');
  });

  it('closes the pull request when the user rejects it', async () => {
    const card = await open('Reject me', '# Hello\nnope\n');
    const closed = (await integration.cardAction(card, 'reject', config())) as PullRequestCard;
    expect(closed.state).toBe('closed');
    expect(gh.pulls[card.number - 1].state).toBe('closed');
    expect(gh.files('main')['README.md']).not.toContain('nope');
    expect(gh.branches()).not.toContain(card.branch);
  });

  it('reports a failed merge on the card instead of throwing', async () => {
    const card = await open('Conflicting', '# Hello\nconflict\n');
    gh.failNextMerge();
    const failed = (await integration.cardAction(card, 'merge', config())) as PullRequestCard;
    expect(failed.state).toBe('failed');
    expect(failed.error).toContain('无法合并');
    // It can be tried again.
    expect(((await integration.cardAction(failed, 'merge', config())) as PullRequestCard).state).toBe('merged');
  });
});
