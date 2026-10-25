import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockAdapter } from '../src/adapters/mock.js';
import { createOpenAICompatibleAdapter } from '../src/adapters/openai-compatible.js';
import type { ContextMessage, MemberAdapter, ReplyContext } from '../src/adapters/types.js';
import { AdapterRegistry } from '../src/adapters/registry.js';
import { buildChatMessages } from '../src/context.js';
import { Coordinator } from '../src/coordinator.js';
import { SecretBox } from '../src/crypto.js';
import { SqlDirectory } from '../src/directory.js';
import {
  classifyFile,
  extractPdfText,
  fileKey,
  MAX_IMAGES_PER_REQUEST,
  MAX_TEXT_CHARS_PER_FILE,
  MemoryFileStore,
  sanitizeFileName,
  signFileLink,
  verifyFileLink,
} from '../src/files.js';
import { IntegrationRegistry } from '../src/integrations/registry.js';
import { SqlRoom } from '../src/room.js';
import { UserError, type Attachment } from '../src/types.js';
import { registerUpload, resolveForContext } from '../src/uploads.js';
import { makePdf, TINY_PNG } from './pdf.js';
import { memoryDriver } from './sqlite.js';

const limits = { maxHops: 5, maxReplies: 10, contextSize: 30, llmTimeoutMs: 5000, userDisplayName: '用户' };

describe('file classification', () => {
  it('recognises images, PDFs, text and code, and rejects the rest', () => {
    expect(classifyFile('a.png', 'image/png')).toEqual({ kind: 'image', mime: 'image/png' });
    expect(classifyFile('photo.JPG', 'application/octet-stream')).toEqual({ kind: 'image', mime: 'image/jpeg' });
    expect(classifyFile('doc.pdf', 'application/pdf')).toEqual({ kind: 'pdf', mime: 'application/pdf' });
    expect(classifyFile('scan', 'application/pdf')?.kind).toBe('pdf');
    expect(classifyFile('notes.txt', 'text/plain')).toEqual({ kind: 'text', mime: 'text/plain' });
    expect(classifyFile('main.rs', 'application/octet-stream')?.kind).toBe('text');
    expect(classifyFile('data.json', 'application/json')?.kind).toBe('text');
    expect(classifyFile('Makefile', '')?.kind).toBe('text');
    // Active content and binaries are not accepted: an SVG could carry scripts.
    expect(classifyFile('logo.svg', 'image/svg+xml')).toBeNull();
    expect(classifyFile('app.exe', 'application/x-msdownload')).toBeNull();
    expect(classifyFile('archive.zip', 'application/zip')).toBeNull();
  });

  it('cleans file names', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\me\\报告.pdf')).toBe('报告.pdf');
    expect(sanitizeFileName('a"b<c>.txt')).toBe('abc.txt');
    expect(sanitizeFileName('')).toBe('文件');
    expect(sanitizeFileName('x'.repeat(300)).length).toBe(120);
  });
});

describe('signed download links', () => {
  it('accepts a fresh signature and rejects tampering and expiry', async () => {
    const exp = Date.now() + 60_000;
    const sig = await signFileLink('secret-0123456789abcdef', 'g1', 'f1', exp);
    expect(await verifyFileLink('secret-0123456789abcdef', 'g1', 'f1', exp, sig)).toBe(true);
    expect(await verifyFileLink('secret-0123456789abcdef', 'g1', 'f2', exp, sig)).toBe(false);
    expect(await verifyFileLink('secret-0123456789abcdef', 'g2', 'f1', exp, sig)).toBe(false);
    expect(await verifyFileLink('other-secret-0123456789', 'g1', 'f1', exp, sig)).toBe(false);
    expect(await verifyFileLink('secret-0123456789abcdef', 'g1', 'f1', exp + 1, sig)).toBe(false);
    const past = Date.now() - 1;
    expect(await verifyFileLink('secret-0123456789abcdef', 'g1', 'f1', past, await signFileLink('secret-0123456789abcdef', 'g1', 'f1', past))).toBe(false);
    expect(await verifyFileLink('secret-0123456789abcdef', 'g1', 'f1', exp, '')).toBe(false);
  });
});

