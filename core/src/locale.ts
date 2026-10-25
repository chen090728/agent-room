/** Languages the app can ask for. Missing or unknown means Chinese, matching old clients. */
export type AppLanguage = 'zh' | 'en';

/**
 * The first language in an `Accept-Language` header.
 * Absent header, or a bare `*` (Node fetch's default), → undefined so callers keep Chinese.
 * A `zh` primary tag → `zh`. Anything else the client sent → `en`.
 */
export function explicitLanguage(header: string | null | undefined): AppLanguage | undefined {
  if (!header?.trim()) return undefined;
  const tag = header.split(',')[0]?.split(';')[0]?.trim().toLowerCase() ?? '';
  const primary = tag.split(/[-_]/)[0];
  if (!primary || primary === '*') return undefined;
  return primary === 'zh' ? 'zh' : 'en';
}

/** `lang` on a WebSocket auth or subscribe frame. Only an explicit `zh` or `en` counts. */
export function languageFromExtra(extra: { lang?: unknown } | null | undefined): AppLanguage | undefined {
  return extra?.lang === 'zh' || extra?.lang === 'en' ? extra.lang : undefined;
}

/** One agreed language, or undefined when clients disagree or none sent `lang`. */
export function agreedLanguage(langs: Iterable<AppLanguage | undefined>): AppLanguage | undefined {
  const found = new Set<AppLanguage>();
  for (const lang of langs) if (lang) found.add(lang);
  if (found.size !== 1) return undefined;
  return [...found][0];
}
