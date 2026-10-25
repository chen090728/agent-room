import { first, runSchema, type SqlDriver } from './sql.js';
import { UserError, type Attachment, type Card, type Message, type RelayState, type SenderKind } from './types.js';

export interface NewMessage {
  groupId: string;
  senderKind: SenderKind;
  senderId: string | null;
  senderName: string;
  content: string;
  attachments?: Attachment[];
  card?: Card | null;
  /** Defaults to the new message's own id (an original message). */
  rootId?: string;
  hop?: number;
}

/** A relay chain started by one original message. */
export interface ChainState {
  relay: RelayState;
  depthNoticeSent: boolean;
}

/** A deployment card whose progress is being followed. */
export interface Watch {
  messageId: string;
  groupId: string;
  dueAt: number;
  polls: number;
  errors: number;
  triggered: boolean;
}

export interface Task {
  seq: number;
  rootId: string;
  memberId: string;
  triggerId: string;
  /** How many times work on this task has started (it is retried once after a crash). */
  attempts: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  sender_kind TEXT NOT NULL,
  sender_id TEXT,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  card_json TEXT,
  attachments_json TEXT,
  root_id TEXT NOT NULL,
  hop INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_group_seq ON messages (group_id, seq);
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  kind TEXT NOT NULL,
  extracted_text TEXT,
  message_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chains (
  root_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  state_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS watches (
  message_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  polls INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  triggered INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  root_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  trigger_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
)`;

interface MessageRow {
  id: string;
  group_id: string;
  sender_kind: string;
  sender_id: string | null;
  sender_name: string;
  content: string;
  card_json: string | null;
  attachments_json: string | null;
  root_id: string;
  hop: number;
  created_at: number;
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    groupId: row.group_id,
    senderKind: row.sender_kind as SenderKind,
    senderId: row.sender_id,
    senderName: row.sender_name,
    content: row.content,
    attachments: row.attachments_json ? JSON.parse(row.attachments_json) : [],
    card: row.card_json ? JSON.parse(row.card_json) : null,
    rootId: row.root_id,
    hop: row.hop,
    createdAt: row.created_at,
  };
}

/**
 * Messages plus the persisted relay queue of one or more groups. Chains are
 * processed strictly in the order they were started, so replies to an earlier
 * message never interleave with a later one.
 */
export class SqlRoom {
  constructor(private db: SqlDriver) {
    runSchema(db, SCHEMA);
    // Databases from before cards existed.
    for (const column of ['card_json', 'attachments_json']) {
      try {
        db.all(`SELECT ${column} FROM messages LIMIT 0`);
      } catch {
        db.run(`ALTER TABLE messages ADD COLUMN ${column} TEXT`);
      }
    }
  }

  // ---- messages ----

  addMessage(input: NewMessage): Message {
    const id = crypto.randomUUID();
    const seq = first<{ s: number }>(this.db, 'SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM messages')!.s;
    const message: Message = {
      id,
      groupId: input.groupId,
      senderKind: input.senderKind,
      senderId: input.senderId,
      senderName: input.senderName,
      content: input.content,
      attachments: input.attachments ?? [],
      card: input.card ?? null,
      rootId: input.rootId ?? id,
      hop: input.hop ?? 0,
      createdAt: Date.now(),
    };
    this.db.run(
      `INSERT INTO messages (id, group_id, seq, sender_kind, sender_id, sender_name, content, card_json, attachments_json, root_id, hop, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      message.groupId,
      seq,
      message.senderKind,
      message.senderId,
      message.senderName,
      message.content,
      message.card ? JSON.stringify(message.card) : null,
      message.attachments?.length ? JSON.stringify(message.attachments) : null,
      message.rootId,
      message.hop,
      message.createdAt,
    );
    return message;
  }

  // ---- uploads ----