describe('PDF text', () => {
  it('extracts the text of a PDF and stores it at upload time', async () => {
    expect(await extractPdfText(makePdf('Hello PDF world'))).toBe('Hello PDF world');

    const room = new SqlRoom(memoryDriver());
    const files = new MemoryFileStore();
    const bytes = makePdf('Quarterly report');
    await files.put(fileKey('g', 'p1'), bytes, { contentType: 'application/pdf', name: 'r.pdf' });
    const att = await registerUpload(room, files, 'g', { id: 'p1', name: 'r.pdf', mime: 'application/pdf', size: bytes.length, kind: 'pdf' });
    expect(room.uploadText(att.id)).toBe('Quarterly report');

    // A file that is not a real PDF is kept but has no text.
    await files.put(fileKey('g', 'p2'), new TextEncoder().encode('not a pdf'), { contentType: 'application/pdf', name: 'bad.pdf' });
    await registerUpload(room, files, 'g', { id: 'p2', name: 'bad.pdf', mime: 'application/pdf', size: 9, kind: 'pdf' });
    expect(room.uploadText('p2')).toBeNull();
  });
});

describe('what a model sees', () => {
  const setup = async () => {
    const room = new SqlRoom(memoryDriver());
    const files = new MemoryFileStore();
    const upload = async (att: Attachment, bytes: Uint8Array) => {
      await files.put(fileKey('g', att.id), bytes, { contentType: att.mime, name: att.name });
      await registerUpload(room, files, 'g', att);
      return att;
    };
    const send = (attachments: Attachment[], content = '看看') => {
      const m = room.addMessage({ groupId: 'g', senderKind: 'user', senderId: null, senderName: '用户', content, attachments });
      room.claimUploads(attachments.map((a) => a.id), m.id);
      return m;
    };
    return { room, files, upload, send };
  };
  const text = (name: string, body: string): [Attachment, Uint8Array] => [
    { id: `t-${name}`, name, mime: 'text/plain', size: body.length, kind: 'text' },
    new TextEncoder().encode(body),
  ];
  const image = (id: string, bytes = TINY_PNG): [Attachment, Uint8Array] => [{ id, name: `${id}.png`, mime: 'image/png', size: bytes.length, kind: 'image' }, bytes];

  it('includes text files and PDF text, and clips long files', async () => {
    const { room, files, upload, send } = await setup();
    const a = await upload(...text('notes.txt', 'line one\nline two'));
    const long = await upload(...text('big.ts', 'x'.repeat(MAX_TEXT_CHARS_PER_FILE + 500)));
    const pdfBytes = makePdf('PDF body');
    const pdf = await upload({ id: 'pdf1', name: 'a.pdf', mime: 'application/pdf', size: pdfBytes.length, kind: 'pdf' }, pdfBytes);
    const m = send([a, long, pdf]);
    const resolved = (await resolveForContext(room, files, 'g', [m], { images: true })).get(m.id)!;
    expect(resolved[0]).toMatchObject({ name: 'notes.txt', text: 'line one\nline two' });
    expect(resolved[1].text!.length).toBeLessThan(MAX_TEXT_CHARS_PER_FILE + 100);
    expect(resolved[1].text).toContain('只发送了前');
    expect(resolved[2]).toMatchObject({ name: 'a.pdf', text: 'PDF body' });
  });

  it('sends only the newest images and says what was left out', async () => {
    const { room, files, upload, send } = await setup();
    const messages = [];
    for (let i = 0; i < MAX_IMAGES_PER_REQUEST + 2; i++) messages.push(send([await upload(...image(`img${i}`))], `图${i}`));
    const resolved = await resolveForContext(room, files, 'g', messages, { images: true });
    const sent = messages.filter((m) => resolved.get(m.id)![0].image);
    expect(sent.map((m) => m.content)).toEqual(['图2', '图3', '图4', '图5']);
    expect(resolved.get(messages[0].id)![0].note).toContain('较早');

    const none = await resolveForContext(room, files, 'g', messages, { images: false });
    expect(none.get(messages[5].id)![0]).toMatchObject({ note: '当前模型看不到图片' });
    expect(none.get(messages[5].id)![0].image).toBeUndefined();
  });

  it('notes files that are gone, empty or scanned', async () => {
    const { room, files, upload, send } = await setup();
    const t = await upload(...text('empty.txt', '   '));
    const gone = await upload(...text('gone.txt', 'x'));
    files.items.delete(fileKey('g', gone.id));
    const m = send([t, gone]);
    const [empty, missing] = (await resolveForContext(room, files, 'g', [m], { images: true })).get(m.id)!;
    expect(empty.note).toBe('文件是空的');
    expect(missing.note).toBe('文件已经不在了');
  });

  it('turns files into the chat messages: text inline, images as parts, neighbours merged', () => {
    const ctx = (history: ContextMessage[]): ReplyContext => ({
      groupName: '群',
      self: { id: 'a', name: '小青', persona: '' },
      others: [{ name: '用户', persona: '', isHuman: true }],
      history,
      trigger: history.at(-1)!,
      supportsImages: true,
      signal: new AbortController().signal,
    });
    const m = (id: string, content: string, attachments?: ContextMessage['attachments']): ContextMessage => ({
      id,
      senderKind: 'user',
      senderName: '用户',
      isSelf: false,
      content,
      attachments,
    });
    const history = [
      m('1', '先看代码', [{ name: 'a.py', kind: 'text', text: 'print(1)' }]),
      m('2', '再看图', [{ name: 'p.png', kind: 'image', image: { mime: 'image/png', base64: 'AAAA' } }]),
      m('3', '@小青 怎么样', [{ name: 'r.pdf', kind: 'pdf', text: 'Report text' }, { name: 'old.png', kind: 'image', note: '较早的图片，没有再发给模型' }]),
    ];
    const out = buildChatMessages(ctx(history));
    expect(out.map((x) => x.role)).toEqual(['system', 'user']);
    const content = out[1].content as any[];
    expect(Array.isArray(content)).toBe(true);
    expect(content.filter((p) => p.type === 'image_url')).toEqual([{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }]);
    const joined = content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    expect(joined).toContain('用户: 先看代码');
    expect(joined).toContain('【文件：a.py】\n```\nprint(1)\n```');
    expect(joined).toContain('[图片：p.png]');
    expect(joined).toContain('【PDF：r.pdf，以下是提取出的文字】\nReport text');
    expect(joined).toContain('[图片：old.png（较早的图片，没有再发给模型）]');

    // Without images the same history is plain text.
    const plain = buildChatMessages(ctx(history), { images: false });
    expect(typeof plain[1].content).toBe('string');
    expect(plain[1].content).toContain('[图片：p.png（当前模型看不到图片）]');
  });
});

