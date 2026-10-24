export interface Config {
  host: string;
  port: number;
  token: string;
  secret: string;
  dbPath: string;
  maxHops: number;
  maxReplies: number;
  contextSize: number;
  llmTimeoutMs: number;
  userDisplayName: string;
  /** Extra delay before mock members answer, so the chat feels alive. */
  mockDelayMs: [number, number];
}

function int(env: NodeJS.ProcessEnv, key: string, fallback: number, min = 1): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new Error(`${key} must be an integer >= ${min}`);
  return n;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = env.AGENTHUB_TOKEN ?? '';
  const secret = env.AGENTHUB_SECRET ?? '';
  const problems: string[] = [];
  if (token.length < 16) problems.push('AGENTHUB_TOKEN is missing or shorter than 16 characters');
  if (secret.length < 16) problems.push('AGENTHUB_SECRET is missing or shorter than 16 characters');
  if (problems.length) {
    throw new Error(
      `${problems.join('; ')}.\nRun \`npm run init-env\` to create a .env with random values, or see .env.example.`,
    );
  }
  return {
    host: env.HOST || '0.0.0.0',
    port: int(env, 'PORT', 8787, 0),
    token,
    secret,
    dbPath: env.DB_PATH || './data/agenthub.db',
    maxHops: int(env, 'MAX_HOPS', 5),
    maxReplies: int(env, 'MAX_REPLIES', 10),
    contextSize: int(env, 'CONTEXT_SIZE', 30),
    llmTimeoutMs: int(env, 'LLM_TIMEOUT_MS', 60000),
    userDisplayName: env.USER_DISPLAY_NAME || '用户',
    mockDelayMs: [400, 1400],
  };
}
