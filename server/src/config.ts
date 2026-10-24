import { parseLimits, secretProblems, type Limits } from '@agenthub/core';

export interface Config extends Limits {
  host: string;
  port: number;
  token: string;
  secret: string;
  dbPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const problems = secretProblems(env);
  if (problems.length) {
    throw new Error(`${problems.join('；')}。\n运行 \`npm run init-env\` 生成带随机值的 .env，或参考 .env.example。`);
  }
  const port = Number(env.PORT || 8787);
  if (!Number.isInteger(port) || port < 0) throw new Error('PORT must be an integer');
  return {
    ...parseLimits(env),
    host: env.HOST || '0.0.0.0',
    port,
    token: env.AGENTHUB_TOKEN!,
    secret: env.AGENTHUB_SECRET!,
    dbPath: env.DB_PATH || './data/agenthub.db',
  };
}
