import { describe, expect, it } from 'vitest';
import type { ReplyContext } from '../src/adapters/types.js';
import { buildChatMessages, stripSelfPrefix } from '../src/context.js';
import { maskSecret, SecretBox } from '../src/crypto.js';
import { parseMentions } from '../src/mentions.js';

describe('parseMentions', () => {
  const names = ['小橙', '阿蓝', '小橙子', 'Bob'];

  it('finds mentions in order, longest name first, without duplicates', () => {
    expect(parseMentions('@阿蓝 你好 @小橙子 还有 @阿蓝', names)).toEqual(['阿蓝', '小橙子']);
  });

  it('accepts full-width @ and ignores case', () => {
    expect(parseMentions('＠小橙 和 @bob', names)).toEqual(['小橙', 'Bob']);
  });

  it('ignores unknown names and bare @', () => {
    expect(parseMentions('@某人 @ 小橙 a@b.com', names)).toEqual([]);
  });
});

describe('stripSelfPrefix', () => {
  it('removes "name:" style prefixes', () => {
    expect(stripSelfPrefix('小橙: 你好', '小橙')).toBe('你好');
    expect(stripSelfPrefix('小橙：你好', '小橙')).toBe('你好');
    expect(stripSelfPrefix('【小橙】你好', '小橙')).toBe('你好');
    expect(stripSelfPrefix('[小橙]: 小橙: 你好', '小橙')).toBe('你好');
  });

  it('keeps sentences that merely start with the name', () => {
    expect(stripSelfPrefix('小橙觉得可以', '小橙')).toBe('小橙觉得可以');
    expect(stripSelfPrefix('阿蓝: 你好', '小橙')).toBe('阿蓝: 你好');
  });
});

describe('buildChatMessages', () => {
  const base: Omit<ReplyContext, 'history' | 'trigger'> = {
    groupName: '测试群',
    self: { id: 'a', name: '小橙', persona: '产品经理' },
    others: [
      { name: '用户', persona: '', isHuman: true },
      { name: '阿蓝', persona: '工程师', isHuman: false },
    ],
    signal: new AbortController().signal,
  };

  it('labels speakers, maps own messages to assistant and merges adjacent user messages', () => {
    const history = [
      { id: '1', senderKind: 'user' as const, senderName: '用户', isSelf: false, content: '大家好' },
      { id: '2', senderKind: 'member' as const, senderName: '阿蓝', isSelf: false, content: '你好' },
      { id: '3', senderKind: 'member' as const, senderName: '小橙', isSelf: true, content: '我在' },
      { id: '4', senderKind: 'user' as const, senderName: '用户', isSelf: false, content: '@小橙 说说' },
    ];
    const out = buildChatMessages({ ...base, history, trigger: history[3] });
    expect(out.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(out[1].content).toBe('用户: 大家好\n阿蓝: 你好');
    expect(out[2].content).toBe('我在');
    expect(out[3].content).toBe('用户: @小橙 说说');
    expect(out[0].content).toContain('阿蓝');
    expect(out[0].content).toContain('@名字');
  });

  it('starts with a user message when history begins with the member itself', () => {
    const history = [
      { id: '1', senderKind: 'member' as const, senderName: '小橙', isSelf: true, content: '早' },
      { id: '2', senderKind: 'user' as const, senderName: '用户', isSelf: false, content: '@小橙 hi' },
    ];
    const out = buildChatMessages({ ...base, history, trigger: history[1] });
    expect(out.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  });
});

describe('SecretBox', () => {
  it('round-trips and rejects a different secret', () => {
    const sealed = new SecretBox('secret-one-0123456789').encrypt('sk-test-123');
    expect(sealed).not.toContain('sk-test');
    expect(new SecretBox('secret-one-0123456789').decrypt(sealed)).toBe('sk-test-123');
    expect(() => new SecretBox('secret-two-0123456789').decrypt(sealed)).toThrow(/AGENTHUB_SECRET/);
  });

  it('masks secrets', () => {
    expect(maskSecret('sk-abcdefghijkl')).toBe('sk-…ijkl');
  });
});
