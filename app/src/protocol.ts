// Mirrors the server's API shapes (server/src/types.ts and server/src/server.ts).
import type { Avatar, AvatarColor } from './theme';

export type SenderKind = 'user' | 'member' | 'system';

export type AttachmentKind = 'image' | 'text' | 'pdf';

/** A file sent with a message. */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
}

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
  /** Code for this app. Older payloads only have `error`. */
  errorNotice?: Notice;
}

export type DeployState = 'queued' | 'building' | 'ready' | 'error';

/** The progress of deploying a merged change to a hosting platform. */
export interface DeploymentCard {
  type: 'deployment';
  integrationId: string;
  platform: string;
  platformLabel: string;
  project: string;
  projectName: string;
  repo: string;
  title: string;
  commit: string;
  branch: string;
  state: DeployState;
  url?: string;
  deployId?: string;
  error?: string;
  /** Code for this app. Older payloads only have `error`. */
  errorNotice?: Notice;
  startedAt: number;
  updatedAt: number;
}

export type Card = PullRequestCard | DeploymentCard;

/** A stable sentence id from the server. `content` is the Chinese fallback. */
export interface Notice {
  code: string;
  params?: Record<string, string | number>;
}

export interface Message {
  id: string;
  groupId: string;
  senderKind: SenderKind;
  senderId: string | null;
  senderName: string;
  content: string;
  /** Set on system notices and a few member lines. Missing on older messages. */
  notice?: Notice | null;
  attachments?: Attachment[];
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
  deploy?: { integrationId: string; project: string; name: string };
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
  /** 'boolean' is an on/off switch stored as 'true' or 'false'. */
  kind: 'text' | 'url' | 'password' | 'textarea' | 'boolean';
  required: boolean;
  defaultValue?: string;
  placeholder?: string;
  secret?: boolean;
}

export interface AdapterInfo {
  type: string;
  label: string;
  description: string;
  fields: FieldSpec[];
}

/** Whether a work assistant's computer is paired and connected. */
export interface BridgeStatus {
  paired: boolean;
  online: boolean;
  name: string | null;
  tools: string[];
  lastSeen: number | null;
}

/** Events for one group's chat. Bare on `/ws/groups/:id`, and inside `{ type: 'chat', event }` on `/ws`. */
export type ChatEvent =
  | { type: 'message'; message: Message }
  | { type: 'message_updated'; message: Message }
  | { type: 'typing'; groupId: string; memberId: string; active: boolean }
  | { type: 'relay'; relay: RelayState };

/**
 * Events for the app-wide socket, `/ws`.
 * `chat` is the envelope around a chat event. `event` is the original object,
 * so fields this app does not know (a future `notice`) stay on it.
 */
export type ListEvent =
  | { type: 'group_updated'; group: GroupSummary }
  | { type: 'groups_changed' }
  | { type: 'members_changed' }
  | { type: 'chat'; event: ChatEvent };
