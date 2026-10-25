import { buildChatMessages } from '../context.js';
import type { MemberAdapter } from './types.js';

/** Tool-calling rounds per reply; the last round is forced to answer in text. */
const MAX_TOOL_ROUNDS = 6;
const MAX_TOOL_RESULT_CHARS = 80_000;

class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Talks to any service exposing an OpenAI-style `POST {baseUrl}/chat/completions`.
 * No provider is hard-coded: the user supplies base URL, key and model name.
 * When the conversation has tools (e.g. a bound GitHub repository) they are
 * offered through the standard function-calling interface.
 */
export function createOpenAICompatibleAdapter(fetchImpl: typeof fetch = fetch): MemberAdapter {
  return {
    type: 'openai-compatible',
    label: 'OpenAI 兼容接口',
    description: '填写接口地址、API Key 和模型名，适用于任何兼容 /chat/completions 的服务。',
    fields: [
      { key: 'baseUrl', label: '接口地址', kind: 'url', required: true, placeholder: 'https://api.example.com/v1' },
      { key: 'apiKey', label: 'API Key', kind: 'password', required: true, placeholder: 'sk-…', secret: true },
      { key: 'model', label: '模型名', kind: 'text', required: true, placeholder: '填写服务商提供的模型名' },
      { key: 'vision', label: '支持看图', kind: 'boolean', required: false, defaultValue: 'true' },
    ],

    async reply(ctx, config) {
      const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const hasImages = ctx.history.some((m) => m.attachments?.some((a) => a.image));
      let useImages = hasImages;
      let messages: any[] = buildChatMessages(ctx, { images: useImages });
      const tools = ctx.tools?.tools ?? [];
      const toolSpecs = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
      let useTools = tools.length > 0;

      const call = async (withTools: boolean) => {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify({ model: config.model, messages, ...(withTools ? { tools: toolSpecs } : {}) }),
          signal: ctx.signal,
        });
        const body = await res.text();
        if (!res.ok) throw new HttpError(`接口返回 ${res.status}：${redact(body, config.apiKey).slice(0, 200)}`, res.status);
        try {
          return JSON.parse(body);
        } catch {
          throw new Error('接口返回的不是 JSON');
        }
      };

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const offerTools = useTools && round < MAX_TOOL_ROUNDS - 1;
        let data: any;
        try {
          data = await call(offerTools);
        } catch (err) {
          // A 400/422 on the first request usually means the model cannot take images or tools.
          // Drop images first (they are the likelier cause), then tools, and try again.
          if (round === 0 && err instanceof HttpError && (err.status === 400 || err.status === 422)) {
            if (useImages) {
              useImages = false;
              messages = buildChatMessages(ctx, { images: false });
              continue;
            }
            if (offerTools) {
              useTools = false;
              continue;
            }
          }
          throw err;
        }

        const message = data?.choices?.[0]?.message;
        const toolCalls = message?.tool_calls;
        if (offerTools && Array.isArray(toolCalls) && toolCalls.length) {
          messages.push({ role: 'assistant', content: message.content ?? null, tool_calls: toolCalls });
          for (const c of toolCalls) {
            messages.push({ role: 'tool', tool_call_id: c.id, content: await runTool(tools, c) });
          }
          continue;
        }

        const content = message?.content;
        const text = Array.isArray(content)
          ? content.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('')
          : content;
        if (typeof text === 'string' && text.trim()) return text;
        // A reply that only used tools may legitimately have no text; the coordinator handles cards.
        if (ctx.tools?.cards.length) return '';
        throw new Error('接口没有返回内容');
      }
      throw new Error('工具调用轮数太多');
    },
  };
}

async function runTool(tools: NonNullable<Parameters<MemberAdapter['reply']>[0]['tools']>['tools'], call: any): Promise<string> {
  const name = call?.function?.name;
  const tool = tools.find((t) => t.name === name);
  if (!tool) return `没有这个工具：${name}`;
  try {
    const args = JSON.parse(call.function.arguments || '{}');
    const out = await tool.run(args && typeof args === 'object' ? args : {});
    return out.length > MAX_TOOL_RESULT_CHARS ? `${out.slice(0, MAX_TOOL_RESULT_CHARS)}\n…（结果太长，已截断）` : out;
  } catch (err) {
    return `工具出错：${err instanceof Error ? err.message : String(err)}`;
  }
}

function redact(text: string, key: string): string {
  return key ? text.split(key).join('***') : text;
}
