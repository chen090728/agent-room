import { describe, expect, it } from 'vitest';
import { createMockAdapter } from '../src/adapters/mock.js';
import { AdapterRegistry } from '../src/adapters/registry.js';
import type { MemberAdapter, ReplyContext } from '../src/adapters/types.js';
import { Coordinator } from '../src/coordinator.js';
import { createGitHubIntegration } from '../src/integrations/github.js';
import { IntegrationRegistry } from '../src/integrations/registry.js';
import { SecretBox } from '../src/crypto.js';
import { SqlDirectory } from '../src/directory.js';
import { SqlRoom } from '../src/room.js';
import type { ChatEvent, ListEvent, RelayState } from '../src/types.js';
import { FAKE_REPO, FAKE_TOKEN, startFakeGitHub } from './fake-github.js';
import { memoryDriver } from './sqlite.js';

const limits = { maxHops: 5, maxReplies: 10, contextSize: 30, llmTimeoutMs: 5000, userDisplayName: '用户' };

/** Scripted adapter: each member answers with the text its script returns. */
function scripted(script: (ctx: ReplyContext) => string): MemberAdapter {
  return { type: 'script', label: 'script', description: '', fields: [], reply: async (ctx) => script(ctx) };
}

async function setup(adapter: MemberAdapter, names = ['甲', '乙', '丙']) {
  const db = memoryDriver();
  const listEvents: ListEvent[] = [];
  const directory = new SqlDirectory(db, new SecretBox('s'.repeat(20)), (e) => listEvents.push(e));
  const room = new SqlRoom(db);
  const ids: string[] = [];
  for (const name of names) {
    const r = await directory.createMember({ name, type: adapter.type, avatar: { shape: 'cloud', color: 'blue' }, role: '', persona: '', config: {}, secrets: {} });
    if (r.ok) ids.push(r.value.id);
  }
  const created = await directory.createGroup('群', ids);
  if (!created.ok) throw new Error(created.error);
  const group = created.value;
  const events: ChatEvent[] = [];
  const integrations = new IntegrationRegistry().register(createGitHubIntegration());
  const coordinator = new Coordinator(room, directory, new AdapterRegistry().register(adapter), integrations, (e) => events.push(e), limits);
  const send = async (text: string) => {
    await coordinator.postUserMessage(group.id, text);
    let steps = 0;
    while (await coordinator.step(group.id)) steps++;
    return { msgs: room.recentMessages(group.id, 200), steps };
  };
  return { directory, room, group, events, listEvents, send, coordinator };
}

