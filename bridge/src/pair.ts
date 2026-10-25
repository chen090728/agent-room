import { hostname } from 'node:os';
import { normalizeServer, type BridgeConfig } from './config.js';

export interface PairResult {
  config: BridgeConfig;
  memberName: string;
  tool: string;
}

/**
 * Trades the pairing code from the App for credentials. If this computer is
 * already paired with the same server, its credentials are sent along so it
 * stays one bridge serving several work assistants.
 */
export async function pairWithServer(opts: {
  server: string;
  code: string;
  tools: string[];
  name?: string;
  existing?: BridgeConfig | null;
  fetchImpl?: typeof fetch;
}): Promise<PairResult> {
  const server = normalizeServer(opts.server);
  const doFetch = opts.fetchImpl ?? fetch;
  const same = opts.existing && opts.existing.server === server ? opts.existing : null;
  let res: Response;
  try {
    res = await doFetch(`${server}/api/bridge/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: opts.code, name: opts.name ?? hostname(), tools: opts.tools, bridgeId: same?.bridgeId, token: same?.token }),
    });
  } catch (err) {
    throw new Error(`连不上服务器 ${server}：${err instanceof Error ? err.message : err}`);
  }
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `配对失败（${res.status}）`);
  return { config: { server, bridgeId: body.bridgeId, token: body.token }, memberName: body.memberName, tool: body.tool };
}
