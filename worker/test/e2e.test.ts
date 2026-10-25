// Runs the shared end-to-end suite against the Worker under `wrangler dev`,
// with the R2 file bucket enabled (as the deploy workflow does when it can).
import { defineE2ESuite } from '@agenthub/core/testing';
import { afterAll, beforeAll } from 'vitest';
import { startWrangler, TOKEN, type Wrangler } from './harness.js';

let wrangler: Wrangler;

beforeAll(async () => {
  wrangler = await startWrangler({ r2: true });
}, 120_000);

afterAll(() => wrangler?.stop());

defineE2ESuite('Cloudflare Worker + Durable Objects (wrangler dev)', () => ({ baseUrl: wrangler.baseUrl, token: TOKEN }));