describe('Coordinator', () => {
  it('only mentioned members reply', async () => {
    const { send } = await setup(scripted(() => '好的'));
    const { msgs } = await send('@乙 在吗');
    expect(msgs.map((m) => [m.senderName, m.hop])).toEqual([
      ['用户', 0],
      ['乙', 1],
    ]);
  });

  it('does nothing without a mention', async () => {
    const { send } = await setup(scripted(() => '好的'));
    const { msgs, steps } = await send('大家好');
    expect(msgs).toHaveLength(1);
    expect(steps).toBe(0);
  });

  it('forwards mentions and stops after 5 hops', async () => {
    // 甲 -> 乙 -> 丙 -> 甲 ... forever, unless stopped.
    const next: Record<string, string> = { 甲: '乙', 乙: '丙', 丙: '甲' };
    const { send, events, directory, group } = await setup(scripted((ctx) => `收到 @${next[ctx.self.name]}`));
    const { msgs } = await send('@甲 开始');
    const replies = msgs.filter((m) => m.senderKind === 'member');
    expect(replies.map((m) => m.hop)).toEqual([1, 2, 3, 4, 5]);
    expect(replies.map((m) => m.senderName)).toEqual(['甲', '乙', '丙', '甲', '乙']);
    expect(msgs.at(-1)!.senderKind).toBe('system');
    expect(msgs.at(-1)!.content).toContain('5 轮');
    expect(new Set(msgs.map((m) => m.rootId)).size).toBe(1);

    const relays = events.filter((e) => e.type === 'relay').map((e) => (e as { relay: RelayState }).relay);
    expect(relays.at(-1)).toMatchObject({ active: false, hop: 5, replies: 5 });
    // The group list sees the finished relay and the last message.
    const summary = (await directory.getGroup(group.id))!;
    expect(summary.relay).toBeNull();
    expect(summary.lastMessage!.content).toContain('5 轮');
  });

  it('caps the total number of replies per original message at 10', async () => {
    // Everyone mentions both others: the chain fans out quickly.
    const { send } = await setup(
      scripted((ctx) =>
        ctx.others
          .filter((o) => !o.isHuman)
          .map((o) => `@${o.name}`)
          .join(' '),
      ),
    );
    const { msgs } = await send('@甲 @乙 @丙 开始');
    const replies = msgs.filter((m) => m.senderKind === 'member');
    expect(replies).toHaveLength(10);
    expect(Math.max(...replies.map((m) => m.hop))).toBeLessThanOrEqual(5);
    expect(msgs.at(-1)!.content).toContain('10 次回复');
  });

  it('processes chains one after another, never interleaved', async () => {
    const { coordinator, room, group } = await setup(scripted((ctx) => (ctx.self.name === '甲' ? '@乙 接着' : '好')));
    await coordinator.postUserMessage(group.id, '@甲 第一件事');
    await coordinator.step(group.id); // 甲 answers the first message, queues 乙
    await coordinator.postUserMessage(group.id, '@丙 第二件事');
    while (await coordinator.step(group.id));
    expect(room.recentMessages(group.id, 50).map((m) => `${m.senderName}:${m.content}`)).toEqual([
      '用户:@甲 第一件事',
      '甲:@乙 接着',
      '用户:@丙 第二件事',
      '乙:好',
      '丙:好',
    ]);
  });

  it('ignores self-mentions and strips the own-name prefix', async () => {
    const { send } = await setup(scripted((ctx) => `${ctx.self.name}: 我自己 @${ctx.self.name}`));
    const { msgs } = await send('@甲 hi');
    expect(msgs.map((m) => m.content)).toEqual(['@甲 hi', '我自己 @甲']);
  });

  it('sends recent history with speakers and the member roster', async () => {
    const contexts: ReplyContext[] = [];
    const { send } = await setup(
      scripted((ctx) => {
        contexts.push(ctx);
        return 'ok';
      }),
    );
    await send('第一句');
    await send('@丙 第二句');
    const ctx = contexts[0];
    expect(ctx.self.name).toBe('丙');
    expect(ctx.others.map((o) => o.name)).toEqual(['用户', '甲', '乙']);
    expect(ctx.history.map((h) => `${h.senderName}:${h.content}`)).toEqual(['用户:第一句', '用户:@丙 第二句']);
  });

  it('limits context to the last 30 messages', async () => {
    const contexts: ReplyContext[] = [];
    const { send } = await setup(
      scripted((ctx) => {
        contexts.push(ctx);
        return 'ok';
      }),
    );
    for (let i = 0; i < 40; i++) await send(`消息${i}`);
    await send('@甲 总结');
    expect(contexts[0].history).toHaveLength(30);
    expect(contexts[0].history.at(-1)!.content).toBe('@甲 总结');
  });

  it('reports adapter errors in the chat and keeps going', async () => {
    const { send } = await setup(
      scripted((ctx) => {
        if (ctx.self.name === '甲') throw new Error('boom');
        return 'fine';
      }),
    );
    const { msgs } = await send('@甲 @乙 hi');
    expect(msgs.map((m) => [m.senderKind, m.content])).toEqual([
      ['user', '@甲 @乙 hi'],
      ['system', '甲 回复失败：boom'],
      ['member', 'fine'],
    ]);
  });

  it('emits list events for group activity', async () => {
    const { send, listEvents } = await setup(scripted(() => 'ok'));
    await send('@甲 hi');
    const updates = listEvents.filter((e) => e.type === 'group_updated');
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.some((e) => e.type === 'group_updated' && e.group.relay?.active)).toBe(true);
  });
});

