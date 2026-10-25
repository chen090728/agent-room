import type { DirectoryDO } from './directory-do.js';
import type { GroupDO } from './group-do.js';

export interface Env {
  DIRECTORY: DurableObjectNamespace<DirectoryDO>;
  GROUPS: DurableObjectNamespace<GroupDO>;
  /** R2 bucket for uploaded files; absent when R2 is not enabled for the account. */
  FILES?: R2Bucket;
  // Wrangler secrets
  AGENTHUB_TOKEN?: string;
  AGENTHUB_SECRET?: string;
  // Plain vars from wrangler.jsonc
  MAX_HOPS?: string;
  MAX_REPLIES?: string;
  CONTEXT_SIZE?: string;
  LLM_TIMEOUT_MS?: string;
  USER_DISPLAY_NAME?: string;
  MOCK_DELAY_MS?: string;
}

/** String settings only, in the shape the core config parsers expect. */
export function settings(env: Env): Record<string, string | undefined> {
  const { DIRECTORY: _d, GROUPS: _g, FILES: _f, ...rest } = env;
  return rest;
}

/** There is one directory for the whole deployment. */
export const directoryStub = (env: Env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('main'));

/** Each group lives in its own Durable Object, addressed by the group id. */
export const groupStub = (env: Env, groupId: string) => env.GROUPS.get(env.GROUPS.idFromName(groupId));
