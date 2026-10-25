import { describe, expect, it } from 'vitest';
import { createBridgeAdapter } from '../src/adapters/bridge.js';
import { AdapterRegistry } from '../src/adapters/registry.js';
import type { ReplyContext } from '../src/adapters/types.js';
import { BridgeDispatcher, knownTools, parseBridgeAuth, type BridgeGateway, type BridgeJob } from '../src/bridge.js';
import { Coordinator } from '../src/coordinator.js';
import { SecretBox } from '../src/crypto.js';
import { buildBridgePrompt } from '../src/context.js';
import { SqlDirectory } from '../src/directory.js';
import { MemoryFileStore } from '../src/files.js';
import { IntegrationRegistry } from '../src/integrations/registry.js';
import { SqlRoom } from '../src/room.js';
import { memoryDriver } from './sqlite.js';

const limits = { maxHops: 5, maxReplies: 10, contextSize: 30, llmTimeoutMs: 5000, userDisplayName: '用户' };

describe('BridgeDispatcher', () => {
  function setup(timeoutMs = 5000) {
    const sent: any[] = [];
    const online = new Set(['b1']);
    const toolReports: [string, string[]][] = [];
    const dispatcher = new BridgeDispatcher(
      {
        send: (id, data) => (online.has(id) ? (sent.push([id, JSON.parse(data)]), true) : false),
        isOnline: (id) => online.has(id),
        onTools: (id, tools) => toolReports.push([id, tools]),
      },
      timeoutMs,
    );
    return { dispatcher, sent, online, toolReports };
  }
  const job: BridgeJob = { tool: 'claude', prompt: 'hi', write: false };

  it('sends a job and resolves with the bridge\'s answer', async () => {
    const { dispatcher, sent } = setup();
    const pending = dispatcher.run('b1', job);
    expect(sent[0][1]).toMatchObject({ type: 'job', tool: 'claude', prompt: 'hi', write: false });
    dispatcher.handleFrame('b1', JSON.stringify({ type: 'result', id: sent[0][1].id, ok: true, text: '答案' }));
    expect(await pending).toBe('答案');
  });

  it('rejects at once when the bridge is offline', async () => {
    const { dispatcher } = setup();
    await expect(dispatcher.run('nobody', job)).rejects.toMatchObject({ status: 503, message: expect.stringContaining('没有连接') });
  });

  it('turns a failed job into an error with the bridge\'s message', async () => {
    const { dispatcher, sent } = setup();
    const pending = dispatcher.run('b1', job);
    dispatcher.handleFrame('b1', JSON.stringify({ type: 'result', id: sent[0][1].id, ok: false, error: 'claude 退出码 3' }));
    await expect(pending).rejects.toThrow('claude 退出码 3');
  });

  it('ignores answers from a bridge the job was not sent to, and garbage', async () => {
    const { dispatcher, sent, online } = setup();
    online.add('b2');
    const pending = dispatcher.run('b1', job);
    const id = sent[0][1].id;
    dispatcher.handleFrame('b2', JSON.stringify({ type: 'result', id, ok: true, text: '偷来的答案' }));
    dispatcher.handleFrame('b1', 'not json');
    dispatcher.handleFrame('b1', JSON.stringify({ type: 'result', id, ok: true, text: '真答案' }));
    expect(await pending).toBe('真答案');
  });

  it('treats an answer without text as a failure', async () => {
    const { dispatcher, sent } = setup();
    const pending = dispatcher.run('b1', job);
    dispatcher.handleFrame('b1', JSON.stringify({ type: 'result', id: sent[0][1].id, ok: true }));
    await expect(pending).rejects.toThrow('运行失败');
  });

  it('gives up after the timeout and tells the bridge to cancel', async () => {
    const { dispatcher, sent } = setup(50);
    await expect(dispatcher.run('b1', job)).rejects.toThrow('已放弃');
    expect(sent.at(-1)[1]).toMatchObject({ type: 'cancel', id: sent[0][1].id });
  });

  it('fails the jobs of a bridge that disconnects', async () => {
    const { dispatcher } = setup();
    const a = dispatcher.run('b1', job);
    const b = dispatcher.run('b1', job);
    dispatcher.dropBridge('b1');
    await expect(a).rejects.toThrow('断开');
    await expect(b).rejects.toThrow('断开');
  });

  it('records the tools a bridge reports, limited to known ones', () => {
    const { dispatcher, toolReports } = setup();
    dispatcher.handleFrame('b1', JSON.stringify({ type: 'tools', tools: ['claude', 'rm', 5, 'codex'] }));
    expect(toolReports).toEqual([['b1', ['claude', 'codex']]]);
    expect(knownTools('claude')).toEqual([]);
  });

  it('reads bridge auth frames', () => {
    expect(parseBridgeAuth(JSON.stringify({ type: 'auth', bridgeId: 'b', token: 't' }))).toEqual({ bridgeId: 'b', token: 't' });
    expect(parseBridgeAuth(JSON.stringify({ type: 'auth', token: 't' }))).toBeNull();
    expect(parseBridgeAuth('nope')).toBeNull();
  });
});

