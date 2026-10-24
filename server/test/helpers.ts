import type { Config } from '../src/config.js';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    host: '127.0.0.1',
    port: 0,
    token: 'test-token-0123456789',
    secret: 'test-secret-0123456789',
    dbPath: ':memory:',
    maxHops: 5,
    maxReplies: 10,
    contextSize: 30,
    llmTimeoutMs: 5000,
    userDisplayName: '用户',
    mockDelayMs: [0, 0],
    ...overrides,
  };
}
