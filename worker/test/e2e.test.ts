// Runs the shared end-to-end suite against the Worker under `wrangler dev`
// (local workerd with real Durable Objects; no Cloudflare account needed).
import { defineE2ESuite } from '@agenthub/core/testing';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll } from 'vitest';

const token = 'test-token-0123456789';
let baseUrl = '';
let wrangler: ChildProcess;
let persistDir = '';

const freePort = () =>
  new Promise<number>((resolve) => {
    const srv = createServer().listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      srv.close(() => resolve(port));
    });
  });

beforeAll(async () => {
  const port = await freePort();
  persistDir = mkdtempSync(join(tmpdir(), 'agenthub-wrangler-'));
  baseUrl = `http://127.0.0.1:${port}`;
  wrangler = spawn(
    'npx',
    [
      'wrangler', 'dev', '--local',
      '--ip', '127.0.0.1',
      '--port', String(port),
      '--inspector-port', String(await freePort()),
      '--persist-to', persistDir,
      '--show-interactive-dev-session=false',
      '--var', `AGENTHUB_TOKEN:${token}`,
      '--var', 'AGENTHUB_SECRET:test-secret-0123456789',
      '--var', 'MOCK_DELAY_MS:0',
    ],
    {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  wrangler.stdout!.on('data', (d) => (output += d));
  wrangler.stderr!.on('data', (d) => (output += d));

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (wrangler.exitCode !== null) throw new Error(`wrangler dev exited early:\n${output}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev did not start:\n${output}`);
}, 120_000);

afterAll(() => {
  wrangler?.kill('SIGTERM');
  rmSync(persistDir, { recursive: true, force: true });
});

defineE2ESuite('Cloudflare Worker + Durable Objects (wrangler dev)', () => ({ baseUrl, token }));