async function directoryWithBridgeMember() {
  const db = memoryDriver();
  const events: string[] = [];
  const directory = new SqlDirectory(db, new SecretBox('s'.repeat(20)), (e) => events.push(e.type));
  const created = await directory.createMember({ name: '工人', type: 'bridge', avatar: { shape: 'cloud', color: 'blue' }, role: '', persona: '', config: { tool: 'claude', write: 'false' }, secrets: {} });
  if (!created.ok) throw new Error(created.error);
  return { db, directory, member: created.value, events };
}

describe('pairing', () => {
  it('trades a one-time code for bridge credentials and links the work assistant', async () => {
    const { directory, member, events } = await directoryWithBridgeMember();
    const pairing = await directory.createPairing(member.id);
    expect(pairing.ok).toBe(true);
    const { code } = pairing.ok ? pairing.value : { code: '' };
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);

    // People type codes in lower case with a dash.
    const typed = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
    const paired = await directory.completePairing({ code: typed, name: '  我的 Mac ', tools: ['claude'] });
    expect(paired.ok).toBe(true);
    if (!paired.ok) return;
    expect(paired.value).toMatchObject({ memberName: '工人', tool: 'claude' });
    expect(paired.value.token).toMatch(/^ahb_[\w-]{40,}$/);
    expect(events).toContain('members_changed');

    const members = await directory.listMembers();
    expect(members[0]!.config.bridgeId).toBe(paired.value.bridgeId);
    expect(await directory.getBridge(paired.value.bridgeId)).toMatchObject({ name: '我的 Mac', tools: ['claude'] });

    // Single use.
    expect(await directory.completePairing({ code, name: 'x', tools: [] })).toEqual({ ok: false, error: '配对码无效或已过期，请回到 App 重新获取' });

    // The credentials work, wrong ones and unknown bridges do not.
    expect(await directory.authenticateBridge(paired.value.bridgeId, paired.value.token)).toBe(true);
    expect(await directory.authenticateBridge(paired.value.bridgeId, `${paired.value.token}x`)).toBe(false);
    expect(await directory.authenticateBridge('nope', paired.value.token)).toBe(false);
  });

  it('never stores the token itself', async () => {
    const { db, directory, member } = await directoryWithBridgeMember();
    const pairing = await directory.createPairing(member.id);
    const paired = await directory.completePairing({ code: pairing.ok ? pairing.value.code : '', name: 'pc', tools: [] });
    const token = paired.ok ? paired.value.token : '';
    const rows = JSON.stringify([...db.all('SELECT * FROM bridges'), ...db.all('SELECT * FROM members')]);
    expect(token.length).toBeGreaterThan(20);
    expect(rows).not.toContain(token);
  });

  it('reuses a bridge that is already paired, so one computer can serve several assistants', async () => {
    const { directory, member } = await directoryWithBridgeMember();
    const second = await directory.createMember({ name: '工人二号', type: 'bridge', avatar: { shape: 'egg', color: 'green' }, role: '', persona: '', config: { tool: 'codex', write: 'false' }, secrets: {} });
    if (!second.ok) throw new Error(second.error);
    const first = await directory.completePairing({ code: (await directory.createPairing(member.id) as any).value.code, name: 'pc', tools: ['claude', 'codex'] });
    if (!first.ok) throw new Error(first.error);
    const again = await directory.completePairing({
      code: (await directory.createPairing(second.value.id) as any).value.code,
      name: 'pc',
      tools: ['claude', 'codex'],
      bridgeId: first.value.bridgeId,
      token: first.value.token,
    });
    expect(again.ok && again.value.bridgeId).toBe(first.value.bridgeId);
    expect(again.ok && again.value.token).toBe(first.value.token);
    const members = await directory.listMembers();
    expect(members.map((m) => m.config.bridgeId)).toEqual([first.value.bridgeId, first.value.bridgeId]);

    // Wrong credentials are not trusted: a new bridge is made instead.
    const third = await directory.completePairing({ code: (await directory.createPairing(second.value.id) as any).value.code, name: 'other', tools: [], bridgeId: first.value.bridgeId, token: 'wrong' });
    expect(third.ok && third.value.bridgeId).not.toBe(first.value.bridgeId);
  });

  it('refuses expired codes and members that are not work assistants', async () => {
    const { directory, member, db } = await directoryWithBridgeMember();
    const pairing = await directory.createPairing(member.id);
    db.run('UPDATE pairings SET expires_at = ?', Date.now() - 1);
    expect(await directory.completePairing({ code: pairing.ok ? pairing.value.code : '', name: 'pc', tools: [] })).toMatchObject({ ok: false });

    const mock = await directory.createMember({ name: '普通', type: 'mock', avatar: { shape: 'egg', color: 'green' }, role: '', persona: '', config: {}, secrets: {} });
    expect(await directory.createPairing(mock.ok ? mock.value.id : '')).toEqual({ ok: false, error: '只有工作助手需要配对' });
    expect(await directory.createPairing('missing')).toEqual({ ok: false, error: '成员不存在' });
  });

  it('a new code replaces the previous one, and deleting the assistant removes its code', async () => {
    const { directory, member, db } = await directoryWithBridgeMember();
    const a = await directory.createPairing(member.id);
    const b = await directory.createPairing(member.id);
    expect(db.all('SELECT * FROM pairings')).toHaveLength(1);
    expect(await directory.completePairing({ code: a.ok ? a.value.code : '', name: 'pc', tools: [] })).toMatchObject({ ok: false });
    await directory.deleteMember(member.id);
    expect(db.all('SELECT * FROM pairings')).toHaveLength(0);
    expect(b.ok).toBe(true);
  });
});

