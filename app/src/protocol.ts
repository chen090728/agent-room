// Mirrors the server's API shapes (server/src/types.ts and server/src/server.ts).
import type { OrbColor } from './theme';

export type SenderKind = 'user' | 'member' | 'system';

export interface Message {
  id: string;
  groupId: string;
  senderKind: SenderKind;
  senderId: string | null;
  senderName: string;
  content: string;
  rootId: string;
  hop: number;
  createdAt: number;
}

export interface RelayState {
  groupId: string;
  rootId: string;
  active: boolean;
  hop: number;
  maxHops: number;
  replies: number;
  maxReplies: number;
  trail: OrbColor[];
}

export interface GroupMemberRef {
  id: string;
  name: string;
  color: OrbColor;
  type: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  createdAt: number;
  members: GroupMemberRef[];
  lastMessage: Message | null;
  lastActivityAt: number;
  relay: RelayState | null;
}

export interface MemberView {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  color: OrbColor;
  persona: string;
  config: Record<string, string>;
  /** Masked previews of stored secrets, e.g. { apiKey: 'sk-…abcd' }. */
  secrets: Record<string, string>;
  createdAt: number;
}

export interface FieldSpec {
  key: string;
  label: string;
  kind: 'text' | 'url' | 'password' | 'textarea';
  required: boolean;
  placeholder?: string;
  secret?: boolean;
}

export interface AdapterInfo {
  type: string;
  label: string;
  description: string;
  fields: FieldSpec[];
}

export type ServerEvent =
  | { type: 'hello' }
  | { type: 'message'; message: Message }
  | { type: 'typing'; groupId: string; memberId: string; active: boolean }
  | { type: 'relay'; relay: RelayState }
  | { type: 'groups_changed' }
  | { type: 'members_changed' };
