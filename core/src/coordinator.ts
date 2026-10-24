import type { AdapterRegistry } from './adapters/registry.js';
import type { ContextMessage } from './adapters/types.js';
import { stripSelfPrefix } from './context.js';
import type { Directory } from './directory.js';
import { parseMentions } from './mentions.js';
import type { ChainState, SqlRoom } from './room.js';
import type { ChatEvent, Member, Message } from './types.js';

export interface CoordinatorOptions {
  maxHops: number;
  maxReplies: number;
  contextSize: number;
  llmTimeoutMs: number;
  userDisplayName: string;
}

/** The part of the directory the coordinator needs (an RPC stub on Cloudflare). */
export type CoordinatorDirectory = Pick<Directory, 'getGroup' | 'groupMembers' | 'getMemberSecrets' | 'recordActivity'>;

/**
 * Routes messages to members: only @-mentioned members reply, mentions in a
 * reply are forwarded, and every original message is limited to `maxHops`
 * relay steps and `maxReplies` replies in total.
 *
 * Work is queued in the room and done one reply per `step()`, so the host
 * decides how to drive it: Node loops until idle, a Durable Object runs one
 * step per alarm.
 */
export class Coordinator {
  constructor(
    private room: SqlRoom,
    private directory: CoordinatorDirectory,
    private registry: AdapterRegistry,
    private emit: (event: ChatEvent) => void,
    private opts: CoordinatorOptions,
  ) {}

  /** Saves a message from the human; returns whether replies are now queued. */
  async postUserMessage(groupId: string, content: string): Promise<{ message: Message; pending: boolean }> {
    const message = this.room.addMessage({
      groupId,
      senderKind: 'user',
      senderId: null,
      senderName: this.opts.userDisplayName,
      content,
    });
    this.emit({ type: 'message', message });

    const members = await this.directory.groupMembers(groupId);
    const mentioned = resolveMentions(content, members);
    if (mentioned.length) {
      const { maxHops, maxReplies } = this.opts;
      const state: ChainState = {
        relay: { groupId, rootId: message.id, active: true, hop: 0, maxHops, replies: 0, maxReplies, trail: [] },
        depthNoticeSent: false,
      };
      this.room.createChain(
        groupId,
        message.id,
        state,
        mentioned.map((m) => ({ memberId: m.id, triggerId: message.id })),
      );
    }
    await this.directory.recordActivity(groupId, { lastMessage: message });
    return { message, pending: mentioned.length > 0 };
  }

  async addSystemMessage(groupId: string, content: string, rootId?: string): Promise<Message> {
    const message = this.room.addMessage({ groupId, senderKind: 'system', senderId: null, senderName: '系统', content, rootId });
    this.emit({ type: 'message', message });
    await this.directory.recordActivity(groupId, { lastMessage: message });
    return message;
  }

