import type { Card, PullRequestCard, PullRequestFile } from '../types.js';
import { ForgeError } from './forge-http.js';
import type { ToolContext, ToolDef, ToolRuntime } from './types.js';

export const MAX_READ_CHARS = 60_000;
export const MAX_FILES_PER_PR = 20;
export const MAX_FILE_CHARS = 200_000;
export const MAX_TOTAL_CHARS = 1_000_000;

/** owner/repo, or GitLab's group/subgroup/project. */
export const REPO_NESTED = /^[\w.-]+(?:\/[\w.-]+)+$/;
/** Exactly two segments. GitHub, Bitbucket and Gitea use this. */
export const REPO_TWO = /^[\w.-]+\/[\w.-]+$/;

export interface DirectoryEntry {
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

/** What was already on the default branch, used to choose create/update and to count lines. */
export interface ExistingFile {
  exists: boolean;
  /** Null when the file is missing, or when it is too large / binary to diff. */
  text: string | null;
  /** Blob id when the forge requires it to update or delete. */
  sha?: string;
}

export interface OpenedChange {
  number: number;
  url: string;
  base: string;
}

export interface ChangeRequestState {
  state: 'open' | 'merged' | 'closed';
  mergeSha?: string;
}

/**
 * The parts of a code host that are not the assistant-facing tools.
 * Tools, path checks and the confirmation card are shared.
 */
export interface CodeHost {
  label: string;
  repo: string;
  protectedPath(path: string): boolean;
  /** Entries of a directory, or 'file' when path points at a file. */
  listDirectory(path: string): Promise<DirectoryEntry[] | 'file'>;
  readFile(path: string): Promise<{ kind: 'text'; text: string } | { kind: 'dir' } | { kind: 'binary' }>;
  readExisting(path: string): Promise<ExistingFile>;
  open(input: {
    title: string;
    description: string;
    branch: string;
    files: { path: string; content?: string; delete?: boolean; existing: ExistingFile }[];
    assistantName: string;
  }): Promise<OpenedChange>;
  getRequest(number: number): Promise<ChangeRequestState>;
  merge(number: number, title: string): Promise<{ sha?: string }>;
  close(number: number): Promise<void>;
  deleteBranch(branch: string): Promise<void>;
}

export function encodePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function decodeBase64Utf8(text: string): string {
  const binary = atob(text.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Normalizes a repository path; rejects anything that could escape or touch git internals. */
export function cleanPath(value: unknown, { allowEmpty = false } = {}): string {
  const path = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (!path && !allowEmpty) throw new Error('缺少文件路径');
  if (path.split('/').some((seg) => seg === '..' || seg === '.' || seg.toLowerCase() === '.git')) {
    throw new Error(`路径不合法：${path}`);
  }
  return path;
}

export function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30).replace(/-+$/, '') || 'change';
}

export function limitText(text: string): string {
  if (text.includes('\u0000')) return '这是二进制文件，无法显示。';
  return text.length > MAX_READ_CHARS ? `${text.slice(0, MAX_READ_CHARS)}\n…（文件太长，只显示了前 ${MAX_READ_CHARS} 个字符）` : text;
}

function linesOf(text: string): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function lcsLength(a: string[], b: string[]): number {
  const m = b.length;
  let prev = new Uint32Array(m + 1);
  let cur = new Uint32Array(m + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= m; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    }
    const swap = prev;
    prev = cur;
    cur = swap;
    cur.fill(0);
  }
  return prev[m] ?? 0;
}

/** Line counts for the confirmation card. Large files fall back to "replaced". */
export function lineStats(before: string, after: string): { additions: number; deletions: number } {
  const a = linesOf(before);
  const b = linesOf(after);
  if (a.length * b.length > 250_000) return { additions: b.length, deletions: a.length };
  const same = lcsLength(a, b);
  return { additions: b.length - same, deletions: a.length - same };
}

/**
 * CI config that runs with repository secrets. GitHub Actions paths are blocked
 * on every host; each forge also blocks its own pipeline file.
 */
