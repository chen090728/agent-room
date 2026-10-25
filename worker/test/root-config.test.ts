import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'jsonc-parser';
import { describe, expect, it } from 'vitest';

const read = (path: string) => parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));

describe('root wrangler.jsonc (used by the Deploy to Cloudflare button)', () => {
  it('describes the same Worker as worker/wrangler.jsonc', () => {
    const { $schema: _a, main: mainA, ...root } = read('../../wrangler.jsonc');
    const { $schema: _b, main: mainB, ...worker } = read('../wrangler.jsonc');
    expect(root).toEqual(worker);
    expect(mainA).toBe(`worker/${mainB}`);
  });

  it('lists exactly the secrets the Worker reads', () => {
    const example = readFileSync(fileURLToPath(new URL('../../.dev.vars.example', import.meta.url)), 'utf8');
    const names = example.split('\n').filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split('=')[0]);
    expect(names).toEqual(['AGENTHUB_TOKEN', 'AGENTHUB_SECRET']);
  });
});
