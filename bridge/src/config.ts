import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** What pairing gives this computer; kept in a file only the current user can read. */
export interface BridgeConfig {
  server: string;
  bridgeId: string;
  token: string;
}

export const defaultConfigPath = () => process.env.AGENTHUB_BRIDGE_CONFIG || join(homedir(), '.agenthub-bridge', 'config.json');

export function loadConfig(path: string): BridgeConfig | null {
  if (!existsSync(path)) return null;
  try {
    const c = JSON.parse(readFileSync(path, 'utf8'));
    return typeof c.server === 'string' && typeof c.bridgeId === 'string' && typeof c.token === 'string' ? c : null;
  } catch {
    return null;
  }
}

export function saveConfig(path: string, config: BridgeConfig) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600); // also when the file already existed with looser permissions
  } catch {
    // Not supported on this file system (e.g. Windows).
  }
}

/** http(s) address of the server without a trailing slash; throws a readable error otherwise. */
export function normalizeServer(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`服务器地址不对：${input}。要写成 https://… 开头的完整网址`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('服务器地址要以 http:// 或 https:// 开头');
  return url.origin + url.pathname.replace(/\/+$/, '');
}
