import type { ToolRuntime } from '../integrations/types.js';
import type { AttachmentKind, SenderKind } from '../types.js';

/** One input field the App renders when creating a member of this type. */
export interface FieldSpec {
  key: string;
  label: string;
  /** 'boolean' is an on/off switch whose value is stored as 'true' or 'false'. */
  kind: 'text' | 'url' | 'password' | 'textarea' | 'boolean';
  required: boolean;
  defaultValue?: string;
  placeholder?: string;
  /** Secret fields are encrypted at rest and never sent back to the App. */
  secret?: boolean;
}

/** A file of a message, prepared for a model. */
export interface ResolvedAttachment {
  name: string;
  kind: AttachmentKind;
  /** Content of a text file, or the text extracted from a PDF. */
  text?: string;
  /** Image data, only for models that can see images. */
  image?: { mime: string; base64: string };
  /** Why the content is missing (too large, too old, unreadable...). */
  note?: string;
}

export interface ContextMessage {
  id?: string;
  senderKind: SenderKind;
  senderName: string;
  /** True when the message was written by the member being asked to reply. */
  isSelf: boolean;
  content: string;
  attachments?: ResolvedAttachment[];
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
  /** Whether this member's model accepts images (the `vision` setting; on by default). */
  supportsImages: boolean;
  /** Tools from the connections bound to this conversation (e.g. GitHub); undefined when none. */
  tools?: ToolRuntime;
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
