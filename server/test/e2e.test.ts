import { defineE2ESuite } from '@agenthub/core/testing';
import { rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import type { Config } from '../src/config.js';
import { createHub, type Hub } from '../src/hub.js';

const config: Config = {
  host: '127.0.0.1',
  port: 0,
  token: 'test-token-0123456789',
  secret: 'test-secret-0123456789',
  dbPath: ':memory:',
  filesDir: join(tmpdir(), `agenthub-test-files-${process.pid}`),
  maxHops: 5,
  maxReplies: 10,
  contextSize: 30,
  llmTimeoutMs: 5000,
  userDisplayName: '用户',
  mockDelayMs: [0, 0],
  deployPollMs: 300,
  bridgeTimeoutMs: 20_000,
};

let hub: Hub;
let baseUrl = '';

beforeAll(async () => {
  hub = await createHub(config, { log: false });
  await new Promise<void>((r) => hub.server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(hub.server.address() as AddressInfo).port}`;
});

afterAll(() => {
  hub.server.closeAllConnections();
  hub.server.close();
  rmSync(config.filesDir, { recursive: true, force: true });
});

defineE2ESuite('Node server (no API keys)', () => ({ baseUrl, token: config.token }));
