import { buildChatMessages } from '../context.js';
import type { MemberAdapter } from './types.js';

/**
 * Talks to any service exposing an OpenAI-style `POST {baseUrl}/chat/completions`.
 * No provider is hard-coded: the user supplies base URL, key and model name.
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
    ],

    async reply(ctx, config) {
      const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ model: config.model, messages: buildChatMessages(ctx) }),
        signal: ctx.signal,
      });
      const body = await res.text();
      if (!res.ok) {
        throw new Error(`接口返回 ${res.status}：${redact(body, config.apiKey).slice(0, 200)}`);
      }
      let data: any;
      try {
        data = JSON.parse(body);
      } catch {
        throw new Error('接口返回的不是 JSON');
      }
      const content = data?.choices?.[0]?.message?.content;
      const text = Array.isArray(content)
        ? content.map((p: any) => (typeof p === 'string' ? p : p?.text ?? '')).join('')
        : content;
      if (typeof text !== 'string' || !text.trim()) throw new Error('接口没有返回内容');
      return text;
    },
  };
}

function redact(text: string, key: string): string {
  return key ? text.split(key).join('***') : text;
}
