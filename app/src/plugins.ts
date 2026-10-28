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
    { type: 'cloudflare-pages', label: 'Cloudflare Pages', description: tr('plugins.deployDescription'), binds: 'deploy' },
    { type: 'vercel', label: 'Vercel', description: tr('plugins.deployDescription'), binds: 'deploy' },
    { type: 'netlify', label: 'Netlify', description: tr('plugins.deployDescription'), binds: 'deploy' },
    { type: 'render', label: 'Render', description: tr('plugins.deployDescription'), binds: 'deploy' },
  ];
}

const HELP_KEYS: Record<string, string[]> = {
  github: ['plugins.help.github.step1', 'plugins.help.github.step2', 'plugins.help.github.step3', 'plugins.help.github.step4'],
  vercel: ['plugins.help.vercel.step1', 'plugins.help.vercel.step2', 'plugins.help.vercel.step3', 'plugins.help.vercel.step4'],
  netlify: ['plugins.help.netlify.step1', 'plugins.help.netlify.step2'],
  render: ['plugins.help.render.step1', 'plugins.help.render.step2'],
  'cloudflare-pages': ['plugins.help.cloudflare.step1', 'plugins.help.cloudflare.step2', 'plugins.help.cloudflare.step3'],
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
  if (binding?.repo) out.push({ kind: 'repo', label: 'GitHub', detail: binding.repo.repo });
  if (binding?.deploy) {
    const platform = integrations.find((i) => i.id === binding.deploy!.integrationId);
    out.push({ kind: 'deploy', label: platform?.typeLabel ?? tr('plugins.fallbackPlatform'), detail: binding.deploy.name || binding.deploy.project });
  }
  return out;
}
