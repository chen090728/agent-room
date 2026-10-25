// End-to-end suite run against both deployment targets (Node server and the
// Cloudflare Worker under `wrangler dev`). It only speaks HTTP + WebSocket.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { FAKE_REPO, FAKE_TOKEN, startFakeGitHub } from './fake-github.js';
import { makePdf, TINY_PNG } from './pdf.js';

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
  const sendAndSettle = async (groupId: string, content: string, expectReply = content.includes('@')) => {
    const chat = await openSocket(`/ws/groups/${groupId}`);
    const sent = await api(`/api/groups/${groupId}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
    expect(sent.status).toBe(201);
    if (expectReply) {
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
      const { events } = await sendAndSettle(direct.id, '你好呀', true);
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

    describe('GitHub connection', () => {
      const llmServers: Server[] = [];

      /** A scripted model: reads README.md, then opens a PR that appends a line, then reports back. */
      const startRepoLlm = async () => {
        const server = createServer((req, res) => {
          let data = '';
          req.on('data', (c) => (data += c));
          req.on('end', () => {
            const body = JSON.parse(data);
            const toolMessages = body.messages.filter((m: any) => m.role === 'tool');
            const call = (name: string, args: unknown) => ({
              content: null,
              tool_calls: [{ id: `call-${toolMessages.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }],
            });
            let message: any;
            if (!body.tools) message = { content: '这个对话没有绑定仓库。' };
            else if (toolMessages.length === 0) message = call('read_file', { path: 'README.md' });
            else if (toolMessages.length === 1) {
              message = call('create_pull_request', {
                title: 'Add greeting',
                description: '在 README 里加一行问候',
                files: [{ path: 'README.md', content: `${toolMessages[0].content}Hello from the assistant\n` }],
              });
            } else message = { content: '我提交了一个修改，请确认。' };
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ choices: [{ message }] }));
          });
        });
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
        llmServers.push(server);
        return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
      };

      it('connects a token, binds a repository, lets an assistant open a PR, and merges only on the user\'s tap', async () => {
        const gh = await startFakeGitHub();
        try {
          // 1. Connect GitHub: a wrong token is refused, the right one is stored masked.
          const wrong = await api('/api/integrations', { method: 'POST', body: JSON.stringify({ type: 'github', config: { token: 'github_pat_wrong_000000', apiBaseUrl: gh.url } }) });
          expect(wrong).toEqual({ status: 400, body: { error: '令牌无效或已过期' } });
          expect((await api('/api/integrations', { method: 'POST', body: JSON.stringify({ type: 'github', config: { apiBaseUrl: gh.url } }) })).status).toBe(400);

          const created = await api('/api/integrations', { method: 'POST', body: JSON.stringify({ type: 'github', config: { token: FAKE_TOKEN, apiBaseUrl: gh.url } }) });
          expect(created.status).toBe(201);
          expect(created.body).toMatchObject({ type: 'github', typeLabel: 'GitHub', name: 'GitHub · octocat', config: { account: 'octocat' } });
          expect(created.body.secrets.token).toMatch(/^git….{4}$/);
          expect(JSON.stringify((await api('/api/integrations')).body)).not.toContain(FAKE_TOKEN);
          const types = (await api('/api/integrations/types')).body;
          expect(types.map((t: any) => t.type)).toEqual(['github']);
          expect(types[0].fields.find((f: any) => f.key === 'token')).toMatchObject({ secret: true, required: true });
          const resources = await api(`/api/integrations/${created.body.id}/resources`);
          expect(resources.body.map((r: any) => r.id)).toEqual([FAKE_REPO]);

          // 2. An assistant with a (scripted) model, and a direct chat bound to the repository.
          const baseUrl = await startRepoLlm();
          const member = await api('/api/members', {
            method: 'POST',
            body: JSON.stringify({
              name: '代码员',
              type: 'openai-compatible',
              avatar: { shape: 'hexagon', color: 'black' },
              role: '工程师',
              config: { baseUrl, apiKey: 'sk-test-coder-1234', model: 'coder' },
            }),
          });
          const groups = (await api('/api/groups')).body;
          const direct = groups.find((g: any) => g.kind === 'direct' && g.name === '代码员');
          expect(direct.binding).toBeNull();

          expect((await api(`/api/groups/${direct.id}/binding`, { method: 'PUT', body: JSON.stringify({ repo: { integrationId: 'nope', repo: FAKE_REPO } }) })).status).toBe(400);
          expect((await api(`/api/groups/${direct.id}/binding`, { method: 'PUT', body: JSON.stringify({ repo: { integrationId: created.body.id, repo: 'bad name' } }) })).status).toBe(400);
          const bound = await api(`/api/groups/${direct.id}/binding`, { method: 'PUT', body: JSON.stringify({ repo: { integrationId: created.body.id, repo: FAKE_REPO } }) });
          expect(bound.body.binding).toEqual({ repo: { integrationId: created.body.id, repo: FAKE_REPO } });

          // 3. Ask for a change; the reply carries a confirmation card and nothing is merged yet.
          const chat = await openSocket(`/ws/groups/${direct.id}`);
          const sent = await api(`/api/groups/${direct.id}/messages`, { method: 'POST', body: JSON.stringify({ content: '给 README 加一行问候' }) });
          await chat.waitFor((e) => e.type === 'relay' && e.relay.rootId === sent.body.id && !e.relay.active);
          const withCard = chat.events.find((e) => e.type === 'message' && e.message.card)!.message;
          expect(withCard).toMatchObject({ senderName: '代码员', content: '我提交了一个修改，请确认。' });
          expect(withCard.card).toMatchObject({
            type: 'pull_request',
            repo: FAKE_REPO,
            number: 1,
            title: 'Add greeting',
            state: 'open',
            files: [{ path: 'README.md', status: 'modified', additions: 1, deletions: 0 }],
            additions: 1,
            deletions: 0,
          });
          expect(gh.files('main')['README.md']).toBe('# Hello\n');
          expect(gh.pulls[0].state).toBe('open');
          const listed = (await api('/api/groups')).body.find((g: any) => g.id === direct.id);
          expect(listed.lastMessage.card.state).toBe('open');

          // 4. The user taps "同意合并".
          const merged = await api(`/api/groups/${direct.id}/messages/${withCard.id}/card`, { method: 'POST', body: JSON.stringify({ action: 'merge' }) });
          expect(merged.status).toBe(200);
          expect(merged.body.card.state).toBe('merged');
          const updated = await chat.waitFor((e) => e.type === 'message_updated' && e.message.id === withCard.id);
          expect(updated.message.card.state).toBe('merged');
          expect(gh.files('main')['README.md']).toBe('# Hello\nHello from the assistant\n');
          expect((await api(`/api/groups/${direct.id}/messages`)).body.find((m: any) => m.id === withCard.id).card.state).toBe('merged');

          // 5. A second change is rejected instead; a failed merge shows on the card and can be retried.
          const before = chat.events.length;
          const sent2 = await api(`/api/groups/${direct.id}/messages`, { method: 'POST', body: JSON.stringify({ content: '再改一次' }) });
          await chat.waitFor((e) => e.type === 'relay' && e.relay.rootId === sent2.body.id && !e.relay.active);
          const second = chat.events.slice(before).find((e) => e.type === 'message' && e.message.card)!.message;
          expect(second.card.number).toBe(2);
          gh.failNextMerge();
          const failed = await api(`/api/groups/${direct.id}/messages/${second.id}/card`, { method: 'POST', body: JSON.stringify({ action: 'merge' }) });
          expect(failed.body.card).toMatchObject({ state: 'failed' });
          expect(failed.body.card.error).toContain('无法合并');
          const rejected = await api(`/api/groups/${direct.id}/messages/${second.id}/card`, { method: 'POST', body: JSON.stringify({ action: 'reject' }) });
          expect(rejected.body.card.state).toBe('closed');

          // 6. Bad card requests.
          expect((await api(`/api/groups/${direct.id}/messages/does-not-exist/card`, { method: 'POST', body: JSON.stringify({ action: 'merge' }) })).status).toBe(404);
          expect((await api(`/api/groups/${direct.id}/messages/${withCard.id}/card`, { method: 'POST', body: JSON.stringify({ action: 'delete' }) })).status).toBe(400);
          chat.close();

          // 7. An unbound conversation gets no tools; deleting the connection clears the binding.
          expect((await api(`/api/members/${member.body.id}`, { method: 'GET' })).status).toBe(404);
          expect((await api(`/api/integrations/${created.body.id}`, { method: 'DELETE' })).status).toBe(200);
          expect((await api('/api/groups')).body.find((g: any) => g.id === direct.id).binding).toBeNull();
          expect((await api(`/api/integrations/${created.body.id}`, { method: 'DELETE' })).status).toBe(404);
          const afterUnbind = await sendAndSettle(direct.id, '看看代码', true);
          expect(afterUnbind.events.find((e) => e.type === 'message' && e.message.senderKind === 'member')!.message.content).toBe('这个对话没有绑定仓库。');
        } finally {
          await gh.close();
          llmServers.forEach((srv) => srv.close());
        }
      });
    });

    describe('files', () => {
      const servers: Server[] = [];
      const upload = (groupId: string, name: string, type: string, body: Uint8Array | string, token = target().token) =>
        fetch(`${target().baseUrl}/api/groups/${groupId}/uploads`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) },
          body: body as BodyInit,
        });

      const startLlm = async (bodies: any[]) => {
        const server = createServer((req, res) => {
          let data = '';
          req.on('data', (c) => (data += c));
          req.on('end', () => {
            bodies.push(JSON.parse(data));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ choices: [{ message: { content: '看到了这些文件。' } }] }));
          });
        });
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
        servers.push(server);
        return `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
      };

      it('uploads, serves and signs files, and sends images, text and PDF text to the model', async () => {
        const bodies: any[] = [];
        const baseUrl = await startLlm(bodies);
        const member = await api('/api/members', {
          method: 'POST',
          body: JSON.stringify({
            name: '读图员',
            type: 'openai-compatible',
            avatar: { shape: 'egg', color: 'teal' },
            config: { baseUrl, apiKey: 'sk-test-reader-1234', model: 'reader' },
          }),
        });
        expect(member.status).toBe(201);
        const direct = (await api('/api/groups')).body.find((g: any) => g.kind === 'direct' && g.name === '读图员');

        // Upload an image, a text file and a PDF.
        const png = await upload(direct.id, '猫.png', 'image/png', TINY_PNG);
        const txt = await upload(direct.id, 'notes.txt', 'text/plain', '第一行\n第二行');
        const pdf = await upload(direct.id, 'report.pdf', 'application/pdf', makePdf('Hello PDF world'));
        expect([png.status, txt.status, pdf.status]).toEqual([201, 201, 201]);
        const [a, b, c] = [await png.json(), await txt.json(), await pdf.json()];
        expect([a, b, c].map((x) => [x.name, x.kind, x.mime])).toEqual([
          ['猫.png', 'image', 'image/png'],
          ['notes.txt', 'text', 'text/plain'],
          ['report.pdf', 'pdf', 'application/pdf'],
        ]);
        expect(a.size).toBe(TINY_PNG.length);

        // Download needs the token and is served safely.
        const url = (f: any) => `${target().baseUrl}/api/groups/${direct.id}/files/${f.id}`;
        expect((await fetch(url(a))).status).toBe(401);
        const got = await fetch(url(a), { headers: { Authorization: `Bearer ${target().token}` } });
        expect(got.status).toBe(200);
        expect(got.headers.get('content-type')).toBe('image/png');
        expect(got.headers.get('x-content-type-options')).toBe('nosniff');
        expect(new Uint8Array(await got.arrayBuffer())).toEqual(TINY_PNG);
        const text = await fetch(url(b), { headers: { Authorization: `Bearer ${target().token}` } });
        expect(text.headers.get('content-type')).toBe('text/plain; charset=utf-8');
        expect(await text.text()).toBe('第一行\n第二行');

        // A signed link works without the token; tampering or the wrong file does not.
        const link = await api(`/api/groups/${direct.id}/files/${a.id}/link`, { method: 'POST' });
        expect(link.status).toBe(200);
        const signed = await fetch(`${target().baseUrl}${link.body.path}`);
        expect(signed.status).toBe(200);
        expect(new Uint8Array(await signed.arrayBuffer())).toEqual(TINY_PNG);
        const tampered = link.body.path.replace(/sig=(.)/, (_m: string, c: string) => `sig=${c === '0' ? '1' : '0'}`);
        expect((await fetch(`${target().baseUrl}${tampered}`)).status).toBe(403);
        expect((await fetch(`${target().baseUrl}${link.body.path.replace(a.id, b.id)}`)).status).toBe(403);
        expect((await fetch(`${target().baseUrl}/api/f/${direct.id}/${a.id}`)).status).toBe(403);

        // Send them: the model gets the image, the text file's content and the PDF's text.
        const chat = await openSocket(`/ws/groups/${direct.id}`);
        const sent = await api(`/api/groups/${direct.id}/messages`, { method: 'POST', body: JSON.stringify({ content: '看看这几个', attachments: [a.id, b.id, c.id] }) });
        expect(sent.status).toBe(201);
        expect(sent.body.attachments.map((x: any) => x.name)).toEqual(['猫.png', 'notes.txt', 'report.pdf']);
        await chat.waitFor((e) => e.type === 'relay' && e.relay.rootId === sent.body.id && !e.relay.active);
        chat.close();

        const userMessage = bodies.at(-1).messages.at(-1);
        expect(userMessage.role).toBe('user');
        const parts: any[] = userMessage.content;
        const joined = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
        expect(joined).toContain('【文件：notes.txt】');
        expect(joined).toContain('第一行\n第二行');
        expect(joined).toContain('Hello PDF world');
        const image = parts.find((p) => p.type === 'image_url');
        expect(image.image_url.url).toBe(`data:image/png;base64,${Buffer.from(TINY_PNG).toString('base64')}`);

        // History keeps the attachments, and a file can be sent only once.
        const history = (await api(`/api/groups/${direct.id}/messages`)).body;
        expect(history.find((m: any) => m.id === sent.body.id).attachments).toHaveLength(3);
        const again = await api(`/api/groups/${direct.id}/messages`, { method: 'POST', body: JSON.stringify({ content: 'x', attachments: [a.id] }) });
        expect(again.status).toBe(409);
        expect((await api(`/api/groups/${direct.id}/messages`, { method: 'POST', body: JSON.stringify({ content: '', attachments: [] }) })).status).toBe(400);
        expect((await api(`/api/groups/${direct.id}/messages`, { method: 'POST', body: JSON.stringify({ content: 'x', attachments: ['nope'] }) })).status).toBe(404);
        servers.forEach((srv) => srv.close());
      });

      it('lets a mock assistant acknowledge a file sent without any text', async () => {
        const direct = (await api('/api/groups')).body.find((g: any) => g.kind === 'direct' && g.name === '小橙');
        const up = await (await upload(direct.id, 'todo.md', 'text/markdown', '# todo')).json();
        const chat = await openSocket(`/ws/groups/${direct.id}`);
        const sent = await api(`/api/groups/${direct.id}/messages`, { method: 'POST', body: JSON.stringify({ attachments: [up.id] }) });
        expect(sent.status).toBe(201);
        expect(sent.body.content).toBe('');
        const reply = await chat.waitFor((e) => e.type === 'message' && e.message.senderKind === 'member');
        expect(reply.message.content).toContain('收到你发的文件：todo.md');
        chat.close();
      });

      it('refuses bad uploads with clear errors', async () => {
        const direct = (await api('/api/groups')).body.find((g: any) => g.kind === 'direct' && g.name === '小橙');
        const err = async (res: Response) => ({ status: res.status, error: (await res.json()).error });
        expect(await err(await upload(direct.id, 'x.zip', 'application/zip', 'PK'))).toMatchObject({ status: 415 });
        expect(await err(await upload(direct.id, 'logo.svg', 'image/svg+xml', '<svg/>'))).toMatchObject({ status: 415 });
        expect(await err(await upload(direct.id, 'empty.txt', 'text/plain', ''))).toEqual({ status: 400, error: '文件是空的' });
        expect(await err(await upload(direct.id, 'big.txt', 'text/plain', new Uint8Array(10 * 1024 * 1024 + 1)))).toMatchObject({ status: 413 });
        expect((await upload('does-not-exist', 'a.txt', 'text/plain', 'a')).status).toBe(404);
        expect((await upload(direct.id, 'a.txt', 'text/plain', 'a', 'wrong-token-0000000000')).status).toBe(401);
        expect((await api(`/api/groups/${direct.id}/files/does-not-exist`)).status).toBe(404);
      });
    });
  });
}
