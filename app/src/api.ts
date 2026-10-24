import type { AdapterInfo, GroupSummary, MemberView, Message } from './protocol';
import type { ConnectionSettings } from './storage';
import type { OrbColor } from './theme';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** "https://host/" -> "https://host" */
export function normalizeServerUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function socketUrl(serverUrl: string): string {
  return `${serverUrl.replace(/^http/i, 'ws')}/ws`;
}

export function createApi({ serverUrl, token }: ConnectionSettings) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${serverUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      });
    } catch {
      throw new ApiError('连不上服务器，请检查地址和网络', 0);
    }
    const text = await res.text();
    let body: any = undefined;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // Not JSON, e.g. a proxy error page.
    }
    if (!res.ok) {
      throw new ApiError(body?.error ?? `服务器返回 ${res.status}`, res.status);
    }
    return body as T;
  }

  const post = <T>(path: string, data: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(data) });

  return {
    adapters: () => request<AdapterInfo[]>('/api/adapters'),
    groups: () => request<GroupSummary[]>('/api/groups'),
    createGroup: (name: string, memberIds: string[]) => post<GroupSummary>('/api/groups', { name, memberIds }),
    setGroupMembers: (groupId: string, memberIds: string[]) =>
      request<GroupSummary>(`/api/groups/${groupId}/members`, { method: 'PUT', body: JSON.stringify({ memberIds }) }),
    messages: (groupId: string, before?: string) =>
      request<Message[]>(`/api/groups/${groupId}/messages?limit=50${before ? `&before=${before}` : ''}`),
    send: (groupId: string, content: string) => post<Message>(`/api/groups/${groupId}/messages`, { content }),
    members: () => request<MemberView[]>('/api/members'),
    createMember: (input: {
      name: string;
      type: string;
      color: OrbColor;
      persona: string;
      config: Record<string, string>;
    }) => post<MemberView>('/api/members', input),
  };
}

export type Api = ReturnType<typeof createApi>;