  addUpload(groupId: string, attachment: Attachment, extractedText: string | null) {
    this.db.run(
      'INSERT INTO uploads (id, group_id, name, mime, size, kind, extracted_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      attachment.id,
      groupId,
      attachment.name,
      attachment.mime,
      attachment.size,
      attachment.kind,
      extractedText,
      Date.now(),
    );
  }

  /** The uploads a message may carry: they must exist in this group and not be used yet. */
  checkUploads(groupId: string, ids: string[]): Attachment[] {
    return ids.map((id) => {
      const row = first<{ id: string; name: string; mime: string; size: number; kind: string; message_id: string | null }>(
        this.db,
        'SELECT id, name, mime, size, kind, message_id FROM uploads WHERE id = ? AND group_id = ?',
        id,
        groupId,
      );
      if (!row) throw new UserError('有文件找不到了，请重新上传', 404);
      if (row.message_id) throw new UserError('这个文件已经发送过了', 409);
      return { id: row.id, name: row.name, mime: row.mime, size: row.size, kind: row.kind as Attachment['kind'] };
    });
  }

  claimUploads(ids: string[], messageId: string) {
    for (const id of ids) this.db.run('UPDATE uploads SET message_id = ? WHERE id = ?', messageId, id);
  }

  /** Text extracted from a PDF at upload time. */
  uploadText(id: string): string | null {
    return first<{ extracted_text: string | null }>(this.db, 'SELECT extracted_text FROM uploads WHERE id = ?', id)?.extracted_text ?? null;
  }

  // ---- deployment watches ----

  addWatch(messageId: string, groupId: string, dueAt: number) {
    this.db.run('INSERT OR REPLACE INTO watches (message_id, group_id, due_at) VALUES (?, ?, ?)', messageId, groupId, dueAt);
  }

  dueWatches(groupId: string, now: number): Watch[] {
    return this.db
      .all<any>('SELECT * FROM watches WHERE group_id = ? AND due_at <= ? ORDER BY due_at', groupId, now)
      .map((r) => ({ messageId: r.message_id, groupId: r.group_id, dueAt: r.due_at, polls: r.polls, errors: r.errors, triggered: !!r.triggered }));
  }

  updateWatch(w: Watch) {
    this.db.run('UPDATE watches SET due_at = ?, polls = ?, errors = ?, triggered = ? WHERE message_id = ?', w.dueAt, w.polls, w.errors, w.triggered ? 1 : 0, w.messageId);
  }

  removeWatch(messageId: string) {
    this.db.run('DELETE FROM watches WHERE message_id = ?', messageId);
  }

  /** When the next watch of this group is due, if any. */
  nextWatchDue(groupId: string): number | undefined {
    return first<{ d: number | null }>(this.db, 'SELECT MIN(due_at) AS d FROM watches WHERE group_id = ?', groupId)?.d ?? undefined;
  }

  /** Replaces the card of a message and returns the updated message. */
  updateCard(id: string, card: Card): Message | undefined {
    this.db.run('UPDATE messages SET card_json = ? WHERE id = ?', JSON.stringify(card), id);
    return this.getMessage(id);
  }

  getMessage(id: string): Message | undefined {
    const row = first<MessageRow>(this.db, 'SELECT * FROM messages WHERE id = ?', id);
    return row && toMessage(row);
  }

  /** Most recent messages in chronological order; `beforeId` pages further back. */
  recentMessages(groupId: string, limit: number, beforeId?: string): Message[] {
    const before = beforeId ? first<{ seq: number }>(this.db, 'SELECT seq FROM messages WHERE id = ?', beforeId) : undefined;
    return this.db
      .all<MessageRow>(
        'SELECT * FROM messages WHERE group_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?',
        groupId,
        before?.seq ?? Number.MAX_SAFE_INTEGER,
        limit,
      )
      .reverse()
      .map(toMessage);
  }

  /** Recent messages excluding system notices, used as model context. */
  contextMessages(groupId: string, limit: number): Message[] {
    return this.db
      .all<MessageRow>(
        `SELECT * FROM messages WHERE group_id = ? AND sender_kind != 'system' ORDER BY seq DESC LIMIT ?`,
        groupId,
        limit,
      )
      .reverse()
      .map(toMessage);
  }