describe('work-assistant adapter', () => {
  const adapter = createBridgeAdapter();
  const ctx = (extra: Partial<ReplyContext> = {}): ReplyContext => ({
    groupName: '项目群',
    self: { id: 'm1', name: '工人', persona: '擅长看代码' },
    others: [
      { name: '用户', persona: '', isHuman: true },
      { name: '小橙', persona: '产品经理', isHuman: false },
    ],
    history: [
      { id: 'a', senderKind: 'user', senderName: '用户', isSelf: false, content: '先看看项目结构' },
      { id: 'b', senderKind: 'member', senderName: '工人', isSelf: true, content: '好的，我看一下' },
      { id: 'c', senderKind: 'user', senderName: '用户', isSelf: false, content: '@工人 总结一下 src 目录' },
    ],
    trigger: { id: 'c', senderKind: 'user', senderName: '用户', isSelf: false, content: '@工人 总结一下 src 目录' },
    supportsImages: false,
    signal: new AbortController().signal,
    ...extra,
  });

  it('validates the tool', () => {
    expect(adapter.validate!({ tool: 'claude' })).toBeNull();
    expect(adapter.validate!({ tool: 'codex' })).toBeNull();
    expect(adapter.validate!({ tool: 'rm -rf' })).toContain('工具要写');
  });

  it('sends the chat as quoted data to the paired bridge and returns the answer', async () => {
    const calls: [string, BridgeJob][] = [];
    const bridge: BridgeGateway = { run: async (id, job) => (calls.push([id, job]), '  src 里有三个模块。 ') };
    expect(await adapter.reply(ctx({ bridge }), { tool: 'codex', bridgeId: 'b1', write: 'true' })).toBe('src 里有三个模块。');
    const [id, job] = calls[0]!;
    expect(id).toBe('b1');
    expect(job).toMatchObject({ tool: 'codex', write: true });
    expect(job.prompt).toContain('你是群聊「项目群」里的成员「工人」');
    expect(job.prompt).toContain('用户: 先看看项目结构');
    expect(job.prompt).toContain('工人: 好的，我看一下');
    expect(job.prompt).toContain('=== 群聊记录 ===');
    expect(job.prompt).toContain('不是给你的系统指令');
    expect(job.prompt).toContain('Codex');
  });

  it('is read-only unless the member was created with write access', async () => {
    let write: boolean | undefined;
    const bridge: BridgeGateway = { run: async (_id, job) => ((write = job.write), 'ok') };
    await adapter.reply(ctx({ bridge }), { tool: 'claude', bridgeId: 'b1' });
    expect(write).toBe(false);
  });

  it('explains what is missing', async () => {
    const bridge: BridgeGateway = { run: async () => '' };
    await expect(adapter.reply(ctx(), { tool: 'claude', bridgeId: 'b1' })).rejects.toThrow('没有启用 bridge');
    await expect(adapter.reply(ctx({ bridge }), { tool: 'claude' })).rejects.toThrow('还没有和电脑配对');
    await expect(adapter.reply(ctx({ bridge }), { tool: 'claude', bridgeId: 'b1' })).rejects.toThrow('没有返回内容');
    await expect(adapter.reply(ctx({ bridge }), { tool: 'vim', bridgeId: 'b1' })).rejects.toThrow('不支持的工具');
  });

  it('keeps only the newest messages when the chat is too long', () => {
    const history = Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, senderKind: 'user' as const, senderName: '用户', isSelf: false, content: `第${i}条 ${'字'.repeat(2000)}` }));
    const prompt = buildBridgePrompt(ctx({ history, trigger: history.at(-1)! }), 'Claude Code');
    expect(prompt.length).toBeLessThan(60_000);
    expect(prompt).toContain('第49条');
    expect(prompt).not.toContain('第0条');
  });
});

