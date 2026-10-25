import type { ContextMessage, ReplyContext } from './adapters/types.js';

export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  /** A string, or parts when the message carries images. */
  content: string | ContentPart[];
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

const toParts = (content: string | ContentPart[]): ContentPart[] => (typeof content === 'string' ? [{ type: 'text', text: content }] : content);

/** Joins neighbouring text parts, and collapses to a plain string when there are no images. */
function normalize(parts: ContentPart[]): string | ContentPart[] {
  const out: ContentPart[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (part.type === 'text' && last?.type === 'text') last.text += `\n${part.text}`;
    else out.push({ ...part });
  }
  return out.every((p) => p.type === 'text') ? out.map((p) => (p as { text: string }).text).join('\n') : out;
}

/** Appends text to the end of a message. */
function appendText(content: string | ContentPart[], text: string): string | ContentPart[] {
  return normalize([...toParts(content), { type: 'text', text }]);
}

/** Describes a message's files for the model; images go out as separate parts. */
function attachmentContent(m: ContextMessage, images: boolean): { text: string; images: ContentPart[] } {
  let text = '';
  const parts: ContentPart[] = [];
  for (const a of m.attachments ?? []) {
    if (a.kind === 'image') {
      if (a.image && images) {
        text += `\n[图片：${a.name}]`;
        parts.push({ type: 'image_url', image_url: { url: `data:${a.image.mime};base64,${a.image.base64}` } });
      } else {
        text += `\n[图片：${a.name}（${a.note ?? '当前模型看不到图片'}）]`;
      }
    } else if (a.text) {
      text += a.kind === 'pdf' ? `\n【PDF：${a.name}，以下是提取出的文字】\n${a.text}` : `\n【文件：${a.name}】\n\`\`\`\n${a.text}\n\`\`\``;
    } else {
      text += `\n[文件：${a.name}${a.note ? `（${a.note}）` : ''}]`;
    }
  }
  return { text, images: parts };
}

/**
 * Turns the group history into chat-completion messages: the member's own
 * messages become `assistant`, everyone else's become `user` prefixed with the
 * speaker's name, and adjacent `user` messages are merged into one. Files are
 * described in the text (text and PDF contents are included) and images are
 * attached as image parts unless `images` is false.
 */
export function buildChatMessages(ctx: ReplyContext, opts: { images?: boolean } = {}): ChatMessage[] {
  const images = opts.images ?? true;
  const out: ChatMessage[] = [{ role: 'system', content: buildSystemPrompt(ctx) }];
  for (const m of ctx.history) {
    let msg: ChatMessage;
    if (m.isSelf) {
      msg = { role: 'assistant', content: m.content };
    } else {
      const files = attachmentContent(m, images);
      const text = `${m.senderName}: ${m.content}${files.text}`;
      msg = { role: 'user', content: files.images.length ? [{ type: 'text', text }, ...files.images] : text };
    }
    const last = out[out.length - 1];
    if (msg.role === 'user' && last.role === 'user') {
      last.content = normalize([...toParts(last.content), ...toParts(msg.content)]);
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
    if (last.role === 'user') last.content = appendText(last.content, note);
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
