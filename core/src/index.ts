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
export * from './files.js';
export * from './uploads.js';
export * from './integrations/types.js';
export { IntegrationRegistry } from './integrations/registry.js';
export { createGitHubIntegration, GitHubClient, GitHubError } from './integrations/github.js';
export type { ContextMessage, FieldSpec, MemberAdapter, ReplyContext, ResolvedAttachment } from './adapters/types.js';
export { AdapterRegistry } from './adapters/registry.js';
export { createMockAdapter, type MockOptions } from './adapters/mock.js';
export { createOpenAICompatibleAdapter } from './adapters/openai-compatible.js';

import { createMockAdapter } from './adapters/mock.js';
import { createOpenAICompatibleAdapter } from './adapters/openai-compatible.js';
import { AdapterRegistry } from './adapters/registry.js';
import type { Limits } from './config.js';
import { createGitHubIntegration } from './integrations/github.js';
import { IntegrationRegistry } from './integrations/registry.js';

/** The adapters every deployment ships with. Register new member types here. */
export function defaultRegistry(limits: Pick<Limits, 'mockDelayMs'>): AdapterRegistry {
  return new AdapterRegistry()
    .register(createMockAdapter({ delayMs: limits.mockDelayMs }))
    .register(createOpenAICompatibleAdapter());
}

/** The connections every deployment ships with. Register new kinds of connection here. */
export function defaultIntegrations(): IntegrationRegistry {
  return new IntegrationRegistry().register(createGitHubIntegration());
}
