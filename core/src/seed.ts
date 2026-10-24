import type { Directory } from './directory.js';
import type { Avatar } from './types.js';

const DEMO_MEMBERS: { name: string; avatar: Avatar; role: string; persona: string; replies: string[] }[] = [
  {
    name: '小橙',
    avatar: { shape: 'cloud', color: 'orange' },
    role: '产品经理',
    persona: '热情的产品经理，点子多，喜欢先抛出方案再拉大家讨论。',
    replies: [
      '我有个想法：先做一个最简单的版本，让用户今天就能用上。',
      '{sender}说得对！我们可以把这个拆成三步，第一步先验证需求。',
      '要不要加一个新手引导？第一次打开的体验很关键。',
      '我觉得方向没问题，接下来要定优先级。',
    ],
  },
  {
    name: '阿蓝',
    avatar: { shape: 'square', color: 'blue' },
    role: '安全顾问',
    persona: '冷静的工程师，关注安全和可行性，说话简洁。',
    replies: [
      '技术上可行，但要注意接口的频率限制。',
      '同意。建议先写测试，再动手实现。',
      '这里有个风险：数据要做好备份。',
      '{sender}，我估算一下，两天能出第一版。',
    ],
  },
  {
    name: '小绿',
    avatar: { shape: 'egg', color: 'green' },
    role: '交互设计',
    persona: '细心的设计师，关注交互体验，喜欢提问。',
    replies: [
      '用户在这一步会不会迷路？我想画个流程图确认一下。',
      '按钮可以再大一点，单手操作更方便。',
      '{sender}的方案我喜欢，颜色上可以再柔和一些。',
      '我们是不是该先找几位用户聊聊？',
    ],
  },
];

export const WELCOME_MESSAGE =
  '欢迎来到演示群！这里的三位都是模拟成员，不需要任何 Key。试试发送「@小橙 你好」，或者同时 @ 好几位，看看成员之间怎么接力。';

/**
 * On first start (no members, no groups) creates a demo group with mock
 * members. `addWelcome` posts the welcome notice into the new group.
 */
export async function seedIfEmpty(
  directory: Directory,
  addWelcome: (groupId: string, content: string) => Promise<unknown>,
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
      config: { replies: JSON.stringify(m.replies), mentionRate: '0.85' },
      secrets: {},
    });
    if (created.ok) ids.push(created.value.id);
  }
  const group = await directory.createGroup('演示群', ids);
  if (group.ok) await addWelcome(group.value.id, WELCOME_MESSAGE);
  return true;
}
