import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type Tool = 'claude' | 'codex';
export const TOOL_LABELS: Record<Tool, string> = { claude: 'Claude Code', codex: 'Codex' };
export const isTool = (value: unknown): value is Tool => value === 'claude' || value === 'codex';

export interface RunnerOptions {
  /** Commands to run, e.g. { claude: 'claude', codex: 'codex' }. */
  bins: Record<Tool, string>;
  /** Directory the tools work in. */
  workdir: string;
  timeoutMs: number;
}

const MAX_OUTPUT = 2_000_000;

interface Spawned {
  stdout: string;
  stderr: string;
  code: number | null;
}

/** Runs a command with the prompt on stdin (so size and quoting never matter). */
function execute(bin: string, args: string[], prompt: string, opts: { cwd: string; timeoutMs: number; signal?: AbortSignal }): Promise<Spawned> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Windows installs these tools as .cmd shims; the arguments here are fixed, never user text.
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      fn();
    };
    const kill = () => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    };
    const onAbort = () => {
      kill();
      finish(() => reject(new Error('任务已取消')));
    };
    const timer = setTimeout(() => {
      kill();
      finish(() => reject(new Error(`运行超过 ${Math.round(opts.timeoutMs / 60000)} 分钟，已停止`)));
    }, opts.timeoutMs);
    if (opts.signal?.aborted) return onAbort();
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout.on('data', (d) => {
      if (stdout.length < MAX_OUTPUT) stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-4000);
    });
    child.on('error', (err: NodeJS.ErrnoException) =>
      finish(() => reject(new Error(err.code === 'ENOENT' ? `找不到命令 ${bin}，这台电脑上没有安装或不在 PATH 里` : err.message))),
    );
    child.on('close', (code) => finish(() => resolve({ stdout, stderr, code })));
    child.stdin.on('error', () => {}); // the tool may exit before reading everything
    child.stdin.end(prompt);
  });
}

const tail = (text: string) => text.trim().split('\n').slice(-3).join(' ').slice(0, 300);

/**
 * Asks a locally installed coding tool to answer a prompt. Without `write` the
 * tool only reads: Claude Code in plan mode, Codex in a read-only sandbox.
 */
export async function runTool(tool: Tool, prompt: string, write: boolean, opts: RunnerOptions, signal?: AbortSignal): Promise<string> {
  const label = TOOL_LABELS[tool];
  const common = { cwd: opts.workdir, timeoutMs: opts.timeoutMs, signal };

  if (tool === 'claude') {
    const mode = write ? 'acceptEdits' : 'plan';
    const r = await execute(opts.bins.claude, ['-p', '--permission-mode', mode, '--output-format', 'text'], prompt, common);
    if (r.code !== 0) throw new Error(`${label} 运行失败（退出码 ${r.code}）：${tail(r.stderr || r.stdout)}`);
    return r.stdout.trim();
  }

  // Codex writes its final message to a file, which is cleaner than parsing the progress log on stdout.
  const dir = await mkdtemp(join(tmpdir(), 'agenthub-bridge-'));
  const outFile = join(dir, 'answer.txt');
  try {
    const sandbox = write ? 'workspace-write' : 'read-only';
    const r = await execute(opts.bins.codex, ['exec', '--sandbox', sandbox, '--skip-git-repo-check', '--output-last-message', outFile, '-'], prompt, common);
    if (r.code !== 0) throw new Error(`${label} 运行失败（退出码 ${r.code}）：${tail(r.stderr || r.stdout)}`);
    const answer = await readFile(outFile, 'utf8').catch(() => r.stdout);
    return answer.trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Which of the tools can be started on this computer. */
export async function detectTools(bins: Record<Tool, string>): Promise<Tool[]> {
  const found: Tool[] = [];
  for (const tool of ['claude', 'codex'] as const) {
    try {
      const r = await execute(bins[tool], ['--version'], '', { cwd: process.cwd(), timeoutMs: 10_000 });
      if (r.code === 0) found.push(tool);
    } catch {
      // Not installed.
    }
  }
  return found;
}
