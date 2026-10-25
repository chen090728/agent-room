import { BRIDGE_TOOLS } from '../bridge.js';
import { buildBridgePrompt } from '../context.js';
import type { MemberAdapter } from './types.js';

/**
 * A "work assistant": a coding tool (Claude Code or Codex) already installed
 * and logged in on the user's own computer, reached through a bridge program
 * that connects out to this server. AgentHub never sees any login of those tools.
 */
export function createBridgeAdapter(): MemberAdapter {
  return {
    type: 'bridge',
    label: '工作助手',
    description: '通过你电脑上运行的 bridge，调用电脑里已经登录的 Claude Code 或 Codex。',
    fields: [
      { key: 'tool', label: '工具', kind: 'text', required: true, defaultValue: 'claude', placeholder: 'claude 或 codex' },
      { key: 'write', label: '允许修改文件', kind: 'boolean', required: false, defaultValue: 'false' },
    ],

    validate(config) {
      const tool = (config.tool ?? '').trim();
      return tool in BRIDGE_TOOLS ? null : `工具要写 ${Object.keys(BRIDGE_TOOLS).join(' 或 ')}`;
    },

    async reply(ctx, config) {
      if (!ctx.bridge) throw new Error('这个服务器没有启用 bridge');
      if (!config.bridgeId) throw new Error('还没有和电脑配对：到助手的设置里取配对码，再在电脑上运行配对命令');
      const tool = config.tool ?? '';
      if (!(tool in BRIDGE_TOOLS)) throw new Error(`不支持的工具：${tool}`);
      const text = await ctx.bridge.run(config.bridgeId, {
        tool,
        prompt: buildBridgePrompt(ctx, BRIDGE_TOOLS[tool]!),
        write: config.write === 'true',
      });
      const answer = text.trim();
      if (!answer) throw new Error(`${BRIDGE_TOOLS[tool]} 没有返回内容`);
      return answer;
    },
  };
}
