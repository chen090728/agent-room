import { describe, expect, it } from 'vitest';
import { createMockAdapter } from '../src/adapters/mock.js';
import { AdapterRegistry } from '../src/adapters/registry.js';
import type { MemberAdapter, ReplyContext } from '../src/adapters/types.js';
import { Coordinator } from '../src/coordinator.js';
import { SecretBox } from '../src/crypto.js';
import { SqlDirectory } from '../src/directory.js';
import { SqlRoom } from '../src/room.js';
import type { ChatEvent, ListEvent, RelayState } from '../src/types.js';
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
    const r = await directory.createMember({ name, type: adapter.type, color: 'blue', persona: '', config: {}, secrets: {} });
    if (r.ok) ids.push(r.value.id);
  }
  const created = await directory.createGroup('群', ids);
  if (!created.ok) throw new Error(created.error);
  const group = created.value;
  const events: ChatEvent[] = [];
  const coordinator = new Coordinator(room, directory, new AdapterRegistry().register(adapter), (e) => events.push(e), limits);
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
      color: 'purple',
      persona: '',
      config: { model: 'm' },
      secrets: { apiKey: 'sk-test-abcdefgh' },
    });
    expect(r.ok && r.value.secretPreview).toEqual({ apiKey: 'sk-…efgh' });
    const raw = db.all<Record<string, unknown>>('SELECT * FROM members');
    expect(JSON.stringify(raw)).not.toContain('sk-test-abcdefgh');
    expect(await dir.getMemberSecrets(r.ok ? r.value.id : '')).toEqual({ apiKey: 'sk-test-abcdefgh' });
    const dup = await dir.createMember({ name: '小紫', type: 'mock', color: 'red', persona: '', config: {}, secrets: {} });
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
