export * from './types.js';
export * from './sql.js';
export * from './crypto.js';
export * from './mentions.js';
export * from './context.js';
export * from './directory.js';
export * from './room.js';
export * from './coordinator.js';
export * from './config.js';
export * from './seed.js';
export * from './api.js';
export * from './realtime.js';
export type { ContextMessage, FieldSpec, MemberAdapter, ReplyContext } from './adapters/types.js';
export { AdapterRegistry } from './adapters/registry.js';
export { createMockAdapter, type MockOptions } from './adapters/mock.js';
export { createOpenAICompatibleAdapter } from './adapters/openai-compatible.js';

import { createMockAdapter } from './adapters/mock.js';
import { createOpenAICompatibleAdapter } from './adapters/openai-compatible.js';
import { AdapterRegistry } from './adapters/registry.js';
import type { Limits } from './config.js';

/** The adapters every deployment ships with. Register new member types here. */
export function defaultRegistry(limits: Pick<Limits, 'mockDelayMs'>): AdapterRegistry {
  return new AdapterRegistry()
    .register(createMockAdapter({ delayMs: limits.mockDelayMs }))
    .register(createOpenAICompatibleAdapter());
}
