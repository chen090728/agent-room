import { describe, expect, it } from 'vitest';
import { createMockAdapter, parsePool } from '../src/adapters/mock.js';
import type { ReplyContext } from '../src/adapters/types.js';
import { WELCOME_MESSAGE, WELCOME_NOTICE, relayFailed, relayHopLimit } from '../src/copy.js';
import { SqlDirectory } from '../src/directory.js';
import { explicitLanguage, languageFromExtra } from '../src/locale.js';
import { SqlRoom } from '../src/room.js';
import { seedIfEmpty } from '../src/seed.js';
import { memoryDriver } from './sqlite.js';

describe('request language', () => {
  it('reads Accept-Language and socket lang, and leaves old clients on Chinese', () => {
    expect(explicitLanguage(null)).toBeUndefined();
    expect(explicitLanguage('')).toBeUndefined();
    expect(explicitLanguage('*')).toBeUndefined();
    expect(explicitLanguage('*;q=0.8')).toBeUndefined();
    expect(explicitLanguage('zh-CN,zh;q=0.9')).toBe('zh');
    expect(explicitLanguage('en-US,en;q=0.8')).toBe('en');
    expect(explicitLanguage('fr')).toBe('en');
    expect(languageFromExtra({ lang: 'en' })).toBe('en');
    expect(languageFromExtra({ lang: 'zh' })).toBe('zh');
    expect(languageFromExtra({ lang: 'system' })).toBeUndefined();
    expect(languageFromExtra(undefined)).toBeUndefined();
  });
});

describe('demo copy', () => {
  it('keeps an old replies array for every language and picks a pack otherwise', () => {
    expect(parsePool(JSON.stringify(['只此一句']), 'en')).toEqual(['只此一句']);
    expect(parsePool(JSON.stringify({ zh: ['中'], en: ['En'] }), 'en')).toEqual(['En']);
    expect(parsePool(JSON.stringify({ zh: ['中'] }), 'en')).toEqual(['中']);
    expect(parsePool('nope', 'zh')).toBeUndefined();
  });

  it('answers in the request language and keeps member names', async () => {
    const adapter = createMockAdapter({ random: () => 0 });
    const reply = (language: 'zh' | 'en', content: string, replies?: string) =>
      adapter.reply(context(language, content), { replies: replies ?? '', mentionRate: '0', personaI18n: JSON.stringify({ en: 'A calm engineer, focused on safety.' }) });

    expect(await reply('zh', '你好')).toBe('你好呀！我是阿蓝，冷静的工程师。');
    expect(await reply('en', 'hello')).toBe("Hi, I'm 阿蓝, A calm engineer.");
    expect(await reply('en', 'status', JSON.stringify(['自定义一句']))).toBe('自定义一句');
    expect(await reply('en', 'status', JSON.stringify({ zh: ['中文池'], en: ['English pool'] }))).toBe('English pool');
  });

  it('seeds Chinese welcome text with a notice code, and English roles beside the Chinese columns', async () => {
    const db = memoryDriver();
    const directory = new SqlDirectory(db, null);
    const room = new SqlRoom(db);
    const seeded = await seedIfEmpty(directory, async (groupId, content, notice) => room.addMessage({ groupId, senderKind: 'system', senderId: null, senderName: '系统', content, notice }));
    expect(seeded).toBe(true);
    const group = (await directory.listGroups()).find((g) => g.name === '演示群')!;
    expect(group.members.map((m) => m.name)).toEqual(['小橙', '阿蓝', '小绿']);
    const welcome = room.recentMessages(group.id, 10)[0];
    expect(welcome.content).toBe(WELCOME_MESSAGE);
    expect(welcome.notice).toEqual(WELCOME_NOTICE);
    const orange = (await directory.listMembers()).find((m) => m.name === '小橙')!;
    expect(orange.role).toBe('产品经理');
    expect(JSON.parse(orange.config.roleI18n).en).toBe('Product manager');
    expect(JSON.parse(orange.config.replies).en[0]).toContain('smallest version');
    expect(Array.isArray(JSON.parse(orange.config.replies))).toBe(false);
  });
});

describe('notice codes', () => {
  it('keeps the Chinese sentence and a code', () => {
    expect(relayHopLimit(5)).toEqual({
      content: '已达到 5 轮传递上限，自动停止。',
      notice: { code: 'relay.hopLimit', params: { maxHops: 5 } },
    });
    expect(relayFailed('甲', '请求超时', 'relay.timeout')).toEqual({
      content: '甲 回复失败：请求超时',
      notice: { code: 'relay.failed', params: { name: '甲', reasonCode: 'relay.timeout' } },
    });
    expect(relayFailed('甲', 'boom').notice).toEqual({ code: 'relay.failed', params: { name: '甲', detail: 'boom' } });
  });
});

function context(language: 'zh' | 'en', content: string): ReplyContext {
  return {
    groupName: '演示群',
    self: { id: 'me', name: '阿蓝', persona: '冷静的工程师，关注安全和可行性，说话简洁。' },
    others: [],
    history: [],
    trigger: { senderKind: 'user', senderName: '用户', isSelf: false, content },
    supportsImages: false,
    signal: AbortSignal.timeout(1000),
    language,
  };
}