export function isProtectedCodePath(host: 'gitlab' | 'bitbucket' | 'gitea', path: string): boolean {
  const p = path.toLowerCase();
  if (p === '.github/workflows' || p.startsWith('.github/workflows/')) return true;
  if (host === 'gitlab') {
    if (p === '.gitlab-ci.yml' || p === '.gitlab-ci.yaml') return true;
    if (p === '.gitlab/ci' || p.startsWith('.gitlab/ci/')) return true;
  }
  if (host === 'bitbucket') {
    if (p === 'bitbucket-pipelines.yml') return true;
  }
  if (host === 'gitea') {
    if (p === '.gitea/workflows' || p.startsWith('.gitea/workflows/')) return true;
    if (p === '.forgejo/workflows' || p.startsWith('.forgejo/workflows/')) return true;
  }
  return false;
}

function formatDirectory(entries: DirectoryEntry[]): string {
  if (!entries.length) return '（空目录）';
  return entries
    .map((entry) => (entry.type === 'dir' ? `目录 ${entry.path}` : `文件 ${entry.path}${entry.size != null ? `（${entry.size} 字节）` : ''}`))
    .join('\n');
}

function fileStats(existing: ExistingFile, change: { content?: string; delete?: boolean }): PullRequestFile {
  if (change.delete) {
    return { path: '', status: 'removed', ...lineStats(existing.text ?? '', '') };
  }
  if (!existing.exists) return { path: '', status: 'added', ...lineStats('', change.content ?? '') };
  return { path: '', status: 'modified', ...lineStats(existing.text ?? '', change.content ?? '') };
}

export function buildCodeHostTools(host: CodeHost, ctx: ToolContext): ToolRuntime {
  const cards: Card[] = [];

  const listDirectory: ToolDef = {
    name: 'list_directory',
    description: `列出仓库 ${host.repo} 默认分支里某个目录的内容。path 留空表示仓库根目录。`,
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '目录路径，例如 src/components；根目录留空' } },
    },
    async run(args) {
      const path = cleanPath(args.path, { allowEmpty: true });
      const data = await host.listDirectory(path);
      if (data === 'file') return `${path} 是一个文件，请用 read_file 读取。`;
      return formatDirectory(data);
    },
  };

  const readFile: ToolDef = {
    name: 'read_file',
    description: `读取仓库 ${host.repo} 默认分支里的一个文本文件。`,
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '文件路径，例如 src/index.ts' } },
      required: ['path'],
    },
    async run(args) {
      const path = cleanPath(args.path);
      const file = await host.readFile(path);
      if (file.kind === 'dir') return `${path} 是一个目录，请用 list_directory 查看。`;
      if (file.kind === 'binary') return '这是二进制文件，无法显示。';
      return limitText(file.text);
    },
  };

  const createPullRequest: ToolDef = {
    name: 'create_pull_request',
    description:
      `把对仓库 ${host.repo} 的修改提交到一个新分支并创建 Pull Request。你不能合并它：用户会在聊天里看到确认卡片，点"同意合并"后才会合并。` +
      '每个文件都要给出完整的新内容（不是差异）。先用 read_file 读过原文件再修改。',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'PR 标题，简短说明改了什么' },
        description: { type: 'string', description: 'PR 说明：为什么改、改了什么' },
        files: {
          type: 'array',
          description: `要新增、修改或删除的文件，最多 ${MAX_FILES_PER_PR} 个`,
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string', description: '文件的完整新内容；删除文件时省略' },
              delete: { type: 'boolean', description: '设为 true 表示删除这个文件' },
            },
            required: ['path'],
          },
        },
      },
      required: ['title', 'files'],
    },
    async run(args) {
      const card = await openChange(host, args, ctx);
      cards.push(card);
      return (
        `已在新分支 ${card.branch} 提交，并创建了 PR #${card.number}（${card.files.length} 个文件，+${card.additions} −${card.deletions}）。` +
        '这个 PR 需要用户在聊天里点"同意合并"后才会合并，你不能合并。请用一两句话告诉用户你改了什么。'
      );
    },
  };

  return {
    tools: [listDirectory, readFile, createPullRequest],
    cards,
    instructions: [
      `这个对话绑定了 ${host.label} 仓库 ${host.repo}。你可以用工具读取其中的目录和文件，不用凭空猜测代码。`,
      '需要改代码时，先读相关文件，再调用 create_pull_request 提交：修改会进入新分支并开 PR，由用户确认后才合并，你不能合并。',
      '不要修改 CI 工作流（.github/workflows，以及这个代码托管自己的流水线配置）。',
    ].join('\n'),
  };
}

