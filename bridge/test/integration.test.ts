// The real bridge client against the real Node server: pairing, connecting and a job end to end.
import { rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHub, type Hub } from '../../server/src/hub.js';
import { BridgeClient } from '../src/client.js';
import { pairWithServer } from '../src/pair.js';
import { detectTools } from '../src/runner.js';
import { makeFakeTools } from './fake-tools.js';

const TOKEN = 'test-token-0123456789';
let hub: Hub;
let baseUrl = '';
const tools = makeFakeTools();
const filesDir = join(tmpdir(), `agenthub-bridge-it-${process.pid}`);

const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...init.headers } });
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
  hub = await createHub(
    {
      host: '127.0.0.1',
      port: 0,
      token: TOKEN,
      secret: 'test-secret-0123456789',
      dbPath: ':memory:',
      filesDir,
      maxHops: 5,
      maxReplies: 10,
      contextSize: 30,
      llmTimeoutMs: 5000,
      userDisplayName: '用户',
      mockDelayMs: [0, 0],
      bridgeTimeoutMs: 20_000,
    },
    { log: false },
  );
  await new Promise<void>((r) => hub.server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(hub.server.address() as AddressInfo).port}`;
});

afterAll(() => {
  hub.server.closeAllConnections();
  hub.server.close();
  rmSync(filesDir, { recursive: true, force: true });
  rmSync(tools.dir, { recursive: true, force: true });
});

describe('bridge against the server', () => {
  it('pairs with a code, connects, and answers a chat message with the local tool', async () => {
    const member = await api('/api/members', {
      method: 'POST',
      body: JSON.stringify({ name: '工人', type: 'bridge', avatar: { shape: 'hexagon', color: 'black' }, role: '', config: { tool: 'codex', write: 'false' } }),
    });
    const code = (await api(`/api/members/${member.body.id}/pairing`, { method: 'POST' })).body.code;

    const available = await detectTools(tools.bins);
    const paired = await pairWithServer({ server: baseUrl, code, tools: available, name: '测试电脑' });
    expect(paired).toMatchObject({ memberName: '工人', tool: 'codex' });

    const client = new BridgeClient(paired.config, { bins: tools.bins, workdir: tmpdir(), timeoutMs: 10_000, allowWrite: false, maxJobs: 1, tools: available });
    client.start();
    try {
      for (let i = 0; i < 100 && !(await api(`/api/members/${member.body.id}/bridge`)).body.online; i++) await new Promise((r) => setTimeout(r, 50));
      expect((await api(`/api/members/${member.body.id}/bridge`)).body).toMatchObject({ paired: true, online: true, name: '测试电脑', tools: ['claude', 'codex'] });

      const direct = (await api('/api/groups')).body.find((g: any) => g.kind === 'direct' && g.name === '工人');
      const sent = await api(`/api/groups/${direct.id}/messages`, { method: 'POST', body: JSON.stringify({ content: '帮我看看 README' }) });
      await hub.idle(direct.id);
      const messages = (await api(`/api/groups/${direct.id}/messages`)).body;
      const reply = messages.find((m: any) => m.senderName === '工人');
      expect(sent.status).toBe(201);
      expect(reply.content).toContain('codex answers:');
      // The tool got the chat, was started read-only in the work directory.
      const call = tools.calls('codex').at(-1)!;
      expect(call.stdin).toContain('用户: 帮我看看 README');
      expect(call.args.slice(0, 3)).toEqual(['exec', '--sandbox', 'read-only']);
    } finally {
      client.stop();
    }
  });
});
