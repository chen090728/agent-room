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
  createdAt: number;
}

/** A member plus its decrypted secrets; never leaves the server. */
export interface MemberWithSecrets extends Member {
  secrets: Record<string, string>;
}

export interface Group {
  id: string;
  name: string;
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
