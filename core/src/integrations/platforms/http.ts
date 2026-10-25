/** An error from a hosting platform's API whose message is meant for the user. */
export class PlatformError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  /** Shown in error messages, e.g. "Vercel". */
  label: string;
  base: string;
  headers: Record<string, string>;
  /** Added to every request's query string (e.g. a Vercel team id). */
  query?: Record<string, string>;
  /** Values that must never appear in an error message. */
  secrets: string[];
  fetchImpl: typeof fetch;
}

/** Finds the human message in the different error shapes platforms use. */
function messageOf(body: any, fallback: string): string {
  const candidates = [body?.message, body?.error?.message, body?.errors?.[0]?.message, typeof body?.error === 'string' ? body.error : undefined];
  return String(candidates.find((m) => typeof m === 'string' && m) ?? fallback);
}

/** A small JSON client shared by the hosting platforms. */
export class PlatformClient {
  constructor(private o: ClientOptions) {}

  private redact(text: string): string {
    return this.o.secrets.filter(Boolean).reduce((t, s) => t.split(s).join('***'), text);
  }

  async request<T = any>(method: string, path: string, opts: { body?: unknown; form?: FormData } = {}): Promise<T> {
    const url = new URL(`${this.o.base.replace(/\/+$/, '')}${path}`);
    for (const [k, v] of Object.entries(this.o.query ?? {})) if (v) url.searchParams.set(k, v);
    const headers: Record<string, string> = { Accept: 'application/json', 'User-Agent': 'AgentHub', ...this.o.headers };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    // Called without `this`: on Cloudflare Workers `fetch` throws "Illegal invocation" when bound to another object.
    const doFetch = this.o.fetchImpl;
    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        method,
        headers,
        body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
      });
    } catch (err) {
      const reason = err instanceof Error ? this.redact(err.message) : '';
      throw new PlatformError(`连不上 ${this.o.label}，请检查网络${reason ? `（${reason}）` : ''}`, 0);
    }

    const text = await res.text();
    let body: any;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    if (res.ok) return body as T;

    const detail = this.redact(messageOf(body, text.slice(0, 200)));
    if (res.status === 401) throw new PlatformError(`${this.o.label} 的令牌无效或已过期`, 401);
    if (res.status === 403) throw new PlatformError(`${this.o.label} 的令牌没有足够的权限（${detail}）`, 403);
    if (res.status === 404) throw new PlatformError(`在 ${this.o.label} 上找不到（${detail}）`, 404);
    throw new PlatformError(`${this.o.label} 返回 ${res.status}：${detail}`, res.status);
  }
}
