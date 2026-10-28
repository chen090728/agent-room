import { localizedField } from '../copy.js';
import type { AppLanguage } from '../locale.js';
import type { MemberAdapter, ReplyContext } from './types.js';

/**
 * Mock members answer from a pool of canned lines and often @ someone else,
 * so the coordinator can be tested and demoed without any API key.
 *
 * Optional config (set by the demo seed, not exposed in the App):
 * - replies:     JSON array of reply templates; {sender} is replaced
 * - mentionRate: chance (0–1) of handing over to another member
 */
const GENERIC_REPLIES: Record<AppLanguage, string[]> = {
  zh: [
    '收到，{sender}。我按自己的理解说两句：先把目标说清楚，再定下一步。',
    '这个问题挺有意思，我的看法是先做一个最小版本试试。',
    '同意{sender}的方向，不过细节上还可以再想想。',
    '我补充一点：别忘了考虑用户第一次使用时的感受。',
    '好的，这部分我来跟进。',
  ],
  en: [
    "Got it, {sender}. Here's how I see it: name the goal, then decide the next step.",
    "Interesting question. I'd try the smallest version first.",
    "I agree with {sender}'s direction, though the details could use another pass.",
    'One more thing: think about how this feels the first time someone uses it.',
    "Okay, I'll follow up on this part.",
  ],
};

const GREETINGS: Record<AppLanguage, string[]> = {
  zh: ['你好呀！我是{self}，{persona}。', '你好～我是{self}，{persona}，有什么想聊的？'],
  en: ["Hi, I'm {self}, {persona}.", "Hi, I'm {self} — {persona}. What should we talk about?"],
};

const HANDOVERS: Record<AppLanguage, string[]> = {
  zh: ['@{name} 你怎么看？', '@{name} 你来补充一下？', '@{name} 这块你更熟，交给你。', '@{name} 有不同意见吗？'],
  en: ['@{name} what do you think?', '@{name} can you add to that?', '@{name} you know this better — over to you.', '@{name} do you see it differently?'],
};

const PERSONA_FALLBACK: Record<AppLanguage, string> = { zh: '很高兴认识你', en: 'nice to meet you' };

export interface MockOptions {
  random?: () => number;
  delayMs?: [number, number];
}

export function createMockAdapter(opts: MockOptions = {}): MemberAdapter {
  const random = opts.random ?? Math.random;
  const pick = <T>(arr: T[]): T => arr[Math.floor(random() * arr.length) % arr.length];

  return {
    type: 'mock',
    label: '模拟助手',
    description: '不需要 Key，按人设返回预设或随机回复，并会 @ 其他成员。',
    fields: [],

    async reply(ctx: ReplyContext, config) {
      const [min, max] = opts.delayMs ?? [0, 0];
      if (max > 0) await sleep(min + random() * (max - min), ctx.signal);

      const lang = ctx.language ?? 'zh';
      const pool = parsePool(config.replies, lang) ?? GENERIC_REPLIES[lang];
      // Only greet the human, so members don't keep greeting each other.
      const isGreeting = ctx.trigger.senderKind === 'user' && /你好|您好|hello|\bhi\b|嗨|哈喽/i.test(ctx.trigger.content);
      const personaSource = localizedField(ctx.self.persona, config.personaI18n, lang);
      const persona = personaSource.split(/[，,。.!！？?\n]/)[0].trim() || PERSONA_FALLBACK[lang];
      let text = (isGreeting ? pick(GREETINGS[lang]) : pick(pool))
        .replaceAll('{sender}', ctx.trigger.senderName)
        .replaceAll('{self}', ctx.self.name)
        .replaceAll('{persona}', persona);

      // Mock members cannot read files, but they can say they got them (handy for demos and tests).
      const files = ctx.trigger.attachments ?? [];
      if (files.length) {
        const names = files.map((f) => f.name).join(lang === 'en' ? ', ' : '、');
        const lead =
          lang === 'en'
            ? `Got your ${files.length > 1 ? `${files.length} files` : 'file'}: ${names}.`
            : `收到你发的${files.length > 1 ? `${files.length} 个文件` : '文件'}：${names}。`;
        text = `${lead} ${text}`;
      }

      const rate = clamp(Number(config.mentionRate ?? 0.6));
      const candidates = ctx.others.filter((o) => !o.isHuman).map((o) => o.name);
      if (candidates.length && random() < rate) {
        text += ' ' + pick(HANDOVERS[lang]).replace('{name}', pick(candidates));
      }
      return text;
    },
  };
}

/** A JSON array is used for every language. An object `{ zh, en }` follows the request, then zh, then en. */
export function parsePool(raw: string | undefined, lang: AppLanguage): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isStringList(parsed)) return parsed;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const packs = parsed as Record<string, unknown>;
    const chosen = packs[lang] ?? packs.zh ?? packs.en;
    return isStringList(chosen) ? chosen : undefined;
  } catch {
    return undefined;
  }
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string');
}

function clamp(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.6;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });
}
