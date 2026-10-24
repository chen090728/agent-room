import {
  SecretBox,
  secretProblems,
  seedIfEmpty,
  SqlDirectory,
  type ActivityPatch,
  type Directory,
  type NewMember,
} from '@agenthub/core';
import { DurableObject } from 'cloudflare:workers';
import { acceptSocket, broadcast, closeSocket, durableSql, onSocketMessage } from './durable.js';
import { groupStub, settings, type Env } from './env.js';

/**
 * The single directory of members and groups, plus the group-list WebSocket
 * (/ws). Group Durable Objects report activity here over RPC, and every change
 * is pushed to connected Apps.
 */
export class DirectoryDO extends DurableObject<Env> implements Directory {
  private dir: SqlDirectory;
  private seeded?: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const hasSecret = !secretProblems(settings(env)).some((p) => p.startsWith('AGENTHUB_SECRET'));
    this.dir = new SqlDirectory(durableSql(ctx), hasSecret ? new SecretBox(env.AGENTHUB_SECRET!) : null, (event) =>
      broadcast(ctx, JSON.stringify(event)),
    );
  }

  /** Creates the demo group on first use. */
  private ready(): Promise<void> {
    this.seeded ??= seedIfEmpty(this.dir, (groupId, content) => groupStub(this.env, groupId).addSystemMessage(groupId, content))
      .then(() => undefined)
      .catch((err) => {
        this.seeded = undefined;
        throw err;
      });
    return this.seeded;
  }

  // ---- RPC (the Directory interface) ----

  async isEmpty() {
    return this.dir.isEmpty();
  }
  async listMembers() {
    await this.ready();
    return this.dir.listMembers();
  }
  async getMemberSecrets(id: string) {
    return this.dir.getMemberSecrets(id);
  }
  async createMember(input: NewMember) {
    await this.ready();
    return this.dir.createMember(input);
  }
  async deleteMember(id: string) {
    return this.dir.deleteMember(id);
  }
  async listGroups() {
    await this.ready();
    return this.dir.listGroups();
  }
  async getGroup(id: string) {
    return this.dir.getGroup(id);
  }
  async createGroup(name: string, memberIds: string[]) {
    await this.ready();
    return this.dir.createGroup(name, memberIds);
  }
  async setGroupMembers(id: string, memberIds: string[]) {
    return this.dir.setGroupMembers(id, memberIds);
  }
  async groupMembers(groupId: string) {
    return this.dir.groupMembers(groupId);
  }
  // Not gated on ready(): the demo group's welcome message calls this while seeding.
  async recordActivity(groupId: string, patch: ActivityPatch) {
    return this.dir.recordActivity(groupId, patch);
  }

  // ---- group-list WebSocket ----

  async fetch(request: Request) {
    return acceptSocket(this.ctx, request);
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    onSocketMessage(ws, message, this.env.AGENTHUB_TOKEN);
  }
  async webSocketClose(ws: WebSocket, code: number) {
    closeSocket(ws, code);
  }
}
