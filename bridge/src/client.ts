import WebSocket from 'ws';
import type { BridgeConfig } from './config.js';
import { isTool, runTool, TOOL_LABELS, type RunnerOptions, type Tool } from './runner.js';

export interface ClientOptions extends RunnerOptions {
  /** Whether jobs may change files. Jobs asking for it are run read-only otherwise. */
  allowWrite: boolean;
  /** Jobs run at the same time; the rest wait. */
  maxJobs: number;
  /** Tools to report to the server. */
  tools: Tool[];
  log?: (line: string) => void;
}

interface Job {
  id: string;
  tool: unknown;
  prompt: unknown;
  write: unknown;
}

const UNAUTHORIZED_CODE = 4401;

/**
 * Keeps one connection to the server's /ws/bridge, runs the jobs it sends on
 * this computer and returns the answers. It only ever connects outwards.
 */
export class BridgeClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private delay = 1000;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private running = new Map<string, AbortController>();
  private queue: Job[] = [];
  private active = 0;
  private log: (line: string) => void;

  constructor(
    private config: BridgeConfig,
    private opts: ClientOptions,
  ) {
    this.log = opts.log ?? (() => {});
  }

  /** Resolves when stopped, or when the server rejects this computer's credentials. */
  start(): Promise<'stopped' | 'unauthorized'> {
    return new Promise((resolve) => {
      this.onEnd = resolve;
      this.connect();
    });
  }

  private onEnd: (reason: 'stopped' | 'unauthorized') => void = () => {};

  stop() {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const c of this.running.values()) c.abort();
    this.ws?.close();
    this.onEnd('stopped');
  }

  private connect() {
    if (this.stopped) return;
    const url = `${this.config.server.replace(/^http/, 'ws')}/ws/bridge`;
    const ws = new WebSocket(url);
    this.ws = ws;
    let opened = false;

    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', bridgeId: this.config.bridgeId, token: this.config.token })));
    ws.on('message', (raw) => {
      let frame: any;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (frame.type === 'hello') {
        opened = true;
        this.delay = 1000;
        this.log('已连接到服务器');
        ws.send(JSON.stringify({ type: 'tools', tools: this.opts.tools }));
        const ping = setInterval(() => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ type: 'ping' })), 25_000);
        ws.once('close', () => clearInterval(ping));
      } else if (frame.type === 'job') {
        this.enqueue(frame);
      } else if (frame.type === 'cancel' && typeof frame.id === 'string') {
        this.running.get(frame.id)?.abort();
        this.queue = this.queue.filter((j) => j.id !== frame.id);
      }
    });
    ws.on('error', (err) => this.log(`连接出错：${err.message}`));
    ws.on('close', (code) => {
      this.ws = null;
      if (this.stopped) return;
      if (code === UNAUTHORIZED_CODE) {
        this.log('服务器不认这台电脑的凭证了，请重新配对');
        this.stopped = true;
        return this.onEnd('unauthorized');
      }
      if (opened) this.log('连接断开，正在重连…');
      const wait = this.delay;
      this.delay = Math.min(this.delay * 2, 30_000);
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        this.connect();
      }, wait);
      this.timers.add(timer);
    });
  }

  private send(frame: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame));
  }

  private enqueue(job: Job) {
    if (typeof job.id !== 'string') return;
    this.queue.push(job);
    this.pump();
  }

  private pump() {
    while (this.active < this.opts.maxJobs && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      this.execute(job).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async execute(job: Job) {
    const id = job.id;
    if (!isTool(job.tool) || !this.opts.tools.includes(job.tool)) {
      return this.send({ type: 'result', id, ok: false, error: `这台电脑上没有可用的 ${isTool(job.tool) ? TOOL_LABELS[job.tool] : String(job.tool)}` });
    }
    if (typeof job.prompt !== 'string' || !job.prompt) return this.send({ type: 'result', id, ok: false, error: '任务内容是空的' });

    // The server can ask for write access, but only the owner of this computer grants it.
    const wantsWrite = job.write === true;
    const write = wantsWrite && this.opts.allowWrite;
    const controller = new AbortController();
    this.running.set(id, controller);
    this.log(`开始任务 ${id.slice(0, 8)}：${TOOL_LABELS[job.tool]}，${write ? '可写' : '只读'}，${job.prompt.length} 字`);
    try {
      let text = await runTool(job.tool, job.prompt, write, this.opts, controller.signal);
      if (wantsWrite && !write) text += '\n\n（这台电脑的 bridge 没有开启写入权限，已按只读运行。要允许修改文件，启动 bridge 时加 --allow-write）';
      this.log(`任务 ${id.slice(0, 8)} 完成`);
      this.send({ type: 'result', id, ok: true, text });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.log(`任务 ${id.slice(0, 8)} 失败：${error}`);
      this.send({ type: 'result', id, ok: false, error });
    } finally {
      this.running.delete(id);
    }
  }
}
