/** HTTP for code hosts. fetch is called unbound so Cloudflare Workers do not throw "Illegal invocation". */

export class ForgeError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface ForgeResponse {
  status: number;
  text: string;
  contentType: string;
  json: any;
}

interface ForgeOptions {
  /** Shown in errors, e.g. "GitLab". */
  label: string;
  base: string;
  headers: Record<string, string>;
  /** Values that must never appear in an error message. */
  secrets: string[];
  fetchImpl: typeof fetch;
}

function messageOf(body: any, fallback: string): string {
  if (typeof body?.message === 'string' && body.message) return body.message;
  if (body?.message && typeof body.message === 'object') {
    const parts = Object.values(body.message)
      .flat()
      .filter((item): item is string => typeof item === 'string' && item.length > 0);
    if (parts.length) return parts.join('；');
  }
  if (typeof body?.error === 'string' && body.error) return body.error;
  if (typeof body?.error?.message === 'string') return body.error.message;
  if (typeof body?.errors?.[0]?.message === 'string') return body.errors[0].message;
  return fallback;
}

/** A small JSON / text client shared by GitLab, Bitbucket and Gitea. */
export class ForgeClient {
  constructor(private opts: ForgeOptions) {}

  private redact(text: string): string {
    return this.opts.secrets.filter((secret) => secret.length > 3).reduce((out, secret) => out.split(secret).join('***'), text);
  }

  async send(method: string, path: string, opts: { body?: unknown; form?: FormData; accept?: string; acceptStatus?: number[] } = {}): Promise<ForgeResponse> {
    const headers: Record<string, string> = {
      Accept: opts.accept ?? 'application/json',
      'User-Agent': 'AgentHub',
      ...this.opts.headers,
    };
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    const doFetch = this.opts.fetchImpl;
    let res: Response;
    try {
      res = await doFetch(`${this.opts.base.replace(/\/+$/, '')}${path}`, { method, headers, body });
    } catch (err) {
      const reason = err instanceof Error ? this.redact(err.message) : '';
      throw new ForgeError(`连不上 ${this.opts.label}，请检查地址和网络${reason ? `（${reason}）` : ''}`, 0);
    }

    const text = this.redact(await res.text());
    let json: any;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (res.ok || opts.acceptStatus?.includes(res.status)) return { status: res.status, text, contentType, json };

    const detail = this.redact(messageOf(json, text.slice(0, 200)));
    if (res.status === 401) throw new ForgeError(`${this.opts.label} 的令牌无效或已过期`, 401);
    if (res.status === 403) throw new ForgeError(`${this.opts.label} 的令牌没有足够的权限（${detail}）`, 403);
    if (res.status === 404) throw new ForgeError(`在 ${this.opts.label} 上找不到（${detail}）`, 404);
    throw new ForgeError(`${this.opts.label} 返回 ${res.status}：${detail}`, res.status);
  }

  async json<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.send(method, path, { body });
    return res.json as T;
  }
}

/** Site root plus an API prefix, without doubling it when the user already pasted the prefix. */
export function siteApi(input: string | undefined, fallback: string, suffix: string): string {
  const raw = (input?.trim() || fallback).replace(/\/+$/, '');
  return raw.endsWith(suffix) ? raw : `${raw}${suffix}`;
}

export function basicAuth(user: string, password: string): string {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `Basic ${btoa(binary)}`;
}
