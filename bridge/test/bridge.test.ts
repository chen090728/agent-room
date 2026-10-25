import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';
import { BridgeClient } from '../src/client.js';
import { loadConfig, normalizeServer, saveConfig } from '../src/config.js';
import { pairWithServer } from '../src/pair.js';
import { detectTools, runTool } from '../src/runner.js';
import { makeFakeTools } from './fake-tools.js';

const tools = makeFakeTools();
const workdir = mkdtempSync(join(tmpdir(), 'agenthub-workdir-'));
afterAll(() => {
  rmSync(tools.dir, { recursive: true, force: true });
  rmSync(workdir, { recursive: true, force: true });
});
const runner = { bins: tools.bins, workdir, timeoutMs: 10_000 };

describe('runner', () => {
  it('finds the tools that can be started', async () => {
    expect(await detectTools(tools.bins)).toEqual(['claude', 'codex']);
    expect(await detectTools({ claude: tools.bins.claude, codex: '/no/such/codex' })).toEqual(['claude']);
  });

  it('runs Claude Code read-only by default, with the prompt on stdin and in the work directory', async () => {
    const text = await runTool('claude', '你好\n第二行', false, runner);
    expect(text).toBe('claude answers: 第二行');
    const call = tools.calls('claude').at(-1)!;
    expect(call.args).toEqual(['-p', '--permission-mode', 'plan', '--output-format', 'text']);
    expect(call.stdin).toBe('你好\n第二行');
    expect(call.cwd).toContain('agenthub-workdir-');
  });

  it('lets Claude Code edit files only when asked', async () => {
    await runTool('claude', 'edit', true, runner);
    expect(tools.calls('claude').at(-1)!.args).toContain('acceptEdits');
  });

  it('runs Codex in a sandbox and reads its final message, not the progress output', async () => {
    expect(await runTool('codex', 'hi', false, runner)).toBe('codex answers: hi');
    const args = tools.calls('codex').at(-1)!.args;
    expect(args.slice(0, 3)).toEqual(['exec', '--sandbox', 'read-only']);
    expect(args.at(-1)).toBe('-');
    await runTool('codex', 'hi', true, runner);
    expect(tools.calls('codex').at(-1)!.args[2]).toBe('workspace-write');
  });

  it('reports a failing tool with the end of its error output', async () => {
    await expect(runTool('claude', 'FAIL', false, runner)).rejects.toThrow(/退出码 3.*boom/);
    await expect(runTool('claude', 'x', false, { ...runner, bins: { ...tools.bins, claude: '/no/such/claude' } })).rejects.toThrow(/找不到命令/);
  });

  it('stops a tool that runs too long or is cancelled', async () => {
    await expect(runTool('claude', 'HANG', false, { ...runner, timeoutMs: 300 })).rejects.toThrow(/已停止/);
    const controller = new AbortController();
    const pending = runTool('claude', 'HANG', false, runner, controller.signal);
    setTimeout(() => controller.abort(), 200);
    await expect(pending).rejects.toThrow(/取消/);
  });
});

describe('config and pairing', () => {
  it('saves credentials readable only by the user', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agenthub-cfg-'));
    const path = join(dir, 'sub', 'config.json');
    expect(loadConfig(path)).toBeNull();
    saveConfig(path, { server: 'https://x.example', bridgeId: 'b', token: 't' });
    expect(loadConfig(path)).toEqual({ server: 'https://x.example', bridgeId: 'b', token: 't' });
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o077).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it('normalizes the server address', () => {
    expect(normalizeServer(' https://hub.example.workers.dev/ ')).toBe('https://hub.example.workers.dev');
    expect(() => normalizeServer('hub.example')).toThrow(/服务器地址/);
    expect(() => normalizeServer('ftp://hub.example')).toThrow(/http/);
  });

  it('pairs, passing along existing credentials for the same server only', async () => {
    const seen: any[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seen.push(JSON.parse(init.body as string));
      return seen.length === 3
        ? Response.json({ error: '配对码无效或已过期，请回到 App 重新获取' }, { status: 400 })
        : Response.json({ bridgeId: 'b1', token: 'tok', memberName: '代码员', tool: 'claude' });
    }) as unknown as typeof fetch;

    const first = await pairWithServer({ server: 'https://hub.example/', code: 'AB', tools: ['claude'], name: '我的电脑', fetchImpl });
    expect(first).toMatchObject({ config: { server: 'https://hub.example', bridgeId: 'b1', token: 'tok' }, memberName: '代码员' });
    expect(seen[0].token).toBeUndefined();

    await pairWithServer({ server: 'https://hub.example', code: 'CD', tools: [], existing: first.config, fetchImpl });
    expect(seen[1]).toMatchObject({ bridgeId: 'b1', token: 'tok' });
    await expect(pairWithServer({ server: 'https://hub.example', code: 'EF', tools: [], fetchImpl })).rejects.toThrow('配对码无效或已过期');
    await pairWithServer({ server: 'https://other.example', code: 'GH', tools: [], existing: first.config, fetchImpl: (async (_u: string, init: RequestInit) => {
      seen.push(JSON.parse(init.body as string));
      return Response.json({ bridgeId: 'b2', token: 't2', memberName: 'x', tool: 'codex' });
    }) as unknown as typeof fetch });
    expect(seen[3].token).toBeUndefined();
  });
});

