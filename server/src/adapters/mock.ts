import type { MemberAdapter, ReplyContext } from './types.js';

/**
 * Mock members answer from a pool of canned lines and often @ someone else,
 * so the coordinator can be tested and demoed without any API key.
 *
 * Optional config (set by the demo seed, not exposed in the App):
 * - replies:     JSON array of reply templates; {sender} is replaced
 * - mentionRate: chance (0–1) of handing over to another member
 */
const GENERIC_REPLIES = [
  '收到，{sender}。我按自己的理解说两句：先把目标说清楚，再定下一步。',
  '这个问题挺有意思，我的看法是先做一个最小版本试试。',
  '同意 {sender} 的方向，不过细节上还可以再想想。',
  '我补充一点：别忘了考虑用户第一次使用时的感受。',
  '好的，这部分我来跟进。',
];

const GREETINGS = ['你好呀！我是{self}，{persona}。', '你好～我是{self}，{persona}，有什么想聊的？'];

const HANDOVERS = ['@{name} 你怎么看？', '@{name} 你来补充一下？', '@{name} 这块你更熟，交给你。', '@{name} 有不同意见吗？'];

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

      const pool = parsePool(config.replies) ?? GENERIC_REPLIES;
      // Only greet the human, so members don't keep greeting each other.
      const isGreeting = ctx.trigger.senderKind === 'user' && /你好|您好|hello|\bhi\b|嗨|哈喽/i.test(ctx.trigger.content);
      const persona = ctx.self.persona.split(/[，,。.!！？?\n]/)[0].trim() || '很高兴认识你';
      let text = (isGreeting ? pick(GREETINGS) : pick(pool))
        .replaceAll('{sender}', ctx.trigger.senderName)
        .replaceAll('{self}', ctx.self.name)
        .replaceAll('{persona}', persona);

      const rate = clamp(Number(config.mentionRate ?? 0.6));
      const candidates = ctx.others.filter((o) => !o.isHuman).map((o) => o.name);
      if (candidates.length && random() < rate) {
        text += ' ' + pick(HANDOVERS).replace('{name}', pick(candidates));
      }
      return text;
    },
  };
}

function parsePool(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length && arr.every((s) => typeof s === 'string') ? arr : undefined;
  } catch {
    return undefined;
  }
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
