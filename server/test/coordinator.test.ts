import { describe, expect, it } from 'vitest';
import { createMockAdapter } from '../src/adapters/mock.js';
import { AdapterRegistry } from '../src/adapters/registry.js';
import type { MemberAdapter, ReplyContext } from '../src/adapters/types.js';
import { Coordinator, type ServerEvent } from '../src/coordinator.js';
import { SecretBox } from '../src/crypto.js';
import { Repo } from '../src/db/repo.js';
import { openDatabase } from '../src/db/schema.js';
import type { RelayState } from '../src/types.js';
import { testConfig } from './helpers.js';

/** Scripted adapter: each member answers with the text its script returns. */
function scripted(script: (ctx: ReplyContext) => string): MemberAdapter {
  return { type: 'script', label: 'script', description: '', fields: [], reply: async (ctx) => script(ctx) };
}

function setup(script: (ctx: ReplyContext) => string, names = ['甲', '乙', '丙']) {
  const repo = new Repo(openDatabase(':memory:'), new SecretBox('s'.repeat(20)));
  const members = names.map((name) =>
    repo.createMember({ name, type: 'script', color: 'blue', persona: '', config: {}, secrets: {} }),
  );
  const group = repo.createGroup('群', members.map((m) => m.id));
  const events: ServerEvent[] = [];
  const contexts: ReplyContext[] = [];
  const registry = new AdapterRegistry().register(
    scripted((ctx) => {
      contexts.push(ctx);
      return script(ctx);
    }),
  );
  const coordinator = new Coordinator(repo, registry, (e) => events.push(e), testConfig());
  const send = async (text: string) => {
    coordinator.postUserMessage(group.id, text);
    await coordinator.idle(group.id);
    return repo.recentMessages(group.id, 200);
  };
  return { repo, group, events, contexts, send };
}

describe('Coordinator', () => {
  it('only mentioned members reply', async () => {
    const { send } = setup(() => '好的');
    const msgs = await send('@乙 在吗');
    expect(msgs.map((m) => [m.senderName, m.hop])).toEqual([
      ['用户', 0],
      ['乙', 1],
    ]);
  });

  it('does nothing without a mention', async () => {
    const { send } = setup(() => '好的');
    expect(await send('大家好')).toHaveLength(1);
  });

  it('forwards mentions and stops after 5 hops', async () => {
    // 甲 -> 乙 -> 丙 -> 甲 ... forever, unless stopped.
    const next: Record<string, string> = { 甲: '乙', 乙: '丙', 丙: '甲' };
    const { send, events } = setup((ctx) => `收到 @${next[ctx.self.name]}`);
    const msgs = await send('@甲 开始');
    const replies = msgs.filter((m) => m.senderKind === 'member');
    expect(replies.map((m) => m.hop)).toEqual([1, 2, 3, 4, 5]);
    expect(replies.map((m) => m.senderName)).toEqual(['甲', '乙', '丙', '甲', '乙']);
    expect(msgs.at(-1)!.senderKind).toBe('system');
    expect(msgs.at(-1)!.content).toContain('5 轮');
    expect(new Set(msgs.map((m) => m.rootId)).size).toBe(1);

    const relays = events.filter((e) => e.type === 'relay').map((e) => (e as { relay: RelayState }).relay);
    expect(relays.at(-1)).toMatchObject({ active: false, hop: 5, replies: 5 });
  });

  it('caps the total number of replies per original message at 10', async () => {
    // Everyone mentions both others: the chain fans out quickly.
    const { send } = setup((ctx) =>
      ctx.others
        .filter((o) => !o.isHuman)
        .map((o) => `@${o.name}`)
        .join(' '),
    );
    const msgs = await send('@甲 @乙 @丙 开始');
    const replies = msgs.filter((m) => m.senderKind === 'member');
    expect(replies).toHaveLength(10);
    expect(Math.max(...replies.map((m) => m.hop))).toBeLessThanOrEqual(5);
    expect(msgs.at(-1)!.content).toContain('10 次回复');
  });

  it('ignores self-mentions and strips the own-name prefix', async () => {
    const { send } = setup((ctx) => `${ctx.self.name}: 我自己 @${ctx.self.name}`);
    const msgs = await send('@甲 hi');
    expect(msgs.map((m) => m.content)).toEqual(['@甲 hi', '我自己 @甲']);
  });

  it('sends recent history with speakers and the member roster', async () => {
    const { send, contexts } = setup(() => 'ok');
    await send('第一句');
    await send('@丙 第二句');
    const ctx = contexts[0];
    expect(ctx.self.name).toBe('丙');
    expect(ctx.others.map((o) => o.name)).toEqual(['用户', '甲', '乙']);
    expect(ctx.history.map((h) => `${h.senderName}:${h.content}`)).toEqual(['用户:第一句', '用户:@丙 第二句']);
  });

  it('limits context to the last 30 messages', async () => {
    const { send, contexts } = setup(() => 'ok');
    for (let i = 0; i < 40; i++) await send(`消息${i}`);
    await send('@甲 总结');
    expect(contexts[0].history).toHaveLength(30);
    expect(contexts[0].history.at(-1)!.content).toBe('@甲 总结');
  });

  it('reports adapter errors in the chat and keeps going', async () => {
    const { send } = setup((ctx) => {
      if (ctx.self.name === '甲') throw new Error('boom');
      return 'fine';
    });
    const msgs = await send('@甲 @乙 hi');
    expect(msgs.map((m) => [m.senderKind, m.content])).toEqual([
      ['user', '@甲 @乙 hi'],
      ['system', '甲 回复失败：boom'],
      ['member', 'fine'],
    ]);
  });
});

describe('mock members', () => {
  it('@ each other and stop automatically after 5 hops', async () => {
    const repo = new Repo(openDatabase(':memory:'), new SecretBox('s'.repeat(20)));
    const ids = ['小橙', '阿蓝', '小绿'].map(
      (name) => repo.createMember({ name, type: 'mock', color: 'orange', persona: '测试', config: {}, secrets: {} }).id,
    );
    const group = repo.createGroup('演示', ids);
    // random() = 0: always hand over, always to the first candidate.
    const registry = new AdapterRegistry().register(createMockAdapter({ random: () => 0 }));
    const coordinator = new Coordinator(repo, registry, () => {}, testConfig());
    coordinator.postUserMessage(group.id, '@小橙 你好');
    await coordinator.idle(group.id);

    const msgs = repo.recentMessages(group.id, 100);
    const replies = msgs.filter((m) => m.senderKind === 'member');
    expect(replies[0].content).toMatch(/^你好呀！我是小橙，测试。 @阿蓝/);
    expect(replies.map((m) => m.senderName)).toEqual(['小橙', '阿蓝', '小橙', '阿蓝', '小橙']);
    expect(msgs.at(-1)!.content).toBe('已达到 5 轮传递上限，自动停止。');
  });
});
