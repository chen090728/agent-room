export * from './types.js';
export * from './locale.js';
export * from './copy.js';
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
export * from './bridge.js';
export * from './files.js';
export * from './uploads.js';
export * from './integrations/types.js';
export { IntegrationRegistry } from './integrations/registry.js';
export { createGitHubIntegration, GitHubClient, GitHubError } from './integrations/github.js';
export { createVercelIntegration } from './integrations/platforms/vercel.js';
export { createNetlifyIntegration } from './integrations/platforms/netlify.js';
export { createRenderIntegration } from './integrations/platforms/render.js';
export { createCloudflarePagesIntegration } from './integrations/platforms/cloudflare-pages.js';
export { createRailwayIntegration } from './integrations/platforms/railway.js';
export { createFlyIntegration } from './integrations/platforms/fly.js';
export { createCloudflareWorkersIntegration } from './integrations/platforms/cloudflare-workers.js';
export { createAzureStaticWebAppsIntegration } from './integrations/platforms/azure-static-web-apps.js';
export { createWebhookIntegration } from './integrations/platforms/webhook.js';
export { PlatformError } from './integrations/platforms/http.js';
export type { ContextMessage, FieldSpec, MemberAdapter, ReplyContext, ResolvedAttachment } from './adapters/types.js';
export { AdapterRegistry } from './adapters/registry.js';
export { createMockAdapter, type MockOptions } from './adapters/mock.js';
export { createOpenAICompatibleAdapter } from './adapters/openai-compatible.js';
export { createBridgeAdapter } from './adapters/bridge.js';

import { createMockAdapter } from './adapters/mock.js';
import { createOpenAICompatibleAdapter } from './adapters/openai-compatible.js';
import { AdapterRegistry } from './adapters/registry.js';
import type { Limits } from './config.js';
import { createGitHubIntegration } from './integrations/github.js';
import { createAzureStaticWebAppsIntegration } from './integrations/platforms/azure-static-web-apps.js';
import { createCloudflarePagesIntegration } from './integrations/platforms/cloudflare-pages.js';
import { createCloudflareWorkersIntegration } from './integrations/platforms/cloudflare-workers.js';
import { createFlyIntegration } from './integrations/platforms/fly.js';
import { createNetlifyIntegration } from './integrations/platforms/netlify.js';
import { createRailwayIntegration } from './integrations/platforms/railway.js';
import { createRenderIntegration } from './integrations/platforms/render.js';
import { createVercelIntegration } from './integrations/platforms/vercel.js';
import { createWebhookIntegration } from './integrations/platforms/webhook.js';
import { IntegrationRegistry } from './integrations/registry.js';

import { createBridgeAdapter } from './adapters/bridge.js';

/** The adapters every deployment ships with. Register new member types here. */
export function defaultRegistry(limits: Pick<Limits, 'mockDelayMs'>): AdapterRegistry {
  return new AdapterRegistry()
    .register(createMockAdapter({ delayMs: limits.mockDelayMs }))
    .register(createOpenAICompatibleAdapter())
    .register(createBridgeAdapter());
}

/** The connections every deployment ships with. Register new kinds of connection here. */
export function defaultIntegrations(): IntegrationRegistry {
  return new IntegrationRegistry()
    .register(createGitHubIntegration())
    .register(createCloudflarePagesIntegration())
    .register(createVercelIntegration())
    .register(createNetlifyIntegration())
    .register(createRenderIntegration())
    .register(createRailwayIntegration())
    .register(createFlyIntegration())
    .register(createCloudflareWorkersIntegration())
    .register(createAzureStaticWebAppsIntegration())
    .register(createWebhookIntegration());
}
