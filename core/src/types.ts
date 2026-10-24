export const MEMBER_COLORS = ['orange', 'blue', 'green', 'purple', 'red', 'graphite'] as const;
export type MemberColor = (typeof MEMBER_COLORS)[number];

export interface Member {
  id: string;
  name: string;
  type: string;
  color: MemberColor;
  persona: string;
  /** Non-secret adapter config. */
  config: Record<string, string>;
  /** Masked previews of stored secrets, e.g. { apiKey: 'sk-…abcd' }. */
  secretPreview: Record<string, string>;
  createdAt: number;
}

export type SenderKind = 'user' | 'member' | 'system';

export interface Message {
  id: string;
  groupId: string;
  senderKind: SenderKind;
  senderId: string | null;
  senderName: string;
  content: string;
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
  trail: MemberColor[];
}

export interface GroupMemberRef {
  id: string;
  name: string;
  color: MemberColor;
  type: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  createdAt: number;
  members: GroupMemberRef[];
  lastMessage: Message | null;
  lastActivityAt: number;
  /** Relay currently running in the group, if any. */
  relay: RelayState | null;
}

/** Events for one group's chat, sent over /ws/groups/:id. */
export type ChatEvent =
  | { type: 'message'; message: Message }
  | { type: 'typing'; groupId: string; memberId: string; active: boolean }
  | { type: 'relay'; relay: RelayState };

/** Events for the group list, sent over /ws. */
export type ListEvent =
  | { type: 'group_updated'; group: GroupSummary }
  | { type: 'groups_changed' }
  | { type: 'members_changed' };
