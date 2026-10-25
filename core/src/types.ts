export const AVATAR_SHAPES = [
  'circle',
  'cloud',
  'square',
  'flower',
  'egg',
  'hexagon',
  'triangle',
  'capsule',
  'star',
  'diamond',
  'drop',
  'bean',
] as const;
export type AvatarShape = (typeof AVATAR_SHAPES)[number];

export const AVATAR_COLORS = [
  'black',
  'brown',
  'red',
  'orange',
  'apricot',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'gray',
] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

/** A member's avatar: a coloured blob with white eyes. */
export interface Avatar {
  shape: AvatarShape;
  color: AvatarColor;
}

export interface Member {
  id: string;
  name: string;
  type: string;
  avatar: Avatar;
  /** Short label such as "产品经理", shown next to the name. */
  role: string;
  persona: string;
  /** Non-secret adapter config. */
  config: Record<string, string>;
  /** Masked previews of stored secrets, e.g. { apiKey: 'sk-…abcd' }. */
  secretPreview: Record<string, string>;
  createdAt: number;
}

export type SenderKind = 'user' | 'member' | 'system';

export type AttachmentKind = 'image' | 'text' | 'pdf';

/** A file sent with a message. The bytes live in the file store, not in the database. */
export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
}

/** A file touched by a pull request. */
export interface PullRequestFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
}

export type CardState = 'open' | 'merged' | 'closed' | 'failed';

/**
 * A pull request an assistant opened, shown in the chat with merge / reject
 * buttons. The assistant can never merge it; only the user's tap does.
 */
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
  /** Why the last merge attempt failed, when state is 'failed'. */
  error?: string;
}

/** Structured content attached to a message. */
export type Card = PullRequestCard;

export interface Message {
  id: string;
  groupId: string;
  senderKind: SenderKind;
  senderId: string | null;
  senderName: string;
  content: string;
  attachments?: Attachment[];
  card?: Card | null;
  /** Id of the original user message this one descends from. */
  rootId: string;
  /** 0 for user messages, n for the n-th relay step. */
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
  /** Color of the first member that replied at each hop, index 0 = hop 1. */
  trail: AvatarColor[];
  /** Name of the member currently writing a reply, if any. */
  thinking: string | null;
}

export interface GroupMemberRef {
  id: string;
  name: string;
  avatar: Avatar;
  role: string;
  type: string;
}

/** What a conversation is connected to: a code repository today, deploy targets later. */
export interface GroupBinding {
  repo?: { integrationId: string; repo: string };
}

/** A saved connection to an outside service, as shown to the App (secrets masked). */
export interface IntegrationView {
  id: string;
  type: string;
  typeLabel: string;
  name: string;
  config: Record<string, string>;
  secrets: Record<string, string>;
  createdAt: number;
}

/** 'direct' is a one-to-one chat: a group with just the user and one assistant. */
export type GroupKind = 'group' | 'direct';

export interface GroupSummary {
  id: string;
  name: string;
  kind: GroupKind;
  createdAt: number;
  members: GroupMemberRef[];
  lastMessage: Message | null;
  lastActivityAt: number;
  /** Relay currently running in the group, if any. */
  relay: RelayState | null;
  binding: GroupBinding | null;
}

/** Events for one group's chat, sent over /ws/groups/:id. */
export type ChatEvent =
  | { type: 'message'; message: Message }
  /** An existing message changed, e.g. a pull request card was merged. */
  | { type: 'message_updated'; message: Message }
  | { type: 'typing'; groupId: string; memberId: string; active: boolean }
  | { type: 'relay'; relay: RelayState };

/** Events for the group list, sent over /ws. */
export type ListEvent =
  | { type: 'group_updated'; group: GroupSummary }
  | { type: 'groups_changed' }
  | { type: 'members_changed' };

/** An error whose message is meant for the user (shown in the App as is). */
export class UserError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