describe('mock members', () => {
  it('@ each other and stop automatically after 5 hops', async () => {
    // random() = 0: always hand over, always to the first candidate.
    const { send } = await setup(createMockAdapter({ random: () => 0 }), ['小橙', '阿蓝', '小绿']);
    const { msgs } = await send('@小橙 你好');
    const replies = msgs.filter((m) => m.senderKind === 'member');
    expect(replies[0].content).toMatch(/^你好呀！我是小橙，很高兴认识你。 @阿蓝/);
    expect(replies.map((m) => m.senderName)).toEqual(['小橙', '阿蓝', '小橙', '阿蓝', '小橙']);
    expect(msgs.at(-1)!.content).toBe('已达到 5 轮传递上限，自动停止。');
  });
});

describe('SqlDirectory', () => {
  it('encrypts secrets, stores only masked previews in plain text, and rejects duplicate names', async () => {
    const db = memoryDriver();
    const dir = new SqlDirectory(db, new SecretBox('x'.repeat(20)));
    const r = await dir.createMember({
      name: '小紫',
      type: 'openai-compatible',
      avatar: { shape: 'flower', color: 'purple' },
      role: '',
      persona: '',
      config: { model: 'm' },
      secrets: { apiKey: 'sk-test-abcdefgh' },
    });
    expect(r.ok && r.value.secretPreview).toEqual({ apiKey: 'sk-…efgh' });
    const raw = db.all<Record<string, unknown>>('SELECT * FROM members');
    expect(JSON.stringify(raw)).not.toContain('sk-test-abcdefgh');
    expect(await dir.getMemberSecrets(r.ok ? r.value.id : '')).toEqual({ apiKey: 'sk-test-abcdefgh' });
    const dup = await dir.createMember({ name: '小紫', type: 'mock', avatar: { shape: 'circle', color: 'red' }, role: '', persona: '', config: {}, secrets: {} });
    expect(dup).toEqual({ ok: false, error: '已经有叫「小紫」的成员了' });
  });
});

describe('crash recovery', () => {
  it('retries a reply interrupted mid-step once, then skips it', async () => {
    let calls = 0;
    const { coordinator, room, group } = await setup(
      scripted(() => {
        calls++;
        return '好的';
      }),
    );
    await coordinator.postUserMessage(group.id, '@甲 hi');
    // Simulate a host that died while the reply was being generated.
    const task = room.nextTask(group.id)!;
    room.markAttempt(task.seq);
    while (await coordinator.step(group.id));
    expect(calls).toBe(1);
    expect(room.recentMessages(group.id, 10).map((m) => m.content)).toEqual(['@甲 hi', '好的']);

    await coordinator.postUserMessage(group.id, '@乙 hi');
    const again = room.nextTask(group.id)!;
    room.markAttempt(again.seq);
    room.markAttempt(again.seq);
    while (await coordinator.step(group.id));
    expect(calls).toBe(1);
    expect(room.recentMessages(group.id, 10).at(-1)!.content).toBe('乙 的回复被中断，已跳过。');
  });
});


