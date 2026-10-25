import type { AdapterRegistry } from './adapters/registry.js';
import type { ContextMessage } from './adapters/types.js';
import { stripSelfPrefix } from './context.js';
import type { FileStore } from './files.js';
import { resolveForContext } from './uploads.js';
import type { Directory } from './directory.js';
import { parseMentions } from './mentions.js';
import type { IntegrationRegistry } from './integrations/registry.js';
import type { ToolRuntime } from './integrations/types.js';
import type { ChainState, SqlRoom } from './room.js';
import { UserError, type Card, type ChatEvent, type Member, type Message } from './types.js';

export interface CoordinatorOptions {
  maxHops: number;
  maxReplies: number;
  contextSize: number;
  llmTimeoutMs: number;
  userDisplayName: string;
}

/** The part of the directory the coordinator needs (an RPC stub on Cloudflare). */
export type CoordinatorDirectory = Pick<Directory, 'getGroup' | 'groupMembers' | 'getMemberSecrets' | 'recordActivity' | 'getIntegration'>;

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
    private integrations: IntegrationRegistry,
    /** Null when the deployment has no file storage; then nothing can be attached. */
    private files: FileStore | null,
    private emit: (event: ChatEvent) => void,
    private opts: CoordinatorOptions,
  ) {}

  /** Saves a message from the human; returns whether replies are now queued. */
  async postUserMessage(groupId: string, content: string, attachmentIds: string[] = []): Promise<{ message: Message; pending: boolean }> {
    const attachments = this.room.checkUploads(groupId, attachmentIds);
    const message = this.room.atomically(() => {
      const m = this.room.addMessage({
        groupId,
        senderKind: 'user',
        senderId: null,
        senderName: this.opts.userDisplayName,
        content,
        attachments,
      });
      this.room.claimUploads(attachmentIds, m.id);
      return m;
    });
    this.emit({ type: 'message', message });

    const [members, group] = await Promise.all([this.directory.groupMembers(groupId), this.directory.getGroup(groupId)]);
    let mentioned = resolveMentions(content, members);
    // In a one-to-one chat everything is addressed to the assistant; no @ needed.
    if (!mentioned.length && group?.kind === 'direct' && members.length === 1) mentioned = members;
    if (mentioned.length) {
      const { maxHops, maxReplies } = this.opts;
      const state: ChainState = {
        relay: { groupId, rootId: message.id, active: true, hop: 0, maxHops, replies: 0, maxReplies, trail: [], thinking: null },
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
      relay.trail[hop - 1] ??= member.avatar.color;
      relay.thinking = member.name;
      this.room.saveChain(task.rootId, state);
      this.emit({ type: 'relay', relay: { ...relay } });
      await this.directory.recordActivity(groupId, { relay: { ...relay } });
      this.emit({ type: 'typing', groupId, memberId: member.id, active: true });

      let text = '';
      let cards: Card[] = [];
      try {
        const answer = await this.ask(member, members, trigger);
        cards = answer.cards;
        text = stripSelfPrefix(answer.text, member.name);
        if (!text && cards.length) text = '我提交了修改，请在下面的卡片里确认。';
      } catch (err) {
        this.room.removeTask(task.seq);
        relay.thinking = null;
        this.room.saveChain(task.rootId, state);
        await this.addSystemMessage(groupId, `${member.name} 回复失败：${describeError(err)}`, task.rootId);
      } finally {
        this.emit({ type: 'typing', groupId, memberId: member.id, active: false });
      }

      if (!text) {
        this.room.removeTask(task.seq);
        relay.thinking = null;
        this.room.saveChain(task.rootId, state);
      } else {
        const next = resolveMentions(text, members).filter((m) => m.id !== member.id);
        const tooDeep = next.length > 0 && hop >= this.opts.maxHops;
        const depthNotice = tooDeep && !state.depthNoticeSent;
        // Saving the reply and retiring the task happen together, so a crash
        // never produces the same reply twice.
        const { reply, extra, capped } = this.room.atomically(() => {
          const reply = this.room.addMessage({
            groupId,
            senderKind: 'member',
            senderId: member.id,
            senderName: member.name,
            content: text,
            card: cards[0] ?? null,
            rootId: task.rootId,
            hop,
          });
          // More than one card in a reply: the others get a message each.
          const extra = cards.slice(1).map((card) =>
            this.room.addMessage({
              groupId,
              senderKind: 'member',
              senderId: member.id,
              senderName: member.name,
              content: card.type === 'pull_request' ? `PR #${card.number}：${card.title}` : '',
              card,
              rootId: task.rootId,
              hop,
            }),
          );
          this.room.removeTask(task.seq);
          relay.replies++;
          relay.thinking = null;
          if (tooDeep) state.depthNoticeSent = true;
          else this.room.pushTasks(groupId, task.rootId, next.map((m) => ({ memberId: m.id, triggerId: reply.id })));
          const capped = relay.replies >= this.opts.maxReplies && this.room.hasTasks(task.rootId);
          if (capped) this.room.dropTasks(task.rootId);
          this.room.saveChain(task.rootId, state);
          return { reply, extra, capped };
        });

        this.emit({ type: 'message', message: reply });
        for (const m of extra) this.emit({ type: 'message', message: m });
        this.emit({ type: 'relay', relay: { ...relay } });
        await this.directory.recordActivity(groupId, { lastMessage: extra.at(-1) ?? reply, relay: { ...relay } });
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

  private async ask(member: Member, members: Member[], trigger: Message): Promise<{ text: string; cards: Card[] }> {
    const adapter = this.registry.get(member.type);
    if (!adapter) throw new Error(`未知的成员类型 ${member.type}`);
    const [group, secrets] = await Promise.all([
      this.directory.getGroup(trigger.groupId),
      this.directory.getMemberSecrets(member.id),
    ]);

    // Tools from the repository connected to this conversation, if any.
    let tools: ToolRuntime | undefined;
    const repo = group?.binding?.repo;
    if (repo) {
      const integration = await this.directory.getIntegration(repo.integrationId);
      const type = integration && this.integrations.get(integration.type);
      if (integration && type) {
        tools = type.createTools(repo.repo, { ...integration.config, ...integration.secrets }, { integrationId: integration.id, assistantName: member.name });
      }
    }

    // Files of the recent messages, prepared for this member's model.
    const supportsImages = member.config.vision !== 'false';
    const history = this.room.contextMessages(trigger.groupId, this.opts.contextSize);
    const resolved = await resolveForContext(this.room, this.files, trigger.groupId, history, { images: supportsImages });
    const toCtx = (m: Message): ContextMessage => ({
      id: m.id,
      senderKind: m.senderKind,
      senderName: m.senderName,
      isSelf: m.senderId === member.id,
      content: m.content,
      attachments: resolved.get(m.id) ?? m.attachments?.map((a) => ({ name: a.name, kind: a.kind, note: '没有发给模型' })),
    });

    const text = await adapter.reply(
      {
        groupName: group?.name ?? '',
        self: { id: member.id, name: member.name, persona: member.persona },
        others: [
          { name: this.opts.userDisplayName, persona: '', isHuman: true },
          ...members.filter((m) => m.id !== member.id).map((m) => ({ name: m.name, persona: m.persona, isHuman: false })),
        ],
        history: history.map(toCtx),
        trigger: toCtx(trigger),
        supportsImages,
        tools,
        signal: AbortSignal.timeout(this.opts.llmTimeoutMs),
      },
      { ...member.config, ...secrets },
    );
    return { text, cards: tools?.cards ?? [] };
  }

  /**
   * Handles a tap on a card button (merge or reject a pull request). Only a
   * person can do this; assistants have no way to call it.
   */
  async cardAction(groupId: string, messageId: string, action: 'merge' | 'reject'): Promise<Message> {
    const message = this.room.getMessage(messageId);
    if (!message || message.groupId !== groupId || !message.card) throw new UserError('找不到这张卡片', 404);
    const integration = await this.directory.getIntegration(message.card.integrationId);
    const type = integration && this.integrations.get(integration.type);
    if (!integration || !type) throw new UserError('这个仓库的连接已经被删除了，请在 GitHub 上直接处理这个 PR');

    let updated: Card;
    try {
      updated = await type.cardAction(message.card, action, { ...integration.config, ...integration.secrets });
    } catch (err) {
      throw new UserError(err instanceof Error ? err.message : String(err), 502);
    }
    const next = this.room.updateCard(messageId, updated)!;
    this.emit({ type: 'message_updated', message: next });
    // Keep the group list's preview in step when this is its latest message.
    const group = await this.directory.getGroup(groupId);
    if (group?.lastMessage?.id === messageId) await this.directory.recordActivity(groupId, { lastMessage: next });
    return next;
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