describe('OpenAI-compatible adapter with images', () => {
  let server: Server | undefined;
  afterEach(() => server?.close());

  const fake = async (handler: (body: any) => { status?: number; text?: string }) => {
    const bodies: any[] = [];
    server = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        const body = JSON.parse(data);
        bodies.push(body);
        const { status = 200, text = '好的' } = handler(body);
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(status === 200 ? { choices: [{ message: { content: text } }] } : { error: { message: 'bad request' } }));
      });
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    return { baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, bodies };
  };

  const withImage = (): ReplyContext => {
    const trigger: ContextMessage = {
      id: '1',
      senderKind: 'user',
      senderName: '用户',
      isSelf: false,
      content: '这是什么',
      attachments: [{ name: 'p.png', kind: 'image', image: { mime: 'image/png', base64: 'AAAA' } }],
    };
    return {
      groupName: '群',
      self: { id: 'a', name: '小青', persona: '' },
      others: [{ name: '用户', persona: '', isHuman: true }],
      history: [trigger],
      trigger,
      supportsImages: true,
      signal: new AbortController().signal,
    };
  };

  it('sends images as image_url parts', async () => {
    const { baseUrl, bodies } = await fake(() => ({}));
    await createOpenAICompatibleAdapter().reply(withImage(), { baseUrl, apiKey: 'k', model: 'm' });
    const user = bodies[0].messages.at(-1);
    expect(user.role).toBe('user');
    expect(user.content.find((p: any) => p.type === 'image_url')).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } });
  });

  it('retries without the image when the model rejects it', async () => {
    const { baseUrl, bodies } = await fake((body) =>
      JSON.stringify(body).includes('image_url') ? { status: 400 } : { text: '我看不到图，但可以聊聊。' },
    );
    const text = await createOpenAICompatibleAdapter().reply(withImage(), { baseUrl, apiKey: 'k', model: 'm' });
    expect(text).toBe('我看不到图，但可以聊聊。');
    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[1])).not.toContain('image_url');
    expect(JSON.stringify(bodies[1])).toContain('当前模型看不到图片');
  });

  it('offers a "vision" switch in the member form', () => {
    const field = createOpenAICompatibleAdapter().fields.find((f) => f.key === 'vision')!;
    expect(field).toMatchObject({ kind: 'boolean', required: false, defaultValue: 'true' });
  });
});

