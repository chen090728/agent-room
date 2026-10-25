import {
  encodeChatFrames,
  Coordinator,
  defaultIntegrations,
  defaultRegistry,
  first,
  parseLimits,
  registerUpload,
  SqlRoom,
  UserError,
  type AppLanguage,
  type Attachment,
  type Notice,
  type CoordinatorDirectory,
  type FileStore,
  type Message,
  type SqlDriver,
} from '@agenthub/core';
import { DurableObject } from 'cloudflare:workers';
import { acceptSocket, agreedSocketLanguage, broadcast, closeSocket, durableSql, onSocketMessage } from './durable.js';
import { directoryStub, settings, type Env } from './env.js';
import { R2FileStore } from './files.js';

/**
 * One group: its messages, its relay queue and its chat WebSocket
 * (/ws/groups/:id). Relay work runs one reply per alarm, so each step gets a
 * fresh invocation and a restart never loses queued work.
 */
export class GroupDO extends DurableObject<Env> {
  private db: SqlDriver;
  private room: SqlRoom;
  private coordinator: Coordinator;
  private files: FileStore | null;
  private stepping = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = durableSql(ctx);
    this.db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.room = new SqlRoom(this.db);
    const limits = parseLimits(settings(env));
    this.files = env.FILES ? new R2FileStore(env.FILES) : null;
    this.coordinator = new Coordinator(
      this.room,
      directoryStub(env) as unknown as CoordinatorDirectory,
      defaultRegistry(limits),
      defaultIntegrations(),
      this.files,
      (event) => {
        const frames = encodeChatFrames(event);
        broadcast(ctx, frames.group);
        // The list socket lives on the directory object. The frame is already
        // JSON, so a later field such as `notice` is not rebuilt on the way.
        void directoryStub(env).publishChat(frames.list).catch(() => {});
      },
      limits,
      {
        // Jobs run on the directory object, which holds the bridges' sockets.
        run: async (bridgeId, job) => {
          const result = await directoryStub(env).runBridgeJob(bridgeId, job);
          if (!result.ok) throw new Error(result.error);
          return result.text;
        },
      },
    );
  }

  /** Alarms carry no arguments, so the group id is stored on first use. */
  private remember(groupId: string) {
    this.db.run('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)', 'groupId', groupId);
  }

  private groupId(): string | undefined {
    return first<{ value: string }>(this.db, 'SELECT value FROM meta WHERE key = ?', 'groupId')?.value;
  }

  /** Makes sure an alarm fires no later than `at`; an earlier one already set is kept. */
  private async schedule(at = Date.now()) {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > at) await this.ctx.storage.setAlarm(at);
  }

  // ---- RPC ----

  /** Expected failures (a bad attachment) come back as data: RPC drops custom error types. */
  async post(
    groupId: string,
    content: string,
    attachments: string[],
    lang?: AppLanguage | null,
  ): Promise<{ ok: true; message: Message } | { ok: false; status: number; error: string }> {
    this.remember(groupId);
    try {
      const language = lang ?? agreedSocketLanguage(this.ctx) ?? 'zh';
      const { message, pending } = await this.coordinator.postUserMessage(groupId, content, attachments, language);
      if (pending) await this.schedule();
      return { ok: true, message };
    } catch (err) {
      if (err instanceof UserError) return { ok: false, status: err.status, error: err.message };
      throw err;
    }
  }

  /** Records an uploaded file (and extracts a PDF's text); the bytes are already in R2. */
  async registerUpload(groupId: string, attachment: Attachment): Promise<Attachment> {
    if (!this.files) throw new Error('文件存储没有开通');
    this.remember(groupId);
    return registerUpload(this.room, this.files, groupId, attachment);
  }

  async messages(groupId: string, limit: number, before?: string): Promise<Message[]> {
    return this.room.recentMessages(groupId, limit, before);
  }

  /**
   * Durable Object RPC drops custom error types, so expected failures are
   * returned as data; the Worker turns them back into user-facing errors.
   */
  async cardAction(
    groupId: string,
    messageId: string,
    action: 'merge' | 'reject',
  ): Promise<{ ok: true; message: Message } | { ok: false; status: number; error: string; errorNotice?: Notice }> {
    this.remember(groupId);
    try {
      const message = await this.coordinator.cardAction(groupId, messageId, action);
      // A merge may have started following a deployment.
      const due = this.room.nextWatchDue(groupId);
      if (due !== undefined) await this.schedule(due);
      return { ok: true, message };
    } catch (err) {
      if (err instanceof UserError) return { ok: false, status: err.status, error: err.message, errorNotice: err.notice };
      throw err;
    }
  }

  async addSystemMessage(groupId: string, content: string, notice?: Notice): Promise<Message> {
    this.remember(groupId);
    return this.coordinator.addSystemMessage(groupId, content, undefined, notice);
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
      const more = await this.coordinator.step(groupId);
      // The same alarm also checks on deployments that are due.
      const due = await this.coordinator.pollWatches(groupId);
      const next = more ? Date.now() : due;
      if (next !== undefined) await this.ctx.storage.setAlarm(next);
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
