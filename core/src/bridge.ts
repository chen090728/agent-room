import { UserError } from './types.js';

/** Coding tools a bridge can run on the user's own computer. */
export const BRIDGE_TOOLS: Record<string, string> = { claude: 'Claude Code', codex: 'Codex' };

/** Work for a bridge: one prompt for one tool. */
export interface BridgeJob {
  tool: string;
  prompt: string;
  /** Whether the tool may change files in the working directory (the bridge still has the last word). */
  write: boolean;
}

/** What the coordinator and the work-assistant adapter see of the bridges. */
export interface BridgeGateway {
  /** Runs a job on a bridge and resolves with the tool's answer. */
  run(bridgeId: string, job: BridgeJob): Promise<string>;
}

/*
 * WebSocket protocol of /ws/bridge. The bridge connects out to the server and
 * sends {"type":"auth","bridgeId","token"} first; the server answers
 * {"type":"hello"}. After that:
 *   bridge -> server  {"type":"tools","tools":["claude","codex"]}      what is installed
 *                     {"type":"result","id","ok":true,"text"}          a finished job
 *                     {"type":"result","id","ok":false,"error"}        a failed job
 *   server -> bridge  {"type":"job","id","tool","prompt","write"}
 *                     {"type":"cancel","id"}
 */

/** The credentials in a bridge's first frame, or null when the frame is not a valid auth message. */
export function parseBridgeAuth(frame: string): { bridgeId: string; token: string } | null {
  try {
    const p = JSON.parse(frame);
    if (p?.type === 'auth' && typeof p.bridgeId === 'string' && typeof p.token === 'string') return { bridgeId: p.bridgeId, token: p.token };
  } catch {
    // Not JSON.
  }
  return null;
}

/** Tools a bridge reports, limited to the ones AgentHub knows. */
export function knownTools(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((t): t is string => typeof t === 'string' && t in BRIDGE_TOOLS) : [];
}

interface Pending {
  bridgeId: string;
  resolve(text: string): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface DispatcherHost {
  /** Sends a frame to the bridge; false when it is not connected. */
  send(bridgeId: string, data: string): boolean;
  isOnline(bridgeId: string): boolean;
  /** Called with the tools a bridge reports when it connects. */
  onTools?(bridgeId: string, tools: string[]): void;
}

/**
 * Hands jobs to connected bridges and matches their answers. It knows nothing
 * about sockets: the host (Node server or Durable Object) supplies `send` and
 * feeds incoming frames to `handleFrame`.
 */
export class BridgeDispatcher implements BridgeGateway {
  private pending = new Map<string, Pending>();

  constructor(
    private host: DispatcherHost,
    private timeoutMs: number,
  ) {}

  isOnline(bridgeId: string): boolean {
    return this.host.isOnline(bridgeId);
  }

  run(bridgeId: string, job: BridgeJob): Promise<string> {
    if (!this.host.isOnline(bridgeId)) {
      return Promise.reject(new UserError('这台电脑上的 bridge 没有连接。请在电脑上运行 agenthub-bridge run', 503));
    }
    const id = crypto.randomUUID();
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.host.send(bridgeId, JSON.stringify({ type: 'cancel', id }));
        reject(new Error(`等了 ${Math.round(this.timeoutMs / 60000)} 分钟还没有结果，已放弃`));
      }, this.timeoutMs);
      this.pending.set(id, { bridgeId, resolve, reject, timer });
      if (!this.host.send(bridgeId, JSON.stringify({ type: 'job', id, tool: job.tool, prompt: job.prompt, write: job.write }))) {
        this.settle(id)?.reject(new UserError('这台电脑上的 bridge 没有连接。请在电脑上运行 agenthub-bridge run', 503));
      }
    });
  }

  /** Handles a frame from an authenticated bridge. */
  handleFrame(bridgeId: string, raw: string) {
    let frame: any;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if (frame?.type === 'tools') this.host.onTools?.(bridgeId, knownTools(frame.tools));
    if (frame?.type !== 'result' || typeof frame.id !== 'string') return;
    // Only the bridge a job was sent to may answer it.
    if (this.pending.get(frame.id)?.bridgeId !== bridgeId) return;
    const pending = this.settle(frame.id)!;
    if (frame.ok === true && typeof frame.text === 'string') pending.resolve(frame.text);
    else pending.reject(new Error(typeof frame.error === 'string' && frame.error ? frame.error : '本机工具运行失败'));
  }

  /** The bridge went away: jobs it was running cannot finish. */
  dropBridge(bridgeId: string) {
    for (const [id, p] of [...this.pending]) {
      if (p.bridgeId === bridgeId) this.settle(id)!.reject(new Error('bridge 在工作时断开了连接'));
    }
  }

  private settle(id: string): Pending | undefined {
    const p = this.pending.get(id);
    if (!p) return undefined;
    clearTimeout(p.timer);
    this.pending.delete(id);
    return p;
  }
}