describe('direct chats', () => {
  const memberInput = (name: string) => ({
    name,
    type: 'script',
    avatar: { shape: 'cloud' as const, color: 'orange' as const },
    role: '测试',
    persona: '',
    config: {},
    secrets: {},
  });

  it('creates a one-to-one chat for every new member, and routes messages without @', async () => {
    const { directory, room, coordinator } = await setup(scripted((ctx) => `你说：${ctx.trigger.content}`));
    const created = await directory.createMember(memberInput('小直'));
    expect(created.ok).toBe(true);
    const direct = (await directory.listGroups()).find((g) => g.kind === 'direct' && g.name === '小直')!;
    expect(direct.members.map((m) => m.name)).toEqual(['小直']);
    expect(direct.members[0]).toMatchObject({ avatar: { shape: 'cloud', color: 'orange' }, role: '测试' });

    await coordinator.postUserMessage(direct.id, '在吗');
    while (await coordinator.step(direct.id));
    expect(room.recentMessages(direct.id, 10).map((m) => `${m.senderName}:${m.content}`)).toEqual(['用户:在吗', '小直:你说：在吗']);
  });

  it('still needs an @ in a normal group', async () => {
    const { send } = await setup(scripted(() => 'ok'));
    const { msgs } = await send('没有点名');
    expect(msgs).toHaveLength(1);
  });

  it('does not let a direct chat change its members, and deleting the member removes the chat', async () => {
    const { directory } = await setup(scripted(() => 'ok'));
    const created = await directory.createMember(memberInput('小删'));
    const id = created.ok ? created.value.id : '';
    const direct = (await directory.listGroups()).find((g) => g.name === '小删')!;
    expect(await directory.setGroupMembers(direct.id, [])).toEqual({ ok: false, error: '单聊的成员不能修改' });
    expect(await directory.deleteMember(id)).toBe(true);
    expect((await directory.listGroups()).some((g) => g.name === '小删')).toBe(false);
    expect(await directory.getGroup(direct.id)).toBeNull();
  });

  it('tracks who is thinking while a reply is being written', async () => {
    const { send, events } = await setup(scripted(() => '好'));
    await send('@甲 hi');
    const relays = events.filter((e) => e.type === 'relay').map((e) => (e as { relay: RelayState }).relay);
    expect(relays.some((r) => r.thinking === '甲')).toBe(true);
    expect(relays.at(-1)!.thinking).toBeNull();
  });
});

describe('database migration', () => {
  it('upgrades a database from the first release and gives existing members a direct chat', async () => {
    const db = memoryDriver();
    // The schema of the first release.
    db.run(`CREATE TABLE members (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, type TEXT NOT NULL, color TEXT NOT NULL,
      persona TEXT NOT NULL DEFAULT '', config_json TEXT NOT NULL DEFAULT '{}', secrets_enc TEXT,
      secret_preview_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL)`);
    db.run(`CREATE TABLE groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, last_message_json TEXT,
      last_activity_at INTEGER NOT NULL, relay_json TEXT)`);
    db.run(`CREATE TABLE group_members (group_id TEXT NOT NULL, member_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (group_id, member_id))`);
    db.run(`INSERT INTO members (id, name, type, color, persona, created_at) VALUES ('m1', '小橙', 'mock', 'orange', '', 1), ('m2', '阿蓝', 'mock', 'blue', '', 2), ('m3', '小灰', 'mock', 'graphite', '', 3)`);
    db.run(`INSERT INTO groups (id, name, created_at, last_activity_at) VALUES ('g1', '演示群', 1, 1)`);
    db.run(`INSERT INTO group_members (group_id, member_id, position) VALUES ('g1', 'm1', 0), ('g1', 'm2', 1)`);

    const dir = new SqlDirectory(db, new SecretBox('x'.repeat(20)));
    const members = await dir.listMembers();
    expect(members.map((m) => [m.name, m.avatar.shape, m.avatar.color, m.role])).toEqual([
      ['小橙', 'cloud', 'orange', '产品经理'],
      ['阿蓝', 'square', 'blue', '安全顾问'],
      ['小灰', 'hexagon', 'gray', ''],
    ]);
    const groups = await dir.listGroups();
    expect(groups.find((g) => g.id === 'g1')).toMatchObject({ kind: 'group' });
    expect(groups.filter((g) => g.kind === 'direct').map((g) => g.name).sort()).toEqual(['小橙', '小灰', '阿蓝']);
    // Running again changes nothing.
    new SqlDirectory(db, null);
    expect((await dir.listGroups()).length).toBe(4);
  });
});


