// The default deployment has no R2 bucket: everything else must work and uploads must say why they are off.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWrangler, TOKEN, type Wrangler } from './harness.js';

let wrangler: Wrangler;
const headers = { Authorization: `Bearer ${TOKEN}` };

beforeAll(async () => {
  wrangler = await startWrangler({ r2: false });
}, 120_000);

afterAll(() => wrangler?.stop());

describe('Worker without R2', () => {
  it('still chats, and explains that uploads are unavailable', async () => {
    const groups = await (await fetch(`${wrangler.baseUrl}/api/groups`, { headers })).json();
    const direct = groups.find((g: any) => g.kind === 'direct' && g.name === '小橙');

    const upload = await fetch(`${wrangler.baseUrl}/api/groups/${direct.id}/uploads`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'text/plain', 'X-File-Name': 'a.txt' },
      body: 'hello',
    });
    expect(upload.status).toBe(503);
    expect((await upload.json()).error).toContain('R2');

    const sent = await fetch(`${wrangler.baseUrl}/api/groups/${direct.id}/messages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '你好' }),
    });
    expect(sent.status).toBe(201);
    const bad = await fetch(`${wrangler.baseUrl}/api/groups/${direct.id}/messages`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'x', attachments: ['nope'] }),
    });
    expect(bad.status).toBe(404);
  });
});
