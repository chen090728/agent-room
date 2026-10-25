import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKEN = 'test-token-0123456789';

const freePort = () =>
  new Promise<number>((resolve) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });

export interface Wrangler {
  baseUrl: string;
  stop(): void;
}

/**
 * Starts `wrangler dev` (local workerd with real Durable Objects, no account
 * needed). With `r2`, the generated config adds the file bucket, like the
 * deploy workflow does when R2 is available.
 */
export async function startWrangler({ r2 }: { r2: boolean }): Promise<Wrangler> {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const port = await freePort();
  const persistDir = mkdtempSync(join(tmpdir(), 'agenthub-wrangler-'));
  const config = r2 ? '.wrangler-test.jsonc' : 'wrangler.jsonc';
  if (r2) execFileSync('node', ['scripts/make-config.mjs', config, 'agenthub-test'], { cwd: root, stdio: 'ignore' });

  const child: ChildProcess = spawn(
    'npx',
    [
      'wrangler', 'dev', '--local', '-c', config,
      '--ip', '127.0.0.1',
      '--port', String(port),
      '--inspector-port', String(await freePort()),
      '--persist-to', persistDir,
      '--show-interactive-dev-session=false',
      '--var', `AGENTHUB_TOKEN:${TOKEN}`,
      '--var', 'AGENTHUB_SECRET:test-secret-0123456789',
      '--var', 'MOCK_DELAY_MS:0',
    ],
    { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout!.on('data', (d) => (output += d));
  child.stderr!.on('data', (d) => (output += d));

  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = () => {
    child.kill('SIGTERM');
    rmSync(persistDir, { recursive: true, force: true });
  };
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited early:\n${output}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return { baseUrl, stop };
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error(`wrangler dev did not start:\n${output}`);
}
