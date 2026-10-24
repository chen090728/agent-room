// End-to-end suite run against both deployment targets (Node server and the
// Cloudflare Worker under `wrangler dev`). It only speaks HTTP + WebSocket.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';

export interface E2ETarget {
  baseUrl: string;
  token: string;
}

interface Socket {
  events: any[];
  waitFor(pred: (e: any) => boolean, timeoutMs?: number): Promise<any>;
  close(): void;
}

export function defineE2ESuite(name: string, target: () => E2ETarget) {
  const api = async (path: string, init: RequestInit = {}, token = target().token) => {
    const res = await fetch(`${target().baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
    });
    return { status: res.status, body: await res.json() };
  };

  const openSocket = (path: string, token = target().token): Promise<Socket> =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(target().baseUrl.replace(/^http/, 'ws') + path);
      const events: any[] = [];
      const waiters: { pred: (e: any) => boolean; resolve: (e: any) => void }[] = [];
      const socket: Socket = {
        events,
        waitFor: (pred, timeoutMs = 30000) => {
          const hit = events.find(pred);
          if (hit) return Promise.resolve(hit);
          return new Promise((res, rej) => {
            const timer = setTimeout(() => rej(new Error(`timed out waiting on ${path}`)), timeoutMs);
            waiters.push({ pred, resolve: (e) => (clearTimeout(timer), res(e)) });
          });
        },
        close: () => ws.close(),
      };
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
      ws.on('message', (raw) => {
        const e = JSON.parse(raw.toString());
        if (e.type === 'hello') return resolve(socket);
        events.push(e);
        for (const w of waiters.filter((w) => w.pred(e))) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(e);
        }
      });
      ws.on('close', (code) => reject(new Error(`closed ${code}`)));
      ws.on('error', reject);
    });

  /** Posts a message and waits until the relay it started has finished. */
  const sendAndSettle = async (groupId: string, content: string) => {
    const chat = await openSocket(`/ws/groups/${groupId}`);
    const sent = await api(`/api/groups/${groupId}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
    expect(sent.status).toBe(201);
    if (content.includes('@')) {
      await chat.waitFor((e) => e.type === 'relay' && e.relay.rootId === sent.body.id && !e.relay.active);
    }
    chat.close();
    return { sent: sent.body, events: chat.events };
  };

  const closeCode = (path: string, frame: string) =>
    new Promise<number>((resolve) => {
      const ws = new WebSocket(target().baseUrl.replace(/^http/, 'ws') + path);
      ws.on('open', () => ws.send(frame));
      ws.on('close', (code) => resolve(code));
    });

  describe(name, () => {
    it('reports health and rejects requests without the access token', async () => {
      const health = await api('/api/health', {}, '');
      expect(health).toEqual({ status: 200, body: { ok: true, name: 'AgentHub', configured: true } });
      expect((await api('/api/groups', {}, 'wrong-token-0000000000')).status).toBe(401);
    });

    const demoGroup = async () => (await api('/api/groups')).body.find((g: any) => g.name === '演示群');

    it('seeds a demo group and a direct chat per mock member', async () => {
      const { body: groups } = await api('/api/groups');
      expect(groups.map((g: any) => [g.kind, g.name]).sort()).toEqual([
        ['direct', '小橙'],
        ['direct', '小绿'],
        ['direct', '阿蓝'],
        ['group', '演示群'],
      ]);
      const demo = await demoGroup();
      expect(demo.members.map((m: any) => [m.name, m.type, m.role, m.avatar])).toEqual([
        ['小橙', 'mock', '产品经理', { shape: 'cloud', color: 'orange' }],
        ['阿蓝', 'mock', '安全顾问', { shape: 'square', color: 'blue' }],
        ['小绿', 'mock', '交互设计', { shape: 'egg', color: 'green' }],
      ]);
      const { body: messages } = await api(`/api/groups/${demo.id}/messages`);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toContain('@小橙 你好');
    });

    it('direct chats answer without an @', async () => {
      const { body: groups } = await api('/api/groups');
      const direct = groups.find((g: any) => g.kind === 'direct' && g.name === '小橙');
      const { events } = await sendAndSettle(direct.id, '你好呀');
      const replies = events.filter((e) => e.type === 'message' && e.message.senderKind === 'member').map((e) => e.message);
      expect(replies[0].senderName).toBe('小橙');
      expect(replies.every((m: any) => m.senderName === '小橙')).toBe(true);
    });

    it('acceptance: "@小橙 你好" gets a reply, and the relay stops within the limits', async () => {
      const groupId = (await demoGroup()).id;
      const list = await openSocket('/ws');

      const { sent, events } = await sendAndSettle(groupId, '@小橙 你好');

      const replies = events.filter((e) => e.type === 'message' && e.message.senderKind === 'member').map((e) => e.message);
      expect(replies[0].senderName).toBe('小橙');
      expect(replies[0].content).toContain('你好');
      expect(replies.length).toBeLessThanOrEqual(10);
      expect(Math.max(...replies.map((m: any) => m.hop))).toBeLessThanOrEqual(5);
      expect(events.some((e) => e.type === 'typing' && e.active)).toBe(true);

      // The list socket saw the relay running and then finishing.
      await list.waitFor((e) => e.type === 'group_updated' && e.group.relay === null && e.group.lastMessage?.rootId === sent.id);
      expect(list.events.some((e) => e.type === 'group_updated' && e.group.relay?.active)).toBe(true);
      list.close();

      const { body: history } = await api(`/api/groups/${groupId}/messages`);
      expect(history.map((m: any) => m.id)).toEqual(expect.arrayContaining(replies.map((m: any) => m.id)));
      const { body: after } = await api(`/api/groups/${groupId}`);
      expect(after.relay).toBeNull();
    });

    it('closes sockets that fail to authenticate', async () => {
      expect(await closeCode('/ws', JSON.stringify({ type: 'auth', token: 'nope' }))).toBe(4401);
      expect(await closeCode(`/ws/groups/${(await demoGroup()).id}`, 'not json')).toBe(4401);
    });

    it('creates an OpenAI-compatible member with an encrypted, masked key', async () => {
      const res = await api('/api/members', {
        method: 'POST',
        body: JSON.stringify({
          name: '小紫',
          type: 'openai-compatible',
          avatar: { shape: 'flower', color: 'purple' },
          role: '审查员',
          persona: '审查员',
          config: { baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'sk-test-abcdefgh', model: 'some-model' },
        }),
      });
      expect(res.status).toBe(201);
      expect(res.body.config).toEqual({ baseUrl: 'http://127.0.0.1:1/v1', model: 'some-model' });
      expect(res.body.secrets).toEqual({ apiKey: 'sk-…efgh' });
      expect(res.body.typeLabel).toBe('OpenAI 兼容接口');
      expect(res.body).toMatchObject({ role: '审查员', avatar: { shape: 'flower', color: 'purple' } });
      expect(JSON.stringify((await api('/api/members')).body)).not.toContain('sk-test-abcdefgh');

      const dup = await api('/api/members', {
        method: 'POST',
        body: JSON.stringify({ name: '小紫', type: 'mock', avatar: { shape: 'circle', color: 'red' } }),
      });
      expect(dup.status).toBe(409);
      const missing = await api('/api/members', {
        method: 'POST',
        body: JSON.stringify({ name: '小白', type: 'openai-compatible', avatar: { shape: 'circle', color: 'red' }, config: {} }),
      });
      expect(missing).toEqual({ status: 400, body: { error: '请填写接口地址' } });
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

      try {
        const member = await api('/api/members', {
          method: 'POST',
          body: JSON.stringify({
            name: '小青',
            type: 'openai-compatible',
            avatar: { shape: 'egg', color: 'green' },
            persona: '代码审查员',
            config: { baseUrl: `http://127.0.0.1:${port}/v1/`, apiKey: 'sk-live-xyz-123456', model: 'm1' },
          }),
        });
        const group = await api('/api/groups', {
          method: 'POST',
          body: JSON.stringify({ name: '审查群', memberIds: [member.body.id] }),
        });
        expect(group.status).toBe(201);
        const gid = group.body.id;
        await sendAndSettle(gid, '先说个背景');
        await sendAndSettle(gid, '@小青 帮我看看');

        expect(received.url).toBe('/v1/chat/completions');
        expect(received.auth).toBe('Bearer sk-live-xyz-123456');
        expect(received.body.model).toBe('m1');
        expect(received.body.messages.map((m: any) => m.role)).toEqual(['system', 'user']);
        expect(received.body.messages[1].content).toBe('用户: 先说个背景\n用户: @小青 帮我看看');

        const { body: msgs } = await api(`/api/groups/${gid}/messages`);
        expect(msgs.at(-1)).toMatchObject({ senderName: '小青', content: '看过了，没问题。', hop: 1 });
      } finally {
        fake.close();
      }
    });

    it('rejects unknown avatar shapes and colours, and deletes an assistant together with its direct chat', async () => {
      const bad = await api('/api/members', {
        method: 'POST',
        body: JSON.stringify({ name: '坏头像', type: 'mock', avatar: { shape: 'dragon', color: 'red' } }),
      });
      expect(bad.status).toBe(400);
      const made = await api('/api/members', {
        method: 'POST',
        body: JSON.stringify({ name: '临时工', type: 'mock', avatar: { shape: 'star', color: 'pink' }, role: '实习生' }),
      });
      expect(made.status).toBe(201);
      expect((await api('/api/groups')).body.some((g: any) => g.kind === 'direct' && g.name === '临时工')).toBe(true);
      expect((await api(`/api/members/${made.body.id}`, { method: 'DELETE' })).status).toBe(200);
      expect((await api('/api/groups')).body.some((g: any) => g.name === '临时工')).toBe(false);
      expect((await api(`/api/members/${made.body.id}`, { method: 'DELETE' })).status).toBe(404);
    });

    it('updates group membership and lists groups by recent activity', async () => {
      const { body: members } = await api('/api/members');
      const blue = members.find((m: any) => m.name === '阿蓝');
      const created = await api('/api/groups', { method: 'POST', body: JSON.stringify({ name: '空群' }) });
      const updated = await api(`/api/groups/${created.body.id}/members`, {
        method: 'PUT',
        body: JSON.stringify({ memberIds: [blue.id] }),
      });
      expect(updated.body.members.map((m: any) => m.name)).toEqual(['阿蓝']);
      expect((await api(`/api/groups/${created.body.id}/members`, { method: 'PUT', body: JSON.stringify({ memberIds: ['nope'] }) })).status).toBe(400);
      expect((await api('/api/groups/does-not-exist')).status).toBe(404);

      await sendAndSettle(created.body.id, '@阿蓝 在吗');
      const { body: groups } = await api('/api/groups');
      expect(groups[0].id).toBe(created.body.id);
    });
  });
}