describe('client', () => {
  let http: Server | undefined;
  afterAll(() => http?.close());

  /** A server that accepts one bridge and records what it sends. */
  async function fakeServer() {
    http = createServer();
    const wss = new WebSocketServer({ server: http, path: '/ws/bridge' });
    const state = { sockets: [] as WebSocket[], frames: [] as any[], authFrames: [] as any[] };
    wss.on('connection', (ws) => {
      state.sockets.push(ws);
      let authed = false;
      ws.on('message', (raw) => {
        const frame = JSON.parse(raw.toString());
        if (!authed) {
          state.authFrames.push(frame);
          if (frame.token !== 'good') return ws.close(4401, 'unauthorized');
          authed = true;
          return ws.send(JSON.stringify({ type: 'hello' }));
        }
        state.frames.push(frame);
      });
    });
    await new Promise<void>((r) => http!.listen(0, '127.0.0.1', r));
    const port = (http.address() as import('node:net').AddressInfo).port;
    const waitFor = async (pred: (f: any) => boolean) => {
      for (let i = 0; i < 100; i++) {
        const hit = state.frames.find(pred);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error('timed out');
    };
    return { state, url: `http://127.0.0.1:${port}`, waitFor };
  }

  const options = (extra = {}) => ({ ...runner, tools: ['claude', 'codex'] as ('claude' | 'codex')[], allowWrite: false, maxJobs: 1, ...extra });

  it('authenticates, reports its tools and answers jobs; write needs the owner\'s consent', async () => {
    const server = await fakeServer();
    const client = new BridgeClient({ server: server.url, bridgeId: 'b1', token: 'good' }, options());
    const done = client.start();
    const tools = await server.waitFor((f) => f.type === 'tools');
    expect(tools.tools).toEqual(['claude', 'codex']);
    expect(server.state.authFrames[0]).toEqual({ type: 'auth', bridgeId: 'b1', token: 'good' });

    const ws = server.state.sockets[0]!;
    ws.send(JSON.stringify({ type: 'job', id: 'j1', tool: 'claude', prompt: '请回答', write: false }));
    expect(await server.waitFor((f) => f.id === 'j1')).toEqual({ type: 'result', id: 'j1', ok: true, text: 'claude answers: 请回答' });

    // The server asks for write access; this bridge was started without --allow-write.
    ws.send(JSON.stringify({ type: 'job', id: 'j2', tool: 'codex', prompt: '改文件', write: true }));
    const j2 = await server.waitFor((f) => f.id === 'j2');
    expect(j2.ok).toBe(true);
    expect(j2.text).toContain('没有开启写入权限');
    expect(tools && server.state.frames.length).toBeGreaterThan(0);

    ws.send(JSON.stringify({ type: 'job', id: 'j3', tool: 'claude', prompt: 'FAIL', write: false }));
    expect(await server.waitFor((f) => f.id === 'j3')).toMatchObject({ ok: false, error: expect.stringContaining('boom') });
    ws.send(JSON.stringify({ type: 'job', id: 'j4', tool: 'vim', prompt: 'x', write: false }));
    expect(await server.waitFor((f) => f.id === 'j4')).toMatchObject({ ok: false });
    ws.send(JSON.stringify({ type: 'job', id: 'j5', tool: 'claude', prompt: '', write: false }));
    expect(await server.waitFor((f) => f.id === 'j5')).toMatchObject({ ok: false, error: '任务内容是空的' });

    client.stop();
    expect(await done).toBe('stopped');
  });

  it('grants write access only with --allow-write', async () => {
    const server = await fakeServer();
    const client = new BridgeClient({ server: server.url, bridgeId: 'b1', token: 'good' }, options({ allowWrite: true }));
    client.start();
    await server.waitFor((f) => f.type === 'tools');
    server.state.sockets[0]!.send(JSON.stringify({ type: 'job', id: 'w1', tool: 'claude', prompt: 'edit', write: true }));
    const r = await server.waitFor((f) => f.id === 'w1');
    expect(r.text).not.toContain('没有开启写入权限');
    expect(tools.calls('claude').at(-1)!.args).toContain('acceptEdits');
    client.stop();
  });

  it('cancels a running job and runs one job at a time by default', async () => {
    const server = await fakeServer();
    const client = new BridgeClient({ server: server.url, bridgeId: 'b1', token: 'good' }, options());
    client.start();
    await server.waitFor((f) => f.type === 'tools');
    const ws = server.state.sockets[0]!;
    ws.send(JSON.stringify({ type: 'job', id: 'h1', tool: 'claude', prompt: 'HANG', write: false }));
    ws.send(JSON.stringify({ type: 'job', id: 'h2', tool: 'claude', prompt: 'second', write: false }));
    await new Promise((r) => setTimeout(r, 400));
    expect(server.state.frames.some((f) => f.id === 'h2')).toBe(false); // queued behind the first
    ws.send(JSON.stringify({ type: 'cancel', id: 'h1' }));
    expect(await server.waitFor((f) => f.id === 'h1')).toMatchObject({ ok: false, error: '任务已取消' });
    expect(await server.waitFor((f) => f.id === 'h2')).toMatchObject({ ok: true });
    client.stop();
  });

  it('stops for good when the server rejects its credentials', async () => {
    const server = await fakeServer();
    const lines: string[] = [];
    const client = new BridgeClient({ server: server.url, bridgeId: 'b1', token: 'bad' }, options({ log: (l: string) => lines.push(l) }));
    expect(await client.start()).toBe('unauthorized');
    expect(lines.join('\n')).toContain('重新配对');
  });
});
