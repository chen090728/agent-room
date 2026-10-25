import { defaultIntegrations, defaultRegistry, handleApi, parseLimits, secretProblems, socketTarget, UserError, type Directory } from '@agenthub/core';
import { directoryStub, groupStub, settings, type Env } from './env.js';
import { R2FileStore } from './files.js';

export { DirectoryDO } from './directory-do.js';
export { GroupDO } from './group-do.js';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    const target = socketTarget(url.pathname);
    if (target === 'list' || target === 'bridge') return directoryStub(env).fetch(request);
    if (target) return groupStub(env, target.groupId).fetch(request);

    const problems = secretProblems(settings(env));
    const response = await handleApi(request, {
      token: env.AGENTHUB_TOKEN ?? '',
      configError: problems.length ? `服务器还没有配置好：${problems.join('；')}` : undefined,
      directory: directoryStub(env) as unknown as Directory,
      registry: defaultRegistry(parseLimits(settings(env))),
      integrations: defaultIntegrations(),
      files: env.FILES ? new R2FileStore(env.FILES) : null,
      signingSecret: env.AGENTHUB_SECRET ?? '',
      bridges: { isOnline: (bridgeId) => directoryStub(env).bridgeOnline(bridgeId) },
      rooms: {
        post: async (groupId, content, attachments) => {
          const result = await groupStub(env, groupId).post(groupId, content, attachments);
          if (!result.ok) throw new UserError(result.error, result.status);
          return result.message;
        },
        registerUpload: (groupId, attachment) => groupStub(env, groupId).registerUpload(groupId, attachment),
        messages: (groupId, limit, before) => groupStub(env, groupId).messages(groupId, limit, before),
        cardAction: async (groupId, messageId, action) => {
          const result = await groupStub(env, groupId).cardAction(groupId, messageId, action);
          if (!result.ok) throw new UserError(result.error, result.status);
          return result.message;
        },
      },
    });
    if (response) return response;

    if (url.pathname === '/') {
      return new Response('AgentHub 服务器正在运行。把这个网址填进 App 的"服务器地址"即可。\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    return Response.json({ error: '接口不存在' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
