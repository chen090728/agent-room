import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createOpenAICompatibleAdapter } from '../src/adapters/openai-compatible.js';
import type { ReplyContext } from '../src/adapters/types.js';
import type { ToolRuntime } from '../src/integrations/types.js';

let server: Server | undefined;
afterEach(() => server?.close());

async function fakeLlm(handler: (body: any, n: number) => { status?: number; message?: any }) {
  const bodies: any[] = [];
  server = createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      const body = JSON.parse(data);
      bodies.push(body);
      const { status = 200, message } = handler(body, bodies.length);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status === 200 ? { choices: [{ message }] } : { error: { message: 'tools not supported' } }));
    });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, bodies };
}

const trigger = { id: '1', senderKind: 'user' as const, senderName: '用户', isSelf: false, content: '@小青 看看代码' };
const context = (tools?: ToolRuntime): ReplyContext => ({
  groupName: '群',
  self: { id: 'a', name: '小青', persona: '' },
  others: [{ name: '用户', persona: '', isHuman: true }],
  history: [trigger],
  trigger,
  tools,
  supportsImages: true,
  signal: new AbortController().signal,
});
const runtime = (calls: string[]): ToolRuntime => ({
  instructions: '本群绑定了仓库。',
  cards: [],
  tools: [
    {
      name: 'read_file',
      description: 'read',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      run: async (args) => {
        calls.push(String(args.path));
        if (args.path === 'boom') throw new Error('读取失败');
        return `内容:${args.path}`;
      },
    },
  ],
});

describe('OpenAI-compatible adapter with tools', () => {
  it('runs tool calls until the model answers in text', async () => {
    const calls: string[] = [];
    const { baseUrl, bodies } = await fakeLlm((_body, n) =>
      n === 1
        ? { message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.ts"}' } }, { id: 'c2', type: 'function', function: { name: 'read_file', arguments: '{"path":"boom"}' } }] } }
        : { message: { content: '看完了。' } },
    );
    const adapter = createOpenAICompatibleAdapter();
    const text = await adapter.reply(context(runtime(calls)), { baseUrl, apiKey: 'k', model: 'm' });
    expect(text).toBe('看完了。');
    expect(calls).toEqual(['a.ts', 'boom']);

    expect(bodies[0].tools).toEqual([{ type: 'function', function: { name: 'read_file', description: 'read', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }]);
    expect(bodies[0].messages[0].content).toContain('本群绑定了仓库');
    const second = bodies[1].messages;
    expect(second.at(-3)).toMatchObject({ role: 'assistant', tool_calls: expect.any(Array) });
    expect(second.at(-2)).toEqual({ role: 'tool', tool_call_id: 'c1', content: '内容:a.ts' });
    expect(second.at(-1)).toEqual({ role: 'tool', tool_call_id: 'c2', content: '工具出错：读取失败' });
  });

  it('does not send tools when the conversation has none', async () => {
    const { baseUrl, bodies } = await fakeLlm(() => ({ message: { content: 'hi' } }));
    await createOpenAICompatibleAdapter().reply(context(), { baseUrl, apiKey: 'k', model: 'm' });
    expect(bodies[0]).not.toHaveProperty('tools');
  });

  it('falls back to a plain answer when the service rejects tools', async () => {
    const { baseUrl, bodies } = await fakeLlm((body) => (body.tools ? { status: 400 } : { message: { content: '不用工具也能答。' } }));
    const text = await createOpenAICompatibleAdapter().reply(context(runtime([])), { baseUrl, apiKey: 'k', model: 'm' });
    expect(text).toBe('不用工具也能答。');
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).not.toHaveProperty('tools');
  });

  it('forces a text answer on the last round instead of looping forever', async () => {
    const { baseUrl, bodies } = await fakeLlm((body) =>
      body.tools
        ? { message: { content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'read_file', arguments: '{"path":"x"}' } }] } }
        : { message: { content: '好吧，我直接回答。' } },
    );
    const text = await createOpenAICompatibleAdapter().reply(context(runtime([])), { baseUrl, apiKey: 'k', model: 'm' });
    expect(text).toBe('好吧，我直接回答。');
    expect(bodies).toHaveLength(6);
    expect(bodies.at(-1)).not.toHaveProperty('tools');
  });

  it('does not leak the API key in errors', async () => {
    const { baseUrl } = await fakeLlm(() => ({ status: 401 }));
    const err = await createOpenAICompatibleAdapter().reply(context(), { baseUrl, apiKey: 'sk-very-secret', model: 'm' }).catch((e) => e as Error);
    expect((err as Error).message).toContain('401');
    expect((err as Error).message).not.toContain('sk-very-secret');
  });
});
