import {
  Coordinator,
  defaultRegistry,
  first,
  parseLimits,
  SqlRoom,
  type CoordinatorDirectory,
  type Message,
  type SqlDriver,
} from '@agenthub/core';
import { DurableObject } from 'cloudflare:workers';
import { acceptSocket, broadcast, closeSocket, durableSql, onSocketMessage } from './durable.js';
import { directoryStub, settings, type Env } from './env.js';

/**
 * One group: its messages, its relay queue and its chat WebSocket
 * (/ws/groups/:id). Relay work runs one reply per alarm, so each step gets a
 * fresh invocation and a restart never loses queued work.
 */
export class GroupDO extends DurableObject<Env> {
  private db: SqlDriver;
  private room: SqlRoom;
  private coordinator: Coordinator;
  private stepping = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = durableSql(ctx);
    this.db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.room = new SqlRoom(this.db);
    const limits = parseLimits(settings(env));
    this.coordinator = new Coordinator(
      this.room,
      directoryStub(env) as unknown as CoordinatorDirectory,
      defaultRegistry(limits),
      (event) => broadcast(ctx, JSON.stringify(event)),
      limits,
    );
  }

  /** Alarms carry no arguments, so the group id is stored on first use. */
  private remember(groupId: string) {
    this.db.run('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', 'groupId', groupId);
  }

  private groupId(): string | undefined {
    return first<{ value: string }>(this.db, 'SELECT value FROM meta WHERE key = ?', 'groupId')?.value;
  }

  private async schedule() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now());
  }

  // ---- RPC ----

  async post(groupId: string, content: string): Promise<Message> {
    this.remember(groupId);
    const { message, pending } = await this.coordinator.postUserMessage(groupId, content);
    if (pending) await this.schedule();
    return message;
  }

  async messages(groupId: string, limit: number, before?: string): Promise<Message[]> {
    return this.room.recentMessages(groupId, limit, before);
  }

  async addSystemMessage(groupId: string, content: string): Promise<Message> {
    this.remember(groupId);
    return this.coordinator.addSystemMessage(groupId, content);
  }

  async alarm() {
    const groupId = this.groupId();
    if (!groupId) return;
    if (this.stepping) {
      // Never run two steps at once; try again shortly.
      await this.ctx.storage.setAlarm(Date.now() + 1000);
      return;
    }
    this.stepping = true;
    try {
      if (await this.coordinator.step(groupId)) await this.ctx.storage.setAlarm(Date.now());
    } finally {
      this.stepping = false;
    }
  }

  // ---- chat WebSocket ----

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
