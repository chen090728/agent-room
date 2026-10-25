import type { GroupBinding, IntegrationView } from './protocol';

/** Plugins a conversation can use. The server decides what each one needs; this is what the App shows. */
export interface PluginInfo {
  type: string;
  label: string;
  description: string;
  /** What it attaches to the conversation: a code repository or a place to deploy to. */
  binds: 'repo' | 'deploy';
}

export const PLUGINS: PluginInfo[] = [
  { type: 'github', label: 'GitHub', description: '读取代码、通过 PR 提交修改（合并前要你确认）', binds: 'repo' },
  { type: 'cloudflare-pages', label: 'Cloudflare Pages', description: '合并后在群里显示部署进度和预览链接', binds: 'deploy' },
  { type: 'vercel', label: 'Vercel', description: '合并后在群里显示部署进度和预览链接', binds: 'deploy' },
  { type: 'netlify', label: 'Netlify', description: '合并后在群里显示部署进度和预览链接', binds: 'deploy' },
  { type: 'render', label: 'Render', description: '合并后在群里显示部署进度和预览链接', binds: 'deploy' },
];

// Short, practical instructions for getting each token.
export
const PLUGIN_HELP: Record<string, string[]> = {
  github: [
    '1. 在 GitHub 网页打开 Settings → Developer settings → Personal access tokens → Fine-grained tokens，点 Generate new token。',
    '2. Repository access 选"Only select repositories"，勾选要给助手用的仓库。',
    '3. Permissions → Repository permissions 里，把 Contents 和 Pull requests 设为 Read and write。',
    '4. 生成后复制令牌（以 github_pat_ 开头），粘贴到下面。',
  ],
  vercel: [
    '1. 在 Vercel 网页打开 Account Settings → Tokens，创建一个令牌（范围选你的账号或团队）。',
    '2. 项目要已经在 Vercel 里连接了对应的 GitHub 仓库；合并后 Vercel 会自动部署，AgentHub 只负责跟踪进度。',
    '3. 项目属于团队时，把团队 ID（team_ 开头）填到下面。',
    '4. Vercel 不能从这里触发部署，所以必须开着自动部署。',
  ],
  netlify: [
    '1. 在 Netlify 网页打开 User settings → Applications → Personal access tokens，新建一个令牌。',
    '2. 站点要已经连接了对应的 GitHub 仓库。合并后如果 Netlify 没有自动开始部署，AgentHub 会替你触发一次。',
  ],
  render: [
    '1. 在 Render 网页打开 Account Settings → API Keys，创建一个 API Key。',
    '2. 服务要已经连接了对应的 GitHub 仓库。合并后如果 Render 没有自动开始部署，AgentHub 会替你触发一次。',
  ],
  'cloudflare-pages': [
    '1. 在 Cloudflare 网页打开 My Profile → API Tokens，创建令牌，权限选 Account → Cloudflare Pages → Edit。',
    '2. 账户 ID 在 Cloudflare 后台首页地址栏里（dash.cloudflare.com/ 后面那串 32 位字符）。',
    '3. 项目要已经连接了对应的 GitHub 仓库。合并后如果 Pages 没有自动开始部署，AgentHub 会替你触发一次。',
  ],
};

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
    out.push({ kind: 'deploy', label: platform?.typeLabel ?? '部署平台', detail: binding.deploy.name || binding.deploy.project });
  }
  return out;
}
