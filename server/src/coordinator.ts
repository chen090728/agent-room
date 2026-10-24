import type { AdapterRegistry } from './adapters/registry.js';
import type { ContextMessage } from './adapters/types.js';
import { stripSelfPrefix } from './context.js';
import type { Repo } from './db/repo.js';
import { parseMentions } from './mentions.js';
import type { Member, Message, RelayState } from './types.js';

export type ServerEvent =
  | { type: 'message'; message: Message }
  | { type: 'typing'; groupId: string; memberId: string; active: boolean }
  | { type: 'relay'; relay: RelayState }
  | { type: 'groups_changed' }
  | { type: 'members_changed' };

export interface CoordinatorOptions {
  maxHops: number;
  maxReplies: number;
  contextSize: number;
  llmTimeoutMs: number;
  userDisplayName: string;
}

interface Task {
  member: Member;
  trigger: Message;
}

/**
 * Routes messages to members: only @-mentioned members reply, mentions in a
 * reply are forwarded, and every original message is limited to `maxHops`
 * relay steps and `maxReplies` replies in total. Groups are processed one
 * chain at a time so the conversation stays in order.
 */
export class Coordinator {
  private queues = new Map<string, Promise<void>>();
  private relays = new Map<string, RelayState>();

  constructor(
    private repo: Repo,
    private registry: AdapterRegistry,
    private emit: (event: ServerEvent) => void,
    private opts: CoordinatorOptions,
  ) {}

  postUserMessage(groupId: string, content: string): Message {
    const message = this.repo.addMessage({
      groupId,
      senderKind: 'user',
      senderId: null,
      senderName: this.opts.userDisplayName,
      content,
    });
    this.emit({ type: 'message', message });
    this.enqueue(groupId, () => this.runChain(message));
    return message;
  }

  /** Active relay of a group, if a chain is running. */
  relayFor(groupId: string): RelayState | undefined {
    return this.relays.get(groupId);
  }

  /** Resolves once every queued chain of the group has finished. */
  async idle(groupId: string): Promise<void> {
    let current: Promise<void> | undefined;
    while ((current = this.queues.get(groupId))) {
      await current;
      if (this.queues.get(groupId) === current) return;
    }
  }

  private enqueue(groupId: string, job: () => Promise<void>) {
    const next = (this.queues.get(groupId) ?? Promise.resolve())
      .then(job)
      .catch((err) => console.error('[coordinator]', err));
    this.queues.set(groupId, next);
  }

  private notice(groupId: string, rootId: string, content: string) {
    const message = this.repo.addMessage({
      groupId,
      senderKind: 'system',
      senderId: null,
      senderName: '系统',
      content,
      rootId,
    });
    this.emit({ type: 'message', message });
  }

  private async runChain(root: Message) {
    const { maxHops, maxReplies } = this.opts;
    const members = this.repo.groupMembers(root.groupId);
    const names = members.map((m) => m.name);
    const byName = (name: string) => members.find((m) => m.name.toLowerCase() === name.toLowerCase())!;

    const queue: Task[] = parseMentions(root.content, names).map((n) => ({ member: byName(n), trigger: root }));
    if (!queue.length) return;

    const relay: RelayState = {
      groupId: root.groupId,
      rootId: root.id,
      active: true,
      hop: 0,
      maxHops,
      replies: 0,
      maxReplies,
      trail: [],
    };
    this.relays.set(root.groupId, relay);
    this.emit({ type: 'relay', relay: { ...relay } });

    let depthNoticeSent = false;
    try {
      while (queue.length) {
        const { member, trigger } = queue.shift()!;
        const hop = trigger.hop + 1;
        relay.hop = Math.max(relay.hop, hop);
        relay.trail[hop - 1] ??= member.color;
        this.emit({ type: 'relay', relay: { ...relay } });
        this.emit({ type: 'typing', groupId: root.groupId, memberId: member.id, active: true });

        let text: string;
        try {
          text = stripSelfPrefix(await this.ask(member, members, trigger), member.name);
        } catch (err) {
          this.notice(root.groupId, root.id, `${member.name} 回复失败：${describeError(err)}`);
          continue;
        } finally {
          this.emit({ type: 'typing', groupId: root.groupId, memberId: member.id, active: false });
        }
        if (!text) continue;

        const reply = this.repo.addMessage({
          groupId: root.groupId,
          senderKind: 'member',
          senderId: member.id,
          senderName: member.name,
          content: text,
          rootId: root.id,
          hop,
        });
        relay.replies++;
        this.emit({ type: 'message', message: reply });
        this.emit({ type: 'relay', relay: { ...relay } });

        const mentioned = parseMentions(text, names).filter((n) => n.toLowerCase() !== member.name.toLowerCase());
        if (mentioned.length && hop >= maxHops) {
          if (!depthNoticeSent) this.notice(root.groupId, root.id, `已达到 ${maxHops} 轮传递上限，自动停止。`);
          depthNoticeSent = true;
        } else {
          queue.push(...mentioned.map((n) => ({ member: byName(n), trigger: reply })));
        }

        if (relay.replies >= maxReplies && queue.length) {
          this.notice(root.groupId, root.id, `已达到每条消息最多 ${maxReplies} 次回复的上限，自动停止。`);
          break;
        }
      }
    } finally {
      relay.active = false;
      this.relays.delete(root.groupId);
      this.emit({ type: 'relay', relay: { ...relay } });
    }
  }

  private async ask(member: Member, members: Member[], trigger: Message): Promise<string> {
    const full = this.repo.getMemberWithSecrets(member.id);
    if (!full) throw new Error('成员已被删除');
    const adapter = this.registry.get(full.type);
    if (!adapter) throw new Error(`未知的成员类型 ${full.type}`);
    const group = this.repo.getGroup(trigger.groupId)!;

    const toCtx = (m: Message): ContextMessage => ({
      id: m.id,
      senderKind: m.senderKind,
      senderName: m.senderName,
      isSelf: m.senderId === member.id,
      content: m.content,
    });

    return adapter.reply(
      {
        groupName: group.name,
        self: { id: member.id, name: member.name, persona: member.persona },
        others: [
          { name: this.opts.userDisplayName, persona: '', isHuman: true },
          ...members.filter((m) => m.id !== member.id).map((m) => ({ name: m.name, persona: m.persona, isHuman: false })),
        ],
        history: this.repo.contextMessages(trigger.groupId, this.opts.contextSize).map(toCtx),
        trigger: toCtx(trigger),
        signal: AbortSignal.timeout(this.opts.llmTimeoutMs),
      },
      { ...full.config, ...full.secrets },
    );
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError') return '请求超时';
    return err.message;
  }
  return String(err);
}
