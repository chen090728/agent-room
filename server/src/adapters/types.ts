import type { SenderKind } from '../types.js';

/** One input field the App renders when creating a member of this type. */
export interface FieldSpec {
  key: string;
  label: string;
  kind: 'text' | 'url' | 'password' | 'textarea';
  required: boolean;
  placeholder?: string;
  /** Secret fields are encrypted at rest and never sent back to the App. */
  secret?: boolean;
}

export interface ContextMessage {
  id?: string;
  senderKind: SenderKind;
  senderName: string;
  /** True when the message was written by the member being asked to reply. */
  isSelf: boolean;
  content: string;
}

export interface ReplyContext {
  groupName: string;
  self: { id: string; name: string; persona: string };
  /** Everyone else in the group the member may @, the human included. */
  others: { name: string; persona: string; isHuman: boolean }[];
  /** Recent messages, oldest first; the last one is the message to answer. */
  history: ContextMessage[];
  /** The message that @-mentioned this member. */
  trigger: ContextMessage;
  signal: AbortSignal;
}

export interface MemberAdapter {
  type: string;
  label: string;
  description: string;
  fields: FieldSpec[];
  /** Returns the reply text. Throw to report an error in the chat. */
  reply(ctx: ReplyContext, config: Record<string, string>): Promise<string>;
}