  // ---- relay queue ----

  createChain(groupId: string, rootId: string, state: ChainState, tasks: { memberId: string; triggerId: string }[]) {
    this.db.transaction(() => {
      const ord = first<{ o: number }>(this.db, 'SELECT COALESCE(MAX(ord), 0) + 1 AS o FROM chains')!.o;
      this.db.run(
        'INSERT INTO chains (root_id, group_id, ord, state_json) VALUES (?, ?, ?, ?)',
        rootId,
        groupId,
        ord,
        JSON.stringify(state),
      );
      this.pushTasks(groupId, rootId, tasks);
    });
  }

  getChain(rootId: string): ChainState | undefined {
    const row = first<{ state_json: string }>(this.db, 'SELECT state_json FROM chains WHERE root_id = ?', rootId);
    return row && JSON.parse(row.state_json);
  }

  saveChain(rootId: string, state: ChainState) {
    this.db.run('UPDATE chains SET state_json = ? WHERE root_id = ?', JSON.stringify(state), rootId);
  }

  deleteChain(rootId: string) {
    this.db.transaction(() => {
      this.db.run('DELETE FROM tasks WHERE root_id = ?', rootId);
      this.db.run('DELETE FROM chains WHERE root_id = ?', rootId);
    });
  }

  /** The chain currently being worked on in a group. */
  headChain(groupId: string): ChainState | undefined {
    const row = first<{ state_json: string }>(
      this.db,
      'SELECT state_json FROM chains WHERE group_id = ? ORDER BY ord LIMIT 1',
      groupId,
    );
    return row && JSON.parse(row.state_json);
  }

  pushTasks(groupId: string, rootId: string, tasks: { memberId: string; triggerId: string }[]) {
    for (const t of tasks) {
      this.db.run(
        'INSERT INTO tasks (group_id, root_id, member_id, trigger_id) VALUES (?, ?, ?, ?)',
        groupId,
        rootId,
        t.memberId,
        t.triggerId,
      );
    }
  }

  /** Next task of the oldest chain in the group. */
  nextTask(groupId: string): Task | undefined {
    return first<Task>(
      this.db,
      `SELECT t.seq AS seq, t.root_id AS rootId, t.member_id AS memberId, t.trigger_id AS triggerId, t.attempts AS attempts
       FROM tasks t JOIN chains c ON c.root_id = t.root_id
       WHERE t.group_id = ? ORDER BY c.ord, t.seq LIMIT 1`,
      groupId,
    );
  }

  markAttempt(seq: number) {
    this.db.run('UPDATE tasks SET attempts = attempts + 1 WHERE seq = ?', seq);
  }

  /** Runs several room writes as one transaction. */
  atomically<T>(fn: () => T): T {
    return this.db.transaction(fn);
  }

  removeTask(seq: number) {
    this.db.run('DELETE FROM tasks WHERE seq = ?', seq);
  }

  dropTasks(rootId: string) {
    this.db.run('DELETE FROM tasks WHERE root_id = ?', rootId);
  }

  hasTasks(rootId: string): boolean {
    return !!first(this.db, 'SELECT 1 FROM tasks WHERE root_id = ?', rootId);
  }

  /** Chains that exist but have no tasks left (e.g. after a crash mid-step). */
  idleChains(groupId: string): string[] {
    return this.db
      .all<{ root_id: string }>(
        'SELECT root_id FROM chains c WHERE group_id = ? AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.root_id = c.root_id)',
        groupId,
      )
      .map((r) => r.root_id);
  }

  /** Groups that still have queued work, used to resume after a restart. */
  pendingGroups(): string[] {
    return this.db.all<{ group_id: string }>('SELECT DISTINCT group_id FROM chains').map((r) => r.group_id);
  }
}
