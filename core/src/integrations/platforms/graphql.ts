import { PlatformClient, PlatformError } from './http.js';

function redact(text: string, secrets: string[]): string {
  return secrets.filter(Boolean).reduce((t, s) => t.split(s).join('***'), text);
}

/**
 * POST a GraphQL query. HTTP errors are already user-facing (PlatformClient).
 * A 200 body can still carry `errors`; those are turned into PlatformError too.
 */
export async function graphql<T>(
  client: PlatformClient,
  label: string,
  path: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  secrets: string[],
): Promise<T> {
  const body = await client.request<any>('POST', path, { body: variables ? { query, variables } : { query } });
  if (Array.isArray(body?.errors) && body.errors.length) {
    const message = redact(
      body.errors.map((e: any) => (typeof e?.message === 'string' ? e.message : '')).filter(Boolean).join('；') || 'GraphQL error',
      secrets,
    );
    const unauthorized = /unauthor|not authorized|invalid token|authentication|jwt/i.test(message);
    if (unauthorized) throw new PlatformError(`${label} 的令牌无效或已过期`, 401);
    throw new PlatformError(`${label} 返回错误：${message}`, 400);
  }
  return (body?.data ?? {}) as T;
}