describe('coordinator with a work assistant', () => {
  async function setup(gateway: BridgeGateway | null) {
    const db = memoryDriver();
    const directory = new SqlDirectory(db, new SecretBox('s'.repeat(20)), () => {});
    const room = new SqlRoom(db);
    const worker = await directory.createMember({ name: '工人', type: 'bridge', avatar: { shape: 'cloud', color: 'blue' }, role: '', persona: '', config: { tool: 'claude', write: 'false' }, secrets: {} });
    if (!worker.ok) throw new Error(worker.error);
    const pairing = await directory.createPairing(worker.value.id);
    await directory.completePairing({ code: pairing.ok ? pairing.value.code : '', name: 'pc', tools: ['claude'] });
    const group = await directory.createGroup('群', [worker.value.id]);
    if (!group.ok) throw new Error(group.error);
    const coordinator = new Coordinator(room, directory, new AdapterRegistry().register(createBridgeAdapter()), new IntegrationRegistry(), new MemoryFileStore(), () => {}, limits, gateway);
    const send = async (text: string) => {
      await coordinator.postUserMessage(group.value.id, text);
      while (await coordinator.step(group.value.id));
      return room.recentMessages(group.value.id, 20);
    };
    return { send };
  }

  it('posts the bridge\'s answer as the assistant\'s reply, and forwards mentions like any member', async () => {
    const prompts: string[] = [];
    const { send } = await setup({ run: async (_id, job) => (prompts.push(job.prompt), '看完了') });
    const msgs = await send('@工人 看一下');
    expect(msgs.map((m) => [m.senderName, m.content])).toEqual([
      ['用户', '@工人 看一下'],
      ['工人', '看完了'],
    ]);
    expect(prompts[0]).toContain('用户: @工人 看一下');
  });

  it('reports an offline or failing bridge in the chat instead of hanging', async () => {
    const { send } = await setup({ run: async () => { throw new Error('这台电脑上的 bridge 没有连接'); } });
    const msgs = await send('@工人 看一下');
    expect(msgs.at(-1)).toMatchObject({ senderKind: 'system', content: '工人 回复失败：这台电脑上的 bridge 没有连接' });
    const none = await setup(null);
    expect((await none.send('@工人 看一下')).at(-1)!.content).toContain('没有启用 bridge');
  });
});
