import { WELCOME_MESSAGE, WELCOME_NOTICE } from './copy.js';
import type { Directory } from './directory.js';
import type { Notice, Avatar } from './types.js';

const DEMO_MEMBERS: {
  name: string;
  avatar: Avatar;
  role: string;
  roleEn: string;
  persona: string;
  personaEn: string;
  replies: { zh: string[]; en: string[] };
}[] = [
  {
    name: '小橙',
    avatar: { shape: 'cloud', color: 'orange' },
    role: '产品经理',
    roleEn: 'Product manager',
    persona: '热情的产品经理，点子多，喜欢先抛出方案再拉大家讨论。',
    personaEn: 'An enthusiastic product manager with lots of ideas, who likes to throw out a plan and get everyone talking.',
    replies: {
      zh: [
        '我有个想法：先做一个最简单的版本，让用户今天就能用上。',
        '{sender}说得对！我们可以把这个拆成三步，第一步先验证需求。',
        '要不要加一个新手引导？第一次打开的体验很关键。',
        '我觉得方向没问题，接下来要定优先级。',
      ],
      en: [
        "Here's an idea: ship the smallest version so people can use it today.",
        '{sender} is right. We can split this into three steps and test the need first.',
        'Should we add a first-run guide? The first open matters.',
        'The direction looks fine. Next we should set priorities.',
      ],
    },
  },
  {
    name: '阿蓝',
    avatar: { shape: 'square', color: 'blue' },
    role: '安全顾问',
    roleEn: 'Security advisor',
    persona: '冷静的工程师，关注安全和可行性，说话简洁。',
    personaEn: 'A calm engineer focused on safety and whether it can actually be built. Speaks briefly.',
    replies: {
      zh: ['技术上可行，但要注意接口的频率限制。', '同意。建议先写测试，再动手实现。', '这里有个风险：数据要做好备份。', '{sender}，我估算一下，两天能出第一版。'],
      en: ["It's doable, but watch the rate limits.", 'Agreed. Write the tests first, then implement it.', 'One risk: the data needs a backup.', "{sender}, I'd estimate two days for a first version."],
    },
  },
  {
    name: '小绿',
    avatar: { shape: 'egg', color: 'green' },
    role: '交互设计',
    roleEn: 'Interaction design',
    persona: '细心的设计师，关注交互体验，喜欢提问。',
    personaEn: 'A careful designer who cares about how it feels to use, and likes to ask questions.',
    replies: {
      zh: ['用户在这一步会不会迷路？我想画个流程图确认一下。', '按钮可以再大一点，单手操作更方便。', '{sender}的方案我喜欢，颜色上可以再柔和一些。', '我们是不是该先找几位用户聊聊？'],
      en: [
        'Will people get lost at this step? I want to sketch the flow.',
        "The button could be larger so it's easy to tap with one hand.",
        "I like {sender}'s approach. The colors could be a bit softer.",
        'Should we talk to a few users first?',
      ],
    },
  },
];

export { WELCOME_MESSAGE };

/**
 * On first start (no members, no groups) creates a demo group with mock
 * members. `addWelcome` posts the welcome notice into the new group.
 * Names stay Chinese so @-mentions keep matching.
 */
export async function seedIfEmpty(
  directory: Directory,
  addWelcome: (groupId: string, content: string, notice?: Notice) => Promise<unknown>,
): Promise<boolean> {
  if (!(await directory.isEmpty())) return false;
  const ids: string[] = [];
  for (const m of DEMO_MEMBERS) {
    const created = await directory.createMember({
      name: m.name,
      type: 'mock',
      avatar: m.avatar,
      role: m.role,
      persona: m.persona,
      config: {
        replies: JSON.stringify(m.replies),
        roleI18n: JSON.stringify({ en: m.roleEn }),
        personaI18n: JSON.stringify({ en: m.personaEn }),
        mentionRate: '0.85',
      },
      secrets: {},
    });
    if (created.ok) ids.push(created.value.id);
  }
  const group = await directory.createGroup('演示群', ids);
  if (group.ok) await addWelcome(group.value.id, WELCOME_MESSAGE, WELCOME_NOTICE);
  return true;
}
