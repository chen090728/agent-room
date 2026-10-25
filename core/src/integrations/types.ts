import type { FieldSpec } from '../adapters/types.js';
import type { Card, DeployState } from '../types.js';

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

/** The commit a deployment is looked up for. */
export interface DeployContext {
  repo: string;
  sha: string;
  branch: string;
  title: string;
}

export interface DeployStatus {
  state: DeployState;
  /** The platform's id of the deployment. */
  id?: string;
  /** Where the deployment can be opened. */
  url?: string;
  error?: string;
}

/** What a hosting platform offers: seeing, starting and following deployments. */
export interface DeployCapability {
  /** Looks for the deployment the platform started for this commit; null when none has appeared (yet). */
  find(project: string, ctx: DeployContext, config: Record<string, string>): Promise<DeployStatus | null>;
  /** Starts a deployment when the platform did not start one itself. Absent when it cannot be done through the API. */
  trigger?(project: string, ctx: DeployContext, config: Record<string, string>): Promise<DeployStatus>;
  /** The current state of a deployment found by `find` or `trigger`. */
  status(project: string, deployId: string, config: Record<string, string>): Promise<DeployStatus>;
}

/**
 * A kind of outside service the user can connect (GitHub, Vercel, ...). Same
 * idea as a member adapter: registered by type, described by form fields,
 * secrets encrypted at rest. A type can give assistants tools (GitHub), report
 * deployments (hosting platforms), or both.
 */
export interface IntegrationType {
  type: string;
  label: string;
  description: string;
  fields: FieldSpec[];
  /** Checks the credentials and returns the account they belong to. Throws a readable error. */
  verify(config: Record<string, string>): Promise<{ account: string }>;
  /** Things that can be bound to a conversation: repositories the token can see, or hosting projects. */
  listResources(config: Record<string, string>): Promise<Resource[]>;
  /** Tools for an assistant in a conversation bound to `resource`. */
  createTools?(resource: string, config: Record<string, string>, ctx: ToolContext): ToolRuntime;
  /** Handles a tap on a card button and returns the updated card. */
  cardAction?(card: Card, action: 'merge' | 'reject', config: Record<string, string>): Promise<Card>;
  /** Present on hosting platforms: this type can be a deploy target. */
  deploy?: DeployCapability;
}
