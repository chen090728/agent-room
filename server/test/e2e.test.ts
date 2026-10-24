import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildServer, type AgentHubServer } from '../src/server.js';
import { testConfig } from './helpers.js';

const config = testConfig();
let hub: AgentHubServer;
let base: string;

const api = async (path: string, init: RequestInit = {}, token = config.token) => {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  });
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
  hub = buildServer({ config, logger: false });
  await hub.app.listen({ host: '127.0.0.1', port: 0 });
  base = `http://127.0.0.1:${(hub.app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await hub.app.close();
});

describe('AgentHub server (no API keys)', () => {
  it('rejects requests without the access token', async () => {
    expect((await api('/api/groups', {}, 'wrong')).status).toBe(401);
    expect((await api('/api/health', {}, '')).status).toBe(200);
  });

  it('seeds a demo group with three mock members', async () => {
    const { body: groups } = await api('/api/groups');
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('演示群');
    expect(groups[0].members.map((m: any) => [m.name, m.type])).toEqual([
      ['小橙', 'mock'],
      ['阿蓝', 'mock'],
      ['小绿', 'mock'],
    ]);
  });

  it('acceptance: "@小橙 你好" gets a reply over WebSocket, and relays stop within limits', async () => {
    const { body: groups } = await api('/api/groups');
    const groupId = groups[0].id;

    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    const events: any[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: config.token })));
      ws.on('message', (raw) => {
        const e = JSON.parse(raw.toString());
        events.push(e);
        if (e.type === 'hello') resolve();
      });
      ws.on('error', reject);
    });

    const sent = await api(`/api/groups/${groupId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: '@小橙 你好' }),
    });
    expect(sent.status).toBe(201);
    await hub.coordinator.idle(groupId);
    // Let the last pushed events arrive before closing the socket.
    await new Promise<void>((resolve) => {
      const done = () => events.some((e) => e.type === 'relay' && !e.relay.active);
      if (done()) return resolve();
      ws.on('message', () => done() && resolve());
    });
    ws.close();

    const pushed = events.filter((e) => e.type === 'message').map((e) => e.message);
    const replies = pushed.filter((m) => m.senderKind === 'member');
    expect(replies[0].senderName).toBe('小橙');
    expect(replies[0].content).toContain('你好');
    expect(replies.length).toBeLessThanOrEqual(10);
    expect(Math.max(...replies.map((m: any) => m.hop))).toBeLessThanOrEqual(5);
    expect(events.some((e) => e.type === 'typing')).toBe(true);
    expect(events.filter((e) => e.type === 'relay').at(-1).relay.active).toBe(false);

    const { body: history } = await api(`/api/groups/${groupId}/messages`);
    expect(history.map((m: any) => m.id)).toEqual(expect.arrayContaining(pushed.map((m: any) => m.id)));
  });

  it('closes unauthenticated sockets', async () => {
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    const code = await new Promise<number>((resolve) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: 'nope' })));
      ws.on('close', (c) => resolve(c));
    });
    expect(code).toBe(4401);
  });

  it('creates an OpenAI-compatible member, encrypts and masks the key', async () => {
    const res = await api('/api/members', {
      method: 'POST',
      body: JSON.stringify({
        name: '小紫',
        type: 'openai-compatible',
        color: 'purple',
        persona: '审查员',
        config: { baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'sk-test-abcdefgh', model: 'some-model' },
      }),
    });
    expect(res.status).toBe(201);
    expect(res.body.config).toEqual({ baseUrl: 'http://127.0.0.1:1/v1', model: 'some-model' });
    expect(res.body.secrets).toEqual({ apiKey: 'sk-…efgh' });
    expect(JSON.stringify((await api('/api/members')).body)).not.toContain('sk-test-abcdefgh');

    expect((await api('/api/members', { method: 'POST', body: JSON.stringify({ ...res.body, name: '小紫' }) })).status).toBe(409);
    const missing = await api('/api/members', {
      method: 'POST',
      body: JSON.stringify({ name: '小白', type: 'openai-compatible', color: 'red', config: {} }),
    });
    expect(missing.status).toBe(400);
  });

  it('talks to an OpenAI-compatible endpoint with merged, labelled context', async () => {
    let received: any;
    const fake = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        received = { url: req.url, auth: req.headers.authorization, body: JSON.parse(data) };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: '小青: 看过了，没问题。' } }] }));
      });
    });
    await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
    const port = (fake.address() as AddressInfo).port;

    const member = await api('/api/members', {
      method: 'POST',
      body: JSON.stringify({
        name: '小青',
        type: 'openai-compatible',
        color: 'green',
        persona: '代码审查员',
        config: { baseUrl: `http://127.0.0.1:${port}/v1/`, apiKey: 'sk-live-xyz-123456', model: 'm1' },
      }),
    });
    const group = await api('/api/groups', {
      method: 'POST',
      body: JSON.stringify({ name: '审查群', memberIds: [member.body.id] }),
    });
    const gid = group.body.id;
    await api(`/api/groups/${gid}/messages`, { method: 'POST', body: JSON.stringify({ content: '先说个背景' }) });
    await api(`/api/groups/${gid}/messages`, { method: 'POST', body: JSON.stringify({ content: '@小青 帮我看看' }) });
    await hub.coordinator.idle(gid);
    fake.close();

    expect(received.url).toBe('/v1/chat/completions');
    expect(received.auth).toBe('Bearer sk-live-xyz-123456');
    expect(received.body.model).toBe('m1');
    expect(received.body.messages.map((m: any) => m.role)).toEqual(['system', 'user']);
    expect(received.body.messages[1].content).toBe('用户: 先说个背景\n用户: @小青 帮我看看');

    const { body: msgs } = await api(`/api/groups/${gid}/messages`);
    expect(msgs.at(-1)).toMatchObject({ senderName: '小青', content: '看过了，没问题。', hop: 1 });
  });
});
