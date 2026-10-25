import type { TFunction } from 'i18next';
import type { Notice } from '../protocol';

/** Render a server notice in the active language, or the Chinese `content` when the code is unknown. */
export function renderNotice(notice: Notice | null | undefined, fallback: string, t: TFunction, exists: (key: string) => boolean): string {
  if (!notice?.code) return fallback;
  const key = `notice.${notice.code}`;
  if (!exists(key)) return fallback;
  const params: Record<string, unknown> = { ...(notice.params ?? {}) };
  const reason = params.reasonCode;
  if (typeof reason === 'string') {
    const reasonKey = `notice.${reason}`;
    if (exists(reasonKey)) params.detail = t(reasonKey);
  }
  return t(key, params);
}
