import type { CoordinatorOptions } from './coordinator.js';

export interface Limits extends CoordinatorOptions {
  /** Delay range before mock members answer, so the chat feels alive. */
  mockDelayMs: [number, number];
}

type Env = Record<string, string | undefined>;

function int(env: Env, key: string, fallback: number, min = 1): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`${key} must be an integer >= ${min}`);
  return n;
}

/** Reads the coordinator limits shared by every deployment target. */
export function parseLimits(env: Env): Limits {
  const delay = (env.MOCK_DELAY_MS ?? '400-1400').split('-').map(Number);
  return {
    maxHops: int(env, 'MAX_HOPS', 5),
    maxReplies: int(env, 'MAX_REPLIES', 10),
    contextSize: int(env, 'CONTEXT_SIZE', 30),
    llmTimeoutMs: int(env, 'LLM_TIMEOUT_MS', 60000),
    userDisplayName: env.USER_DISPLAY_NAME || '用户',
    deployPollMs: int(env, 'DEPLOY_POLL_MS', 10000),
    mockDelayMs: [delay[0] || 0, delay[1] ?? delay[0] ?? 0],
  };
}

/** Problems with AGENTHUB_TOKEN / AGENTHUB_SECRET, empty when both are usable. */
export function secretProblems(env: Env): string[] {
  const problems: string[] = [];
  if ((env.AGENTHUB_TOKEN ?? '').length < 16) problems.push('AGENTHUB_TOKEN 没有设置或少于 16 位');
  if ((env.AGENTHUB_SECRET ?? '').length < 16) problems.push('AGENTHUB_SECRET 没有设置或少于 16 位');
  return problems;
}