describe('repository tools and confirmation cards', () => {
  it('gives bound conversations GitHub tools, attaches the pull request card, and merges only on the user\'s action', async () => {
    const gh = await startFakeGitHub();
    try {
      let toolNames: string[] = [];
      const { directory, room, group, coordinator, events } = await setup(
        scripted((ctx) => {
          toolNames = ctx.tools?.tools.map((t) => t.name) ?? [];
          if (ctx.tools) {
            // The scripted "model" is synchronous in this helper, so open the PR through the tool directly.
            ctx.tools.cards.push({
              type: 'pull_request',
              integrationId: 'placeholder',
              repo: FAKE_REPO,
              number: 1,
              title: 't',
              url: 'u',
              branch: 'b',
              base: 'main',
              files: [],
              additions: 0,
              deletions: 0,
              state: 'open',
            });
          }
          return ctx.tools ? '已提交。' : '没有工具';
        }),
      );
      expect(toolNames).toEqual([]);

      // Unbound: no tools, no cards.
      await coordinator.postUserMessage(group.id, '@甲 看看');
      while (await coordinator.step(group.id));
      expect(toolNames).toEqual([]);
      expect(room.recentMessages(group.id, 10).at(-1)!.card).toBeNull();

      // Bind a repository through a stored connection.
      const created = await directory.createIntegration({
        type: 'github',
        typeLabel: 'GitHub',
        name: 'GitHub · octocat',
        config: { apiBaseUrl: gh.url, account: 'octocat' },
        secrets: { token: FAKE_TOKEN },
      });
      expect(created.ok).toBe(true);
      const integrationId = created.ok ? created.value.id : '';
      expect(await directory.setBinding(group.id, { repo: { integrationId, repo: FAKE_REPO } })).toMatchObject({ ok: true });
      expect(JSON.stringify(await directory.listIntegrations())).not.toContain(FAKE_TOKEN);

      await coordinator.postUserMessage(group.id, '@甲 改一下');
      while (await coordinator.step(group.id));
      expect(toolNames).toEqual(['list_directory', 'read_file', 'create_pull_request']);
      const reply = room.recentMessages(group.id, 10).at(-1)!;
      expect(reply.content).toBe('已提交。');
      expect(reply.card).toMatchObject({ type: 'pull_request', state: 'open' });
      expect((await directory.getGroup(group.id))!.lastMessage!.card).toMatchObject({ state: 'open' });
      expect(events.some((e) => e.type === 'message' && e.message.card)).toBe(true);

      // The fake card above has no real PR behind it, so a merge attempt is reported, not swallowed.
      await expect(coordinator.cardAction(group.id, reply.id, 'merge')).rejects.toThrow();
      await expect(coordinator.cardAction(group.id, 'nope', 'merge')).rejects.toMatchObject({ status: 404 });
    } finally {
      await gh.close();
    }
  });

  it('deleting the connection removes the binding', async () => {
    const { directory, group } = await setup(scripted(() => 'ok'));
    const created = await directory.createIntegration({ type: 'github', typeLabel: 'GitHub', name: 'g', config: {}, secrets: { token: 'github_pat_x_0123456789' } });
    const id = created.ok ? created.value.id : '';
    await directory.setBinding(group.id, { repo: { integrationId: id, repo: 'a/b' } });
    expect((await directory.getGroup(group.id))!.binding).not.toBeNull();
    expect(await directory.deleteIntegration(id)).toBe(true);
    expect((await directory.getGroup(group.id))!.binding).toBeNull();
    expect(await directory.setBinding(group.id, { repo: { integrationId: 'missing', repo: 'a/b' } })).toEqual({ ok: false, error: '这个连接不存在' });
  });
});
