import type { AppLanguage } from './locale.js';
import type { Member, Notice } from './types.js';

/** Chinese sentence kept on `content` / `error` for old clients, plus the code a new client renders. */
export function noted(content: string, code: string, params?: Notice['params']): { content: string; notice: Notice } {
  return { content, notice: params ? { code, params } : { code } };
}

export function relayInterrupted(name: string) {
  return noted(`${name} 的回复被中断，已跳过。`, 'relay.interrupted', { name });
}

export function relayFailed(name: string, detail: string, reasonCode?: string) {
  const params: Notice['params'] = { name };
  if (reasonCode) params.reasonCode = reasonCode;
  else params.detail = detail;
  return noted(`${name} 回复失败：${detail}`, 'relay.failed', params);
}

export function relayHopLimit(maxHops: number) {
  return noted(`已达到 ${maxHops} 轮传递上限，自动停止。`, 'relay.hopLimit', { maxHops });
}

export function relayReplyLimit(maxReplies: number) {
  return noted(`已达到每条消息最多 ${maxReplies} 次回复的上限，自动停止。`, 'relay.replyLimit', { maxReplies });
}

export function deployStarted(title: string, platform: string) {
  return noted(`已合并「${title}」，正在部署到 ${platform}`, 'deploy.started', { title, platform });
}

export const DEPLOY_CANCELED = noted('部署被取消了', 'deploy.canceled');
export const DEPLOY_FAILED = noted('部署失败', 'deploy.failed');

export function deployStageFailed(stage: string, platform: string) {
  return noted(`部署在「${stage}」这一步失败了，请到 ${platform} 查看日志`, 'deploy.stageFailed', { stage, platform });
}

export function deployPlatformFailed(platform: string) {
  return noted(`部署失败，请到 ${platform} 查看日志`, 'deploy.platformFailed', { platform });
}

/** Upstream text stays in `error` (what old clients show) and in `detail`. */
export function deployUpstream(platform: string, detail: string) {
  return { error: detail, errorNotice: { code: 'deploy.platformDetail', params: { platform, detail } } satisfies Notice };
}

export function deployConnectionDeleted() {
  return noted('这个部署平台的连接已经被删除了', 'deploy.connectionDeleted');
}

export function deployNotStarted(canTrigger: boolean) {
  return canTrigger
    ? noted('一直没有等到平台开始部署', 'deploy.notStarted')
    : noted('一直没有等到平台开始部署，请确认这个项目在平台上连接了该仓库并开启了自动部署', 'deploy.notStartedNoTrigger');
}

export function deployTimedOut() {
  return noted('部署时间太长，已停止跟踪，请到平台查看', 'deploy.timedOut');
}

export const CARD_MISSING = noted('找不到这张卡片', 'card.missing');
export const GITHUB_CONNECTION_DELETED = noted('这个仓库的连接已经被删除了，请在 GitHub 上直接处理这个 PR', 'github.connectionDeleted');

export const MEMBER_SUBMITTED = noted('我提交了修改，请在下面的卡片里确认。', 'member.submitted');

export function memberPrLine(number: number, title: string) {
  return noted(`PR #${number}：${title}`, 'member.prLine', { number, title });
}

export const WELCOME_MESSAGE =
  '欢迎来到演示群！这里的三位都是模拟成员，不需要任何 Key。试试发送「@小橙 你好」，或者同时 @ 好几位，看看成员之间怎么接力。';

export const WELCOME_NOTICE: Notice = { code: 'demo.welcome' };

/** A known timeout becomes `relay.timeout`; other errors stay as untranslated detail. */
export function describeFailure(err: unknown): { text: string; reasonCode?: string } {
  if (err instanceof Error && err.name === 'TimeoutError') return { text: '请求超时', reasonCode: 'relay.timeout' };
  return { text: err instanceof Error ? err.message : String(err) };
}

function readI18n(raw: string | undefined, lang: AppLanguage): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed[lang];
    return typeof value === 'string' && value.trim() ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Stored Chinese, unless this language has a string in the config map. */
export function localizedField(stored: string, i18nJson: string | undefined, lang: AppLanguage): string {
  if (lang === 'zh') return stored;
  return readI18n(i18nJson, lang) ?? stored;
}

export function localizeMember<T extends Pick<Member, 'role' | 'persona' | 'config'>>(member: T, lang: AppLanguage): T {
  if (lang === 'zh') return member;
  const role = localizedField(member.role, member.config.roleI18n, lang);
  const persona = localizedField(member.persona, member.config.personaI18n, lang);
  if (role === member.role && persona === member.persona) return member;
  return { ...member, role, persona };
}
