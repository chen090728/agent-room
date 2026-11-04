import i18n from 'i18next';
import type { GroupBinding, IntegrationView } from './protocol';

/** Plugins a conversation can use. The server decides what each one needs; this is what the App shows. */
export interface PluginInfo {
  type: string;
  label: string;
  description: string;
  /** What it attaches to the conversation: a code repository or a place to deploy to. */
  binds: 'repo' | 'deploy';
}

function tr(key: string): string {
  return i18n.isInitialized ? String(i18n.t(key)) : key;
}

/** Call during render so a language change picks up new copy. */
export function plugins(): PluginInfo[] {
  return [
    { type: 'github', label: 'GitHub', description: tr('plugins.githubDescription'), binds: 'repo' },
    { type: 'gitlab', label: 'GitLab', description: tr('plugins.gitlabDescription'), binds: 'repo' },
    { type: 'bitbucket', label: 'Bitbucket', description: tr('plugins.bitbucketDescription'), binds: 'repo' },
    { type: 'gitea', label: 'Gitea / Forgejo', description: tr('plugins.giteaDescription'), binds: 'repo' },
    { type: 'cloudflare-pages', label: 'Cloudflare Pages', description: tr('plugins.deployDescription'), binds: 'deploy' },
    { type: 'vercel', label: 'Vercel', description: tr('plugins.deployDescription'), binds: 'deploy' },
    { type: 'netlify', label: 'Netlify', description: tr('plugins.deployDescription'), binds: 'deploy' },
    { type: 'render', label: 'Render', description: tr('plugins.deployDescription'), binds: 'deploy' },
    { type: 'railway', label: 'Railway', description: tr('plugins.deployDescription'), binds: 'deploy' },
    { type: 'fly', label: 'Fly.io', description: tr('plugins.deployDescription'), binds: 'deploy' },
    { type: 'cloudflare-workers', label: 'Cloudflare Workers', description: tr('plugins.deployDescription'), binds: 'deploy' },
    { type: 'azure-static-web-apps', label: 'Azure Static Web Apps', description: tr('plugins.deployDescription'), binds: 'deploy' },
    { type: 'webhook', label: 'Webhook', description: tr('plugins.deployDescription'), binds: 'deploy' },
  ];
}

const HELP_KEYS: Record<string, string[]> = {
  github: ['plugins.help.github.step1', 'plugins.help.github.step2', 'plugins.help.github.step3', 'plugins.help.github.step4'],
  gitlab: ['plugins.help.gitlab.step1', 'plugins.help.gitlab.step2', 'plugins.help.gitlab.step3', 'plugins.help.gitlab.step4'],
  bitbucket: ['plugins.help.bitbucket.step1', 'plugins.help.bitbucket.step2', 'plugins.help.bitbucket.step3', 'plugins.help.bitbucket.step4'],
  gitea: ['plugins.help.gitea.step1', 'plugins.help.gitea.step2', 'plugins.help.gitea.step3'],
  vercel: ['plugins.help.vercel.step1', 'plugins.help.vercel.step2', 'plugins.help.vercel.step3', 'plugins.help.vercel.step4'],
  netlify: ['plugins.help.netlify.step1', 'plugins.help.netlify.step2'],
  render: ['plugins.help.render.step1', 'plugins.help.render.step2'],
  'cloudflare-pages': ['plugins.help.cloudflare.step1', 'plugins.help.cloudflare.step2', 'plugins.help.cloudflare.step3'],
  railway: ['plugins.help.railway.step1', 'plugins.help.railway.step2', 'plugins.help.railway.step3'],
  fly: ['plugins.help.fly.step1', 'plugins.help.fly.step2', 'plugins.help.fly.step3'],
  'cloudflare-workers': ['plugins.help.cloudflareWorkers.step1', 'plugins.help.cloudflareWorkers.step2', 'plugins.help.cloudflareWorkers.step3'],
  'azure-static-web-apps': ['plugins.help.azure.step1', 'plugins.help.azure.step2', 'plugins.help.azure.step3'],
  webhook: ['plugins.help.webhook.step1', 'plugins.help.webhook.step2', 'plugins.help.webhook.step3'],
};

// Short, practical instructions for getting each token.
export function pluginHelp(type: string): string[] | undefined {
  const keys = HELP_KEYS[type];
  return keys?.map((key) => tr(key));
}

/** What a conversation has bound, as small tags above the input box. */
export interface BoundPlugin {
  kind: 'repo' | 'deploy';
  label: string;
  detail: string;
}

export function boundPlugins(binding: GroupBinding | null | undefined, integrations: IntegrationView[]): BoundPlugin[] {
  const out: BoundPlugin[] = [];
  if (binding?.repo) {
    const host = integrations.find((item) => item.id === binding.repo!.integrationId);
    out.push({ kind: 'repo', label: host?.typeLabel ?? tr('plugins.fallbackRepo'), detail: binding.repo.repo });
  }
  if (binding?.deploy) {
    const platform = integrations.find((i) => i.id === binding.deploy!.integrationId);
    out.push({ kind: 'deploy', label: platform?.typeLabel ?? tr('plugins.fallbackPlatform'), detail: binding.deploy.name || binding.deploy.project });
  }
  return out;
}

/** One composer chip per slot. `bound` is null when that slot still needs a connection. */
export interface PluginChipSlot {
  kind: 'repo' | 'deploy';
  bound: BoundPlugin | null;
}

export function pluginChipSlots(binding: GroupBinding | null | undefined, integrations: IntegrationView[]): PluginChipSlot[] {
  const bound = boundPlugins(binding, integrations);
  return (['repo', 'deploy'] as const).map((kind) => ({
    kind,
    bound: bound.find((item) => item.kind === kind) ?? null,
  }));
}

/** Where the plugins sheet opens. `repo` skips the list; `deploy` stays on the list. */
export type PluginSheetStart =
  | { kind: 'list' }
  | { kind: 'connect'; plugin: PluginInfo }
  | { kind: 'bind'; plugin: PluginInfo; integrationId: string };

/**
 * A repo chip opens the list of code hosts. If exactly one host is already
 * connected, skip the list and pick a repository. Deploy stays on its own list.
 */
export function initialPluginView(focus: string | undefined, integrations: IntegrationView[]): PluginSheetStart {
  if (focus !== 'repo') return { kind: 'list' };
  const connected = plugins()
    .filter((plugin) => plugin.binds === 'repo')
    .flatMap((plugin) => {
      const connection = integrations.find((item) => item.type === plugin.type);
      return connection ? [{ plugin, integrationId: connection.id }] : [];
    });
  if (connected.length === 1) return { kind: 'bind', plugin: connected[0]!.plugin, integrationId: connected[0]!.integrationId };
  return { kind: 'list' };
}

/** A focused chip shows only that kind of plugin. The + menu shows the full list. */
export function pluginsForFocus(focus: string | undefined): PluginInfo[] {
  const all = plugins();
  if (focus === 'deploy') return all.filter((plugin) => plugin.binds === 'deploy');
  if (focus === 'repo') return all.filter((plugin) => plugin.binds === 'repo');
  return all;
}
