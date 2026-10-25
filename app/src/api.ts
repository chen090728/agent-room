import type { AdapterInfo, Attachment, GroupSummary, IntegrationView, MemberView, Message, ResourceInfo } from './protocol';
import type { ConnectionSettings } from './storage';
import type { Avatar } from './theme';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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

/** /ws for the group list, /ws/groups/:id for one group's chat. */
export function socketUrl(serverUrl: string, groupId?: string): string {
  return `${serverUrl.replace(/^http/i, 'ws')}/ws${groupId ? `/groups/${groupId}` : ''}`;
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
    send: (groupId: string, content: string, attachments: string[] = []) =>
      post<Message>(`/api/groups/${groupId}/messages`, { content, attachments }),
    /** Uploads a picked file (a local uri) and returns the attachment to send with the next message. */
    upload: async (groupId: string, file: { uri: string; name: string; mime: string }) => {
      let blob: Blob;
      try {
        blob = await (await fetch(file.uri)).blob();
      } catch {
        throw new ApiError('读取这个文件失败', 0);
      }
      if (blob.size > MAX_UPLOAD_BYTES) throw new ApiError('文件太大，最多 10 MB', 413);
      return request<Attachment>(`/api/groups/${groupId}/uploads`, {
        method: 'POST',
        headers: { 'Content-Type': file.mime || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
        body: blob,
      });
    },
    /** A short-lived link that opens in the phone's browser without the token header. */
    fileLink: async (groupId: string, fileId: string) =>
      `${serverUrl}${(await post<{ path: string }>(`/api/groups/${groupId}/files/${fileId}/link`, {})).path}`,
    members: () => request<MemberView[]>('/api/members'),
    createMember: (input: {
      name: string;
      type: string;
      avatar: Avatar;
      role: string;
      persona: string;
      config: Record<string, string>;
    }) => post<MemberView>('/api/members', input),
    integrationTypes: () => request<AdapterInfo[]>('/api/integrations/types'),
    integrations: () => request<IntegrationView[]>('/api/integrations'),
    createIntegration: (input: { type: string; name?: string; config: Record<string, string> }) =>
      post<IntegrationView>('/api/integrations', input),
    deleteIntegration: (id: string) => request<{ ok: true }>(`/api/integrations/${id}`, { method: 'DELETE' }),
    integrationResources: (id: string) => request<ResourceInfo[]>(`/api/integrations/${id}/resources`),
    setBinding: (groupId: string, repo: { integrationId: string; repo: string } | null) =>
      request<GroupSummary>(`/api/groups/${groupId}/binding`, { method: 'PUT', body: JSON.stringify({ repo }) }),
    cardAction: (groupId: string, messageId: string, action: 'merge' | 'reject') =>
      post<Message>(`/api/groups/${groupId}/messages/${messageId}/card`, { action }),
    deleteMember: (id: string) => request<{ ok: true }>(`/api/members/${id}`, { method: 'DELETE' }),
  };
}

export type Api = ReturnType<typeof createApi>;