describe('attachments in the coordinator', () => {
  const setup = async (adapter: MemberAdapter) => {
    const db = memoryDriver();
    const directory = new SqlDirectory(db, new SecretBox('s'.repeat(20)));
    const room = new SqlRoom(db);
    const member = await directory.createMember({
      name: '甲',
      type: adapter.type,
      avatar: { shape: 'cloud', color: 'blue' },
      role: '',
      persona: '',
      config: {},
      secrets: {},
    });
    const group = await directory.createGroup('群', member.ok ? [member.value.id] : []);
    const files = new MemoryFileStore();
    const coordinator = new Coordinator(room, directory, new AdapterRegistry().register(adapter), new IntegrationRegistry(), files, () => {}, limits);
    if (!group.ok) throw new Error(group.error);
    const upload = async (name: string, body: string | Uint8Array, kind: Attachment['kind'], mime: string) => {
      const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
      const att: Attachment = { id: crypto.randomUUID(), name, mime, size: bytes.length, kind };
      await files.put(fileKey(group.value.id, att.id), bytes, { contentType: mime, name });
      return registerUpload(room, files, group.value.id, att);
    };
    const run = async () => {
      while (await coordinator.step(group.value.id));
    };
    return { room, coordinator, group: group.value, upload, run };
  };

  it('delivers the files with the message, in the right order, once', async () => {
    let seen: ReplyContext | undefined;
    const spy: MemberAdapter = { type: 'spy', label: 's', description: '', fields: [], reply: async (ctx) => ((seen = ctx), '收到') };
    const { room, coordinator, group, upload, run } = await setup(spy);
    const doc = await upload('todo.md', '# 待办\n- 买牛奶', 'text', 'text/plain');
    const img = await upload('cat.png', TINY_PNG, 'image', 'image/png');

    const { message, pending } = await coordinator.postUserMessage(group.id, '@甲 看看', [doc.id, img.id]);
    expect(pending).toBe(true);
    expect(message.attachments!.map((a) => a.name)).toEqual(['todo.md', 'cat.png']);
    expect(room.getMessage(message.id)!.attachments).toHaveLength(2);
    await run();

    const trigger = seen!.trigger.attachments!;
    expect(trigger[0]).toMatchObject({ name: 'todo.md', text: '# 待办\n- 买牛奶' });
    expect(trigger[1].image).toMatchObject({ mime: 'image/png' });
    expect(seen!.supportsImages).toBe(true);

    await expect(coordinator.postUserMessage(group.id, '再发一次', [doc.id])).rejects.toMatchObject({ status: 409 });
    await expect(coordinator.postUserMessage(group.id, 'x', ['missing'])).rejects.toBeInstanceOf(UserError);
    // A failed send leaves nothing behind.
    expect(room.recentMessages(group.id, 10)).toHaveLength(2);
  });

  it('does not send images to a member whose model cannot see them', async () => {
    let seen: ReplyContext | undefined;
    const spy: MemberAdapter = { type: 'spy', label: 's', description: '', fields: [], reply: async (ctx) => ((seen = ctx), '收到') };
    const db = memoryDriver();
    const directory = new SqlDirectory(db, new SecretBox('s'.repeat(20)));
    const room = new SqlRoom(db);
    const member = await directory.createMember({ name: '乙', type: 'spy', avatar: { shape: 'cloud', color: 'blue' }, role: '', persona: '', config: { vision: 'false' }, secrets: {} });
    const group = await directory.createGroup('群', member.ok ? [member.value.id] : []);
    if (!group.ok) throw new Error(group.error);
    const files = new MemoryFileStore();
    const coordinator = new Coordinator(room, directory, new AdapterRegistry().register(spy), new IntegrationRegistry(), files, () => {}, limits);
    await files.put(fileKey(group.value.id, 'i1'), TINY_PNG, { contentType: 'image/png', name: 'c.png' });
    await registerUpload(room, files, group.value.id, { id: 'i1', name: 'c.png', mime: 'image/png', size: TINY_PNG.length, kind: 'image' });
    await coordinator.postUserMessage(group.value.id, '@乙 看图', ['i1']);
    while (await coordinator.step(group.value.id));
    expect(seen!.supportsImages).toBe(false);
    expect(seen!.trigger.attachments![0]).toMatchObject({ note: '当前模型看不到图片' });
    expect(seen!.trigger.attachments![0].image).toBeUndefined();
  });

  it('lets a mock member say it received the files', async () => {
    const { room, coordinator, group, upload, run } = await setup(createMockAdapter({ random: () => 0.99 }));
    const doc = await upload('a.txt', 'hi', 'text', 'text/plain');
    const pdf = await upload('b.pdf', makePdf('x'), 'pdf', 'application/pdf');
    await coordinator.postUserMessage(group.id, '@甲 请看', [doc.id, pdf.id]);
    await run();
    expect(room.recentMessages(group.id, 10).at(-1)!.content).toMatch(/^收到你发的2 个文件：a\.txt、b\.pdf。/);
  });

  it('lets a direct chat carry just a file, with no text', async () => {
    const { room, coordinator, group, upload, run } = await setup(createMockAdapter({ random: () => 0.99 }));
    const doc = await upload('only.txt', 'x', 'text', 'text/plain');
    const { message } = await coordinator.postUserMessage(group.id, '', [doc.id]);
    expect(message.content).toBe('');
    // This group has one member but is a normal group: no @ means no reply.
    await run();
    expect(room.recentMessages(group.id, 10)).toHaveLength(1);
  });
});
