import type { FieldSpec } from '../adapters/types.js';
import type { Card } from '../types.js';

/** A function an assistant may call while writing a reply. */
export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema of the arguments. */
  parameters: Record<string, unknown>;
  /** Returns text for the model. Throw to report an error to it. */
  run(args: Record<string, unknown>): Promise<string>;
}

/** The tools of one conversation for one reply, plus what they produced. */
export interface ToolRuntime {
  tools: ToolDef[];
  /** Added to the assistant's system prompt while these tools are available. */
  instructions: string;
  /** Cards created by tools during this reply; they are attached to the reply message. */
  cards: Card[];
}

export interface ToolContext {
  integrationId: string;
  assistantName: string;
}

export interface Resource {
  id: string;
  name: string;
  description?: string;
}

/**
 * A kind of outside service the user can connect (GitHub today). Same idea as
 * a member adapter: registered by type, described by form fields, secrets
 * encrypted at rest, and exposing tools to assistants.
 */
export interface IntegrationType {
  type: string;
  label: string;
  description: string;
  fields: FieldSpec[];
  /** Checks the credentials and returns the account they belong to. Throws a readable error. */
  verify(config: Record<string, string>): Promise<{ account: string }>;
  /** Things that can be bound to a conversation, e.g. repositories the token can see. */
  listResources(config: Record<string, string>): Promise<Resource[]>;
  /** Tools for an assistant in a conversation bound to `resource`. */
  createTools(resource: string, config: Record<string, string>, ctx: ToolContext): ToolRuntime;
  /** Handles a tap on a card button and returns the updated card. */
  cardAction(card: Card, action: 'merge' | 'reject', config: Record<string, string>): Promise<Card>;
}
