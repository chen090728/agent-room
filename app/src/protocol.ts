// Mirrors the server's API shapes (server/src/types.ts and server/src/server.ts).
import type { Avatar, AvatarColor } from './theme';

export type SenderKind = 'user' | 'member' | 'system';

export interface PullRequestFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export type CardState = 'open' | 'merged' | 'closed' | 'failed';

/** A pull request an assistant opened, waiting for the user's decision. */
export interface PullRequestCard {
  type: 'pull_request';
  integrationId: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  branch: string;
  base: string;
  files: PullRequestFile[];
  additions: number;
  deletions: number;
  state: CardState;
  error?: string;
}

export type Card = PullRequestCard;

export interface Message {
  id: string;
  groupId: string;
  senderKind: SenderKind;
  senderId: string | null;
  senderName: string;
  content: string;
  card?: Card | null;
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
  trail: AvatarColor[];
  /** Name of the member currently writing a reply. */
  thinking: string | null;
}

export interface GroupMemberRef {
  id: string;
  name: string;
  avatar: Avatar;
  role: string;
  type: string;
}

export interface GroupBinding {
  repo?: { integrationId: string; repo: string };
}

/** A saved connection to an outside service; secrets arrive masked. */
export interface IntegrationView {
  id: string;
  type: string;
  typeLabel: string;
  name: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
  createdAt: number;
}

export interface ResourceInfo {
  id: string;
  name: string;
  description?: string;
}

/** 'direct' is a one-to-one chat with a single assistant. */
export type GroupKind = 'group' | 'direct';

export interface GroupSummary {
  id: string;
  name: string;
  kind: GroupKind;
  createdAt: number;
  members: GroupMemberRef[];
  lastMessage: Message | null;
  lastActivityAt: number;
  relay: RelayState | null;
  binding: GroupBinding | null;
}

export interface MemberView {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  avatar: Avatar;
  role: string;
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

/** Events for one group's chat, sent over /ws/groups/:id. */
export type ChatEvent =
  | { type: 'message'; message: Message }
  | { type: 'message_updated'; message: Message }
  | { type: 'typing'; groupId: string; memberId: string; active: boolean }
  | { type: 'relay'; relay: RelayState };

/** Events for the group list, sent over /ws. */
export type ListEvent =
  | { type: 'group_updated'; group: GroupSummary }
  | { type: 'groups_changed' }
  | { type: 'members_changed' };
