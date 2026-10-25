import {
  AUTH_TIMEOUT_MS,
  BridgeDispatcher,
  type BridgeJob,
  HELLO,
  parseBridgeAuth,
  parseLimits,
  UNAUTHORIZED_CODE,
  type GroupBinding,
  type NewIntegration,
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

interface BridgeAttachment {
  bridgeId?: string;
  openedAt: number;
}

const LIST_TAG = 'list';
const BRIDGE_TAG = 'bridge';

/**
 * The single directory of members and groups, plus the group-list WebSocket
 * (/ws). Group Durable Objects report activity here over RPC, and every change
 * is pushed to connected Apps.
 */
export class DirectoryDO extends DurableObject<Env> implements Directory {
  private dir: SqlDirectory;
  private seeded?: Promise<void>;
  private bridges: BridgeDispatcher;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const hasSecret = !secretProblems(settings(env)).some((p) => p.startsWith('AGENTHUB_SECRET'));
    this.dir = new SqlDirectory(durableSql(ctx), hasSecret ? new SecretBox(env.AGENTHUB_SECRET!) : null, (event) =>
      broadcast(ctx, JSON.stringify(event), LIST_TAG),
    );
    this.bridges = new BridgeDispatcher(
      {
        send: (bridgeId, data) => {
          const sockets = this.bridgeSockets(bridgeId);
          sockets.forEach((ws) => ws.send(data));
          return sockets.length > 0;
        },
        isOnline: (bridgeId) => this.bridgeSockets(bridgeId).length > 0,
        onTools: (bridgeId, tools) => void this.dir.setBridgeTools(bridgeId, tools),
      },
      parseLimits(settings(env)).bridgeTimeoutMs,
    );
  }

  /** Authenticated sockets of one bridge. Sockets that never authenticated are closed. */
  private bridgeSockets(bridgeId?: string, except?: WebSocket): WebSocket[] {
    const found: WebSocket[] = [];
    for (const ws of this.ctx.getWebSockets(BRIDGE_TAG)) {
      const att = ws.deserializeAttachment() as BridgeAttachment | null;
      if (!att?.bridgeId) {
        if (Date.now() - (att?.openedAt ?? 0) > AUTH_TIMEOUT_MS) closeSocket(ws, UNAUTHORIZED_CODE, 'auth timeout');
      } else if (ws !== except && (bridgeId === undefined || att.bridgeId === bridgeId)) found.push(ws);
    }
    return found;
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
  async setMemberAvatarImage(id: string, image: { groupId: string; fileId: string } | null) {
    return this.dir.setMemberAvatarImage(id, image);
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
  async listIntegrations() {
    return this.dir.listIntegrations();
  }
  async createIntegration(input: NewIntegration) {
    return this.dir.createIntegration(input);
  }
  async deleteIntegration(id: string) {
    return this.dir.deleteIntegration(id);
  }
  async getIntegration(id: string) {
    return this.dir.getIntegration(id);
  }
  async setBinding(groupId: string, binding: GroupBinding | null) {
    return this.dir.setBinding(groupId, binding);
  }
  // Not gated on ready(): the demo group's welcome message calls this while seeding.
  async recordActivity(groupId: string, patch: ActivityPatch) {
    return this.dir.recordActivity(groupId, patch);
  }

  async createPairing(memberId: string) {
    return this.dir.createPairing(memberId);
  }
  async completePairing(input: Parameters<Directory['completePairing']>[0]) {
    return this.dir.completePairing(input);
  }
  async authenticateBridge(bridgeId: string, token: string, tools?: string[]) {
    return this.dir.authenticateBridge(bridgeId, token, tools);
  }
  async getBridge(bridgeId: string) {
    return this.dir.getBridge(bridgeId);
  }
  async setBridgeTools(bridgeId: string, tools: string[]) {
    return this.dir.setBridgeTools(bridgeId, tools);
  }

  // ---- bridges ----

  async bridgeOnline(bridgeId: string): Promise<boolean> {
    return this.bridges.isOnline(bridgeId);
  }

  /** Runs a job on a bridge. Failures come back as data: RPC drops custom error types. */
  async runBridgeJob(bridgeId: string, job: BridgeJob): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
    try {
      return { ok: true, text: await this.bridges.run(bridgeId, job) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ---- WebSockets: the group list (/ws) and bridges (/ws/bridge) ----

  async fetch(request: Request) {
    const bridge = new URL(request.url).pathname === '/ws/bridge';
    return acceptSocket(this.ctx, request, bridge ? BRIDGE_TAG : LIST_TAG);
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (!this.ctx.getTags(ws).includes(BRIDGE_TAG)) return onSocketMessage(ws, message, this.env.AGENTHUB_TOKEN);

    const att = ws.deserializeAttachment() as BridgeAttachment | null;
    if (att?.bridgeId) return this.bridges.handleFrame(att.bridgeId, typeof message === 'string' ? message : '');
    // The first frame carries the credentials the bridge got when pairing.
    const auth = typeof message === 'string' ? parseBridgeAuth(message) : null;
    if (!auth || !(await this.dir.authenticateBridge(auth.bridgeId, auth.token))) return closeSocket(ws, UNAUTHORIZED_CODE, 'unauthorized');
    ws.serializeAttachment({ bridgeId: auth.bridgeId, openedAt: att?.openedAt ?? Date.now() } satisfies BridgeAttachment);
    ws.send(HELLO);
  }
  async webSocketClose(ws: WebSocket, code: number) {
    const att = ws.deserializeAttachment() as BridgeAttachment | null;
    closeSocket(ws, code);
    // Jobs on a bridge that has no other connection left cannot finish.
    if (att?.bridgeId && !this.bridgeSockets(att.bridgeId, ws).length) this.bridges.dropBridge(att.bridgeId);
  }
}