  /** Processes one queued reply. Returns true while more work remains. */
  async step(groupId: string): Promise<boolean> {
    for (const rootId of this.room.idleChains(groupId)) await this.finish(rootId);

    const task = this.room.nextTask(groupId);
    if (!task) return false;

    const state = this.room.getChain(task.rootId)!;
    const { relay } = state;
    const members = await this.directory.groupMembers(groupId);
    const member = members.find((m) => m.id === task.memberId);
    const trigger = this.room.getMessage(task.triggerId);

    if (!member || !trigger) {
      this.room.removeTask(task.seq);
    } else if (task.attempts >= 2) {
      // Work on this reply was interrupted twice (e.g. the host restarted); give up on it.
      this.room.removeTask(task.seq);
      await this.addSystemMessage(groupId, `${member.name} 的回复被中断，已跳过。`, task.rootId);
    } else {
      // Counted before the work starts, so an interrupted reply is retried once.
      this.room.markAttempt(task.seq);
      const hop = trigger.hop + 1;
      relay.hop = Math.max(relay.hop, hop);
      relay.trail[hop - 1] ??= member.color;
      this.room.saveChain(task.rootId, state);
      this.emit({ type: 'relay', relay: { ...relay } });
      await this.directory.recordActivity(groupId, { relay: { ...relay } });
      this.emit({ type: 'typing', groupId, memberId: member.id, active: true });

      let text = '';
      try {
        text = stripSelfPrefix(await this.ask(member, members, trigger), member.name);
      } catch (err) {
        this.room.removeTask(task.seq);
        await this.addSystemMessage(groupId, `${member.name} 回复失败：${describeError(err)}`, task.rootId);
      } finally {
        this.emit({ type: 'typing', groupId, memberId: member.id, active: false });
      }

      if (!text) {
        this.room.removeTask(task.seq);
      } else {
        const next = resolveMentions(text, members).filter((m) => m.id !== member.id);
        const tooDeep = next.length > 0 && hop >= this.opts.maxHops;
        const depthNotice = tooDeep && !state.depthNoticeSent;
        // Saving the reply and retiring the task happen together, so a crash
        // never produces the same reply twice.
        const { reply, capped } = this.room.atomically(() => {
          const reply = this.room.addMessage({
            groupId,
            senderKind: 'member',
            senderId: member.id,
            senderName: member.name,
            content: text,
            rootId: task.rootId,
            hop,
          });
          this.room.removeTask(task.seq);
          relay.replies++;
          if (tooDeep) state.depthNoticeSent = true;
          else this.room.pushTasks(groupId, task.rootId, next.map((m) => ({ memberId: m.id, triggerId: reply.id })));
          const capped = relay.replies >= this.opts.maxReplies && this.room.hasTasks(task.rootId);
          if (capped) this.room.dropTasks(task.rootId);
          this.room.saveChain(task.rootId, state);
          return { reply, capped };
        });

        this.emit({ type: 'message', message: reply });
        this.emit({ type: 'relay', relay: { ...relay } });
        await this.directory.recordActivity(groupId, { lastMessage: reply, relay: { ...relay } });
        if (depthNotice) {
          await this.addSystemMessage(groupId, `已达到 ${this.opts.maxHops} 轮传递上限，自动停止。`, task.rootId);
        }
        if (capped) {
          await this.addSystemMessage(groupId, `已达到每条消息最多 ${this.opts.maxReplies} 次回复的上限，自动停止。`, task.rootId);
        }
      }
    }

    if (!this.room.hasTasks(task.rootId)) await this.finish(task.rootId);
    return !!this.room.nextTask(groupId);
  }

  private async finish(rootId: string) {
    const state = this.room.getChain(rootId);
    if (!state) return;
    this.room.deleteChain(rootId);
    const relay = { ...state.relay, active: false };
    this.emit({ type: 'relay', relay });
    await this.directory.recordActivity(relay.groupId, { relay: null });
  }

  private async ask(member: Member, members: Member[], trigger: Message): Promise<string> {
    const adapter = this.registry.get(member.type);
    if (!adapter) throw new Error(`未知的成员类型 ${member.type}`);
    const [group, secrets] = await Promise.all([
      this.directory.getGroup(trigger.groupId),
      this.directory.getMemberSecrets(member.id),
    ]);

    const toCtx = (m: Message): ContextMessage => ({
      id: m.id,
      senderKind: m.senderKind,
      senderName: m.senderName,
      isSelf: m.senderId === member.id,
      content: m.content,
    });

    return adapter.reply(
      {
        groupName: group?.name ?? '',
        self: { id: member.id, name: member.name, persona: member.persona },
        others: [
          { name: this.opts.userDisplayName, persona: '', isHuman: true },
          ...members.filter((m) => m.id !== member.id).map((m) => ({ name: m.name, persona: m.persona, isHuman: false })),
        ],
        history: this.room.contextMessages(trigger.groupId, this.opts.contextSize).map(toCtx),
        trigger: toCtx(trigger),
        signal: AbortSignal.timeout(this.opts.llmTimeoutMs),
      },
      { ...member.config, ...secrets },
    );
  }
}

function resolveMentions(text: string, members: Member[]): Member[] {
  return parseMentions(
    text,
    members.map((m) => m.name),
  ).map((name) => members.find((m) => m.name.toLowerCase() === name.toLowerCase())!);
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError') return '请求超时';
    return err.message;
  }
  return String(err);
}
