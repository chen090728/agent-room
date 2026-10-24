import type { ReplyContext } from './adapters/types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function buildSystemPrompt(ctx: ReplyContext): string {
  const { self, others, groupName } = ctx;
  const roster = others
    .map((o) => `- ${o.name}${o.isHuman ? '（人类用户）' : o.persona ? `：${o.persona.replace(/\s+/g, ' ').slice(0, 80)}` : ''}`)
    .join('\n');
  return [
    `你是群聊「${groupName}」里的成员「${self.name}」。`,
    self.persona ? `你的人设：${self.persona}` : '',
    '',
    '群里的其他成员：',
    roster || '（暂无）',
    '',
    '规则：',
    `1. 以「${self.name}」的身份直接说话，不要在开头写自己的名字或"${self.name}:"。`,
    '2. 需要某位成员接着回应时，在回复里写 "@名字"，被 @ 的成员会收到并回复；不需要时不要 @ 任何人。',
    '3. 群聊记录里每条消息前面的"名字:"标明了发言人。',
    '4. 回复简洁自然，像在群里聊天。',
    ctx.tools?.instructions ? `\n${ctx.tools.instructions}` : '',
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');
}

/**
 * Turns the group history into chat-completion messages: the member's own
 * messages become `assistant`, everyone else's become `user` prefixed with the
 * speaker's name, and adjacent `user` messages are merged into one.
 */
export function buildChatMessages(ctx: ReplyContext): ChatMessage[] {
  const out: ChatMessage[] = [{ role: 'system', content: buildSystemPrompt(ctx) }];
  for (const m of ctx.history) {
    const msg: ChatMessage = m.isSelf
      ? { role: 'assistant', content: m.content }
      : { role: 'user', content: `${m.senderName}: ${m.content}` };
    const last = out[out.length - 1];
    if (msg.role === 'user' && last.role === 'user') {
      last.content += `\n${msg.content}`;
    } else {
      out.push(msg);
    }
  }
  // With several members replying, newer messages may follow the one that
  // mentioned this member; remind it what it is answering.
  const lastId = ctx.history[ctx.history.length - 1]?.id;
  if (ctx.trigger.id && lastId !== ctx.trigger.id) {
    const note = `（${ctx.trigger.senderName} 点名了你：${ctx.trigger.content}）`;
    const last = out[out.length - 1];
    if (last.role === 'user') last.content += `\n${note}`;
    else out.push({ role: 'user', content: note });
  }
  // Many APIs require the first non-system message to come from the user.
  if (out[1]?.role === 'assistant') out.splice(1, 0, { role: 'user', content: '（以下是之前的群聊记录）' });
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Removes leading "Name:" / "【Name】:" prefixes a model may add to its reply. */
export function stripSelfPrefix(text: string, name: string): string {
  const n = escapeRe(name);
  // A bare name is only stripped when a colon follows, so "小橙觉得…" survives.
  const bracketed = new RegExp(`^[\\[【(（]\\s*${n}\\s*[\\]】)）]\\s*[:：]?\\s*`, 'i');
  const bare = new RegExp(`^${n}\\s*[:：]\\s*`, 'i');
  let out = text.trim();
  for (let prev = ''; prev !== out; ) {
    prev = out;
    out = out.replace(bracketed, '').replace(bare, '').trim();
  }
  return out;
}