async function openChange(host: CodeHost, args: Record<string, unknown>, ctx: ToolContext): Promise<PullRequestCard> {
  const title = String(args.title ?? '').trim().slice(0, 200);
  const description = String(args.description ?? '').trim();
  if (!title) throw new Error('缺少 PR 标题');
  if (!Array.isArray(args.files) || !args.files.length) throw new Error('至少要修改一个文件');
  if (args.files.length > MAX_FILES_PER_PR) throw new Error(`一次最多修改 ${MAX_FILES_PER_PR} 个文件`);

  let total = 0;
  const seen = new Set<string>();
  const planned = (args.files as Record<string, unknown>[]).map((file) => {
    const path = cleanPath(file?.path);
    if (host.protectedPath(path)) throw new Error(`不能修改 ${path}：助手不允许改 CI 工作流`);
    if (seen.has(path)) throw new Error(`文件重复：${path}`);
    seen.add(path);
    if (file.delete === true) return { path, delete: true as const };
    if (typeof file.content !== 'string') throw new Error(`缺少 ${path} 的完整内容`);
    if (file.content.length > MAX_FILE_CHARS) throw new Error(`${path} 太大`);
    total += file.content.length;
    return { path, content: file.content };
  });
  if (total > MAX_TOTAL_CHARS) throw new Error('这次修改的内容太多，请拆成几个 PR');

  const files = [];
  for (const file of planned) {
    const existing = await host.readExisting(file.path);
    if (file.delete && !existing.exists) throw new Error(`文件不存在：${file.path}`);
    files.push({ ...file, existing });
  }

  const branch = `agenthub/${slug(title)}-${crypto.randomUUID().slice(0, 6)}`;
  const opened = await host.open({ title, description, branch, files, assistantName: ctx.assistantName });
  const cardFiles: PullRequestFile[] = files.map((file) => ({ ...fileStats(file.existing, file), path: file.path }));

  return {
    type: 'pull_request',
    integrationId: ctx.integrationId,
    repo: host.repo,
    number: opened.number,
    title,
    url: opened.url,
    branch,
    base: opened.base,
    files: cardFiles,
    additions: cardFiles.reduce((sum, file) => sum + file.additions, 0),
    deletions: cardFiles.reduce((sum, file) => sum + file.deletions, 0),
    state: 'open',
  };
}

export async function codeHostCardAction(host: CodeHost, card: Card, action: 'merge' | 'reject'): Promise<Card> {
  if (card.type !== 'pull_request') throw new Error('不支持的卡片类型');
  if (card.state === 'merged' || card.state === 'closed') return card;
  const current = await host.getRequest(card.number);
  if (current.state === 'merged') return { ...card, state: 'merged', error: undefined, mergeSha: current.mergeSha ?? card.mergeSha };
  if (current.state === 'closed') return { ...card, state: 'closed', error: undefined };

  if (action === 'reject') {
    await host.close(card.number);
    await host.deleteBranch(card.branch);
    return { ...card, state: 'closed', error: undefined };
  }

  let merged: { sha?: string };
  try {
    merged = await host.merge(card.number, card.title);
  } catch (err) {
    if (err instanceof ForgeError && [400, 405, 406, 409, 422].includes(err.status)) {
      const detail = err.message.replace(new RegExp(`^${host.label} 返回 \\d+：`), '');
      return { ...card, state: 'failed', error: `无法合并：${detail}` };
    }
    throw err;
  }
  await host.deleteBranch(card.branch);
  return { ...card, state: 'merged', error: undefined, mergeSha: merged.sha };
}

export function prBody(description: string, assistantName: string): string {
  return `${description}${description ? '\n\n' : ''}---\n由 AgentHub 里的助手「${assistantName}」创建；需要在 AgentHub 里确认后才会合并。`;
}
